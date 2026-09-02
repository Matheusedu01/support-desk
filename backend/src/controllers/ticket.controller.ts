import { Request, Response } from "express";
import { z } from "zod";
import { Prisma, TicketPriority, TicketStatus } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { canAccessTicket } from "../lib/ticketAccess";

const createTicketSchema = z.object({
  title: z.string().min(3),
  description: z.string().min(10),
  priority: z.nativeEnum(TicketPriority).optional(),
});

const listQuerySchema = z.object({
  status: z.nativeEnum(TicketStatus).optional(),
});

const messageSchema = z.object({
  body: z.string().min(1),
});

const assignSchema = z.object({
  // Só ADMIN precisa informar isso — AGENT sempre reivindica para si mesmo.
  agentId: z.string().uuid().optional(),
});

const statusSchema = z.object({
  status: z.nativeEnum(TicketStatus),
});

const ticketListInclude = {
  customer: { select: { id: true, name: true, email: true } },
  assignedAgent: { select: { id: true, name: true } },
} satisfies Prisma.TicketInclude;

export async function createTicket(req: Request, res: Response) {
  const parsed = createTicketSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Dados inválidos.", details: parsed.error.flatten() });
  }

  const ticket = await prisma.ticket.create({
    data: {
      title: parsed.data.title,
      description: parsed.data.description,
      priority: parsed.data.priority ?? "MEDIUM",
      customerId: req.user!.id,
    },
  });

  return res.status(201).json({ ticket });
}

/**
 * A visibilidade por papel acontece AQUI, na cláusula `where` da query — não
 * é um filtro aplicado depois de buscar tudo do banco. Isso importa por dois
 * motivos: performance (o banco só lê as linhas relevantes) e segurança (não
 * existe uma lista "completa" passando pela memória do processo em nenhum
 * momento, então um bug de serialização não pode vazar tickets de terceiros).
 */
export async function listTickets(req: Request, res: Response) {
  const parsedQuery = listQuerySchema.safeParse(req.query);
  if (!parsedQuery.success) {
    return res.status(400).json({ error: "Filtro de status inválido." });
  }

  const { role, id } = req.user!;

  let roleFilter: Prisma.TicketWhereInput;
  switch (role) {
    case "CUSTOMER":
      roleFilter = { customerId: id };
      break;
    case "AGENT":
      // A "fila" do agente: tickets ainda sem dono, mais os que já são dele.
      roleFilter = { OR: [{ assignedAgentId: id }, { assignedAgentId: null }] };
      break;
    case "ADMIN":
      roleFilter = {};
      break;
  }

  const where: Prisma.TicketWhereInput = parsedQuery.data.status
    ? { AND: [roleFilter, { status: parsedQuery.data.status }] }
    : roleFilter;

  const tickets = await prisma.ticket.findMany({
    where,
    include: ticketListInclude,
    orderBy: { createdAt: "desc" },
  });

  return res.json({ tickets });
}

export async function getTicket(req: Request, res: Response) {
  const ticket = await prisma.ticket.findUnique({
    where: { id: req.params.id },
    include: {
      ...ticketListInclude,
      messages: {
        orderBy: { createdAt: "asc" },
        include: { author: { select: { id: true, name: true, role: true } } },
      },
    },
  });

  if (!ticket) {
    return res.status(404).json({ error: "Ticket não encontrado." });
  }

  if (!canAccessTicket(req.user!, ticket)) {
    return res.status(403).json({ error: "Você não tem acesso a este ticket." });
  }

  return res.json({ ticket });
}

export async function addMessage(req: Request, res: Response) {
  const parsed = messageSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Mensagem não pode ser vazia." });
  }

  const ticket = await prisma.ticket.findUnique({ where: { id: req.params.id } });
  if (!ticket) {
    return res.status(404).json({ error: "Ticket não encontrado." });
  }

  if (!canAccessTicket(req.user!, ticket)) {
    return res.status(403).json({ error: "Você não tem acesso a este ticket." });
  }

  // As duas escritas (a mensagem e o registro de auditoria) precisam ser
  // atômicas: se o log falhar, não queremos uma mensagem "fantasma" sem
  // rastro nenhum. `$transaction` garante que ou as duas acontecem, ou nenhuma.
  const message = await prisma.$transaction(async (tx) => {
    const created = await tx.ticketMessage.create({
      data: { ticketId: ticket.id, authorId: req.user!.id, body: parsed.data.body },
      include: { author: { select: { id: true, name: true, role: true } } },
    });

    await tx.activityLog.create({
      data: { ticketId: ticket.id, userId: req.user!.id, action: "MESSAGE_ADDED" },
    });

    return created;
  });

  return res.status(201).json({ message });
}

