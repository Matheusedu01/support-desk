import { Request, Response } from "express";
import { prisma } from "../lib/prisma";

type AvgRow = { avg_value: number | string | null };

/**
 * Todo agregado simples (contagem por status, por prioridade, por agente) usa
 * `groupBy` do Prisma — é o jeito idiomático e type-safe de fazer GROUP BY
 * quando não precisa de JOIN nem de subquery correlacionada.
 *
 * As duas métricas de tempo (primeira resposta, resolução) NÃO dá pra
 * expressar bem com `groupBy`: cada uma depende de achar, PARA CADA ticket,
 * a primeira linha de outra tabela que satisfaz uma condição (primeira
 * mensagem de um agente; primeira mudança de status para RESOLVED) e depois
 * tirar a média da diferença de tempo. Isso é uma subquery correlacionada —
 * dá pra fazer com múltiplas queries e juntar em JavaScript, mas isso
 * significaria trazer para o processo Node todas as mensagens e todos os
 * logs de atividade só para descartar quase tudo depois. Um único SQL
 * agregado resolve isso sem sair do banco. É exatamente o tipo de query que
 * costuma cair em teste técnico de backend.
 */
export async function getDashboardStats(_req: Request, res: Response) {
  const [byStatus, byPriority, byAgentRaw, firstResponseRows, resolutionRows] = await Promise.all([
    prisma.ticket.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.ticket.groupBy({ by: ["priority"], _count: { _all: true } }),
    prisma.ticket.groupBy({
      by: ["assignedAgentId"],
      where: { assignedAgentId: { not: null } },
      _count: { _all: true },
    }),

    // Tempo médio (em minutos) até a primeira mensagem de um AGENT em cada
    // ticket. `EXISTS` garante que só entram no cálculo tickets que já
    // tiveram resposta — sem isso, tickets ainda sem resposta puxariam a
    // média para baixo com um "tempo zero" que não existiu de verdade.
    prisma.$queryRaw<AvgRow[]>`
      SELECT ROUND(AVG(
        EXTRACT(EPOCH FROM (
          (SELECT MIN(tm."createdAt")
           FROM "TicketMessage" tm
           JOIN "User" u ON u.id = tm."authorId"
           WHERE tm."ticketId" = t.id AND u.role = 'AGENT')
          - t."createdAt"
        )) / 60
      )::numeric, 1) AS avg_value
      FROM "Ticket" t
      WHERE EXISTS (
        SELECT 1 FROM "TicketMessage" tm
        JOIN "User" u ON u.id = tm."authorId"
        WHERE tm."ticketId" = t.id AND u.role = 'AGENT'
      )
    `,

    // Tempo médio (em horas) até o ticket ser marcado como RESOLVED, lendo o
    // ActivityLog. `metadata->>'to'` acessa um campo de dentro de uma coluna
    // JSON — útil quando parte do dado é estruturado o suficiente para virar
    // coluna própria, mas parte (aqui, o "de/para" de uma mudança de status)
    // não justifica uma tabela ou coluna dedicada.
    prisma.$queryRaw<AvgRow[]>`
      SELECT ROUND(AVG(
        EXTRACT(EPOCH FROM (
          (SELECT MIN(al."createdAt")
           FROM "ActivityLog" al
           WHERE al."ticketId" = t.id AND al.action = 'STATUS_CHANGED' AND al.metadata->>'to' = 'RESOLVED')
          - t."createdAt"
        )) / 3600
      )::numeric, 1) AS avg_value
      FROM "Ticket" t
      WHERE EXISTS (
        SELECT 1 FROM "ActivityLog" al
        WHERE al."ticketId" = t.id AND al.action = 'STATUS_CHANGED' AND al.metadata->>'to' = 'RESOLVED'
      )
    `,
  ]);

  // O agregado por agente só tem o id — buscamos os nomes numa segunda query
  // pequena (só os agentes que aparecem no resultado, não a tabela inteira).
  // Duas queries enxutas nesse caso são mais simples e mais baratas do que
  // tentar forçar um JOIN dentro do `groupBy` do Prisma, que não suporta isso.
  const agentIds = byAgentRaw
    .map((row) => row.assignedAgentId)
    .filter((id): id is string => id !== null);

  const agents = await prisma.user.findMany({
    where: { id: { in: agentIds } },
    select: { id: true, name: true },
  });
  const agentNameById = new Map(agents.map((agent) => [agent.id, agent.name]));

  // `AVG` sobre `NUMERIC` no Postgres pode voltar como string via node-postgres,
  // para não perder precisão silenciosamente — convertendo para Number aqui,
  // explicitamente, no único lugar que precisa se preocupar com isso.
  const avgMinutesToFirstResponse = toNumberOrNull(firstResponseRows[0]?.avg_value);
  const avgHoursToResolution = toNumberOrNull(resolutionRows[0]?.avg_value);

  return res.json({
    ticketsByStatus: byStatus.map((row) => ({ status: row.status, count: row._count._all })),
    ticketsByPriority: byPriority.map((row) => ({ priority: row.priority, count: row._count._all })),
    ticketsByAgent: byAgentRaw.map((row) => ({
      agentId: row.assignedAgentId,
      agentName: agentNameById.get(row.assignedAgentId!) ?? "Desconhecido",
      count: row._count._all,
    })),
    avgMinutesToFirstResponse,
    avgHoursToResolution,
  });
}

function toNumberOrNull(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  return typeof value === "number" ? value : Number(value);
}