/**
 * Reivindicar (AGENT) ou atribuir (ADMIN) um ticket a um agente.
 *
 * A checagem aqui é DIFERENTE de `canAccessTicket` — aquela função responde
 * "posso ver este ticket?" (mais permissiva: inclui a fila inteira para
 * qualquer agente). Esta responde "posso agir sobre este ticket?", que é
 * mais restrita: um agente só pode reivindicar um ticket livre ou que já é
 * dele — não pode "roubar" um ticket que outro agente já assumiu. Ver
 * (também) visão geral e cuidado com esse tipo de bug em Fase 4.
 */
export async function assignTicket(req: Request, res: Response) {
  const parsed = assignSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({ error: "Dados inválidos." });
  }

  const ticket = await prisma.ticket.findUnique({ where: { id: req.params.id } });
  if (!ticket) {
    return res.status(404).json({ error: "Ticket não encontrado." });
  }

  const { role, id: userId } = req.user!;
  let targetAgentId: string;

  if (role === "ADMIN") {
    if (!parsed.data.agentId) {
      return res.status(400).json({ error: "Informe agentId para atribuir este ticket." });
    }

    const agent = await prisma.user.findUnique({ where: { id: parsed.data.agentId } });
    if (!agent || agent.role !== "AGENT") {
      return res.status(400).json({ error: "agentId não corresponde a um agente válido." });
    }

    targetAgentId = agent.id;
  } else {
    // role === "AGENT" (garantido pelo authorize() na rota)
    if (ticket.assignedAgentId && ticket.assignedAgentId !== userId) {
      return res.status(403).json({ error: "Este ticket já está atribuído a outro agente." });
    }

    targetAgentId = userId;
  }

  const updated = await prisma.$transaction(async (tx) => {
    const t = await tx.ticket.update({
      where: { id: ticket.id },
      data: {
        assignedAgentId: targetAgentId,
        // Reivindicar um ticket ainda OPEN já o move para "em andamento" —
        // evita o passo manual extra de "assign" + "status" para o caso comum.
        status: ticket.status === "OPEN" ? "IN_PROGRESS" : ticket.status,
      },
    });

    await tx.activityLog.create({
      data: {
        ticketId: ticket.id,
        userId,
        action: "ASSIGNED",
        metadata: { agentId: targetAgentId },
      },
    });

    return t;
  });

  return res.json({ ticket: updated });
}

/**
 * Mudar o status de um ticket (ex: IN_PROGRESS -> RESOLVED). Só o agente
 * responsável por aquele ticket específico ou um ADMIN podem fazer isso —
 * um agente não pode fechar o ticket de outro agente, mesmo estando na fila
 * como leitura (de novo, "posso ver" != "posso agir").
 */
export async function updateTicketStatus(req: Request, res: Response) {
  const parsed = statusSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Status inválido." });
  }

  const ticket = await prisma.ticket.findUnique({ where: { id: req.params.id } });
  if (!ticket) {
    return res.status(404).json({ error: "Ticket não encontrado." });
  }

  const { role, id: userId } = req.user!;
  if (role === "AGENT" && ticket.assignedAgentId !== userId) {
    return res.status(403).json({ error: "Só o agente responsável por este ticket pode mudar o status." });
  }

  if (ticket.status === parsed.data.status) {
    return res.status(400).json({ error: "O ticket já está neste status." });
  }

  const updated = await prisma.$transaction(async (tx) => {
    const t = await tx.ticket.update({
      where: { id: ticket.id },
      data: { status: parsed.data.status },
    });

    await tx.activityLog.create({
      data: {
        ticketId: ticket.id,
        userId,
        action: "STATUS_CHANGED",
        metadata: { from: ticket.status, to: parsed.data.status },
      },
    });

    return t;
  });

  return res.json({ ticket: updated });
}
