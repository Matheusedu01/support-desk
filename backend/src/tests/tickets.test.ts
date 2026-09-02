import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { app } from "../app";
import { cleanDatabase, createTestUser } from "./helpers";

const validTicketPayload = {
  title: "Não consigo fazer login",
  description: "Recebo erro 500 ao tentar entrar no app pelo celular.",
};

describe("Tickets — CRUD, visibilidade e BOLA (Fase 4)", () => {
  beforeEach(cleanDatabase);

  it("CUSTOMER cria um ticket e consegue ver o próprio ticket", async () => {
    const customer = await createTestUser("CUSTOMER", "cliente@example.com");

    const createRes = await request(app)
      .post("/api/tickets")
      .set("Authorization", `Bearer ${customer.token}`)
      .send(validTicketPayload);

    expect(createRes.status).toBe(201);

    const getRes = await request(app)
      .get(`/api/tickets/${createRes.body.ticket.id}`)
      .set("Authorization", `Bearer ${customer.token}`);

    expect(getRes.status).toBe(200);
    expect(getRes.body.ticket.title).toBe(validTicketPayload.title);
  });

  it("AGENT e ADMIN não conseguem criar ticket (só CUSTOMER)", async () => {
    const agent = await createTestUser("AGENT", "agente@example.com");
    const admin = await createTestUser("ADMIN", "admin@example.com");

    const asAgent = await request(app)
      .post("/api/tickets")
      .set("Authorization", `Bearer ${agent.token}`)
      .send(validTicketPayload);
    const asAdmin = await request(app)
      .post("/api/tickets")
      .set("Authorization", `Bearer ${admin.token}`)
      .send(validTicketPayload);

    expect(asAgent.status).toBe(403);
    expect(asAdmin.status).toBe(403);
  });

  // Este é o teste mais importante do projeto: prova que RBAC (papel certo
  // para a rota) não é suficiente sozinho — precisa da checagem por objeto
  // (canAccessTicket) para impedir um cliente de ler o ticket de outro.
  it("um CUSTOMER não pode ver o ticket de outro CUSTOMER (BOLA)", async () => {
    const dono = await createTestUser("CUSTOMER", "dono@example.com");
    const intruso = await createTestUser("CUSTOMER", "intruso@example.com");

    const createRes = await request(app)
      .post("/api/tickets")
      .set("Authorization", `Bearer ${dono.token}`)
      .send(validTicketPayload);

    const res = await request(app)
      .get(`/api/tickets/${createRes.body.ticket.id}`)
      .set("Authorization", `Bearer ${intruso.token}`);

    expect(res.status).toBe(403);
  });

  it("CUSTOMER só vê os próprios tickets na listagem, nunca os de outro cliente", async () => {
    const clienteA = await createTestUser("CUSTOMER", "clienteA@example.com");
    const clienteB = await createTestUser("CUSTOMER", "clienteB@example.com");

    await request(app)
      .post("/api/tickets")
      .set("Authorization", `Bearer ${clienteA.token}`)
      .send({ ...validTicketPayload, title: "Ticket do cliente A" });
    await request(app)
      .post("/api/tickets")
      .set("Authorization", `Bearer ${clienteB.token}`)
      .send({ ...validTicketPayload, title: "Ticket do cliente B" });

    const listaDoA = await request(app)
      .get("/api/tickets")
      .set("Authorization", `Bearer ${clienteA.token}`);

    expect(listaDoA.body.tickets).toHaveLength(1);
    expect(listaDoA.body.tickets[0].title).toBe("Ticket do cliente A");
  });

  describe("fila de atendimento (Fase 5)", () => {
    it("AGENT reivindica um ticket da fila, que passa a IN_PROGRESS", async () => {
      const customer = await createTestUser("CUSTOMER", "cliente@example.com");
      const agent = await createTestUser("AGENT", "agente@example.com");

      const createRes = await request(app)
        .post("/api/tickets")
        .set("Authorization", `Bearer ${customer.token}`)
        .send(validTicketPayload);

      const assignRes = await request(app)
        .post(`/api/tickets/${createRes.body.ticket.id}/assign`)
        .set("Authorization", `Bearer ${agent.token}`);

      expect(assignRes.status).toBe(200);
      expect(assignRes.body.ticket.assignedAgentId).toBe(agent.id);
      expect(assignRes.body.ticket.status).toBe("IN_PROGRESS");
    });

    it("um segundo AGENT não pode reivindicar um ticket que já é de outro agente", async () => {
      const customer = await createTestUser("CUSTOMER", "cliente@example.com");
      const agentA = await createTestUser("AGENT", "agenteA@example.com");
      const agentB = await createTestUser("AGENT", "agenteB@example.com");

      const createRes = await request(app)
        .post("/api/tickets")
        .set("Authorization", `Bearer ${customer.token}`)
        .send(validTicketPayload);
      const ticketId = createRes.body.ticket.id;

      await request(app)
        .post(`/api/tickets/${ticketId}/assign`)
        .set("Authorization", `Bearer ${agentA.token}`);

      const stealRes = await request(app)
        .post(`/api/tickets/${ticketId}/assign`)
        .set("Authorization", `Bearer ${agentB.token}`);

      expect(stealRes.status).toBe(403);
    });

    it("depois de atribuído, um agente diferente do responsável também não consegue mais VER o ticket", async () => {
      const customer = await createTestUser("CUSTOMER", "cliente@example.com");
      const agentA = await createTestUser("AGENT", "agenteA@example.com");
      const agentB = await createTestUser("AGENT", "agenteB@example.com");

      const createRes = await request(app)
        .post("/api/tickets")
        .set("Authorization", `Bearer ${customer.token}`)
        .send(validTicketPayload);
      const ticketId = createRes.body.ticket.id;

      await request(app)
        .post(`/api/tickets/${ticketId}/assign`)
        .set("Authorization", `Bearer ${agentA.token}`);

      const getRes = await request(app)
        .get(`/api/tickets/${ticketId}`)
        .set("Authorization", `Bearer ${agentB.token}`);

      expect(getRes.status).toBe(403);
    });

    it("só o agente responsável (ou ADMIN) pode mudar o status do ticket", async () => {
      const customer = await createTestUser("CUSTOMER", "cliente@example.com");
      const agentA = await createTestUser("AGENT", "agenteA@example.com");
      const agentB = await createTestUser("AGENT", "agenteB@example.com");
      const admin = await createTestUser("ADMIN", "admin@example.com");

      const createRes = await request(app)
        .post("/api/tickets")
        .set("Authorization", `Bearer ${customer.token}`)
        .send(validTicketPayload);
      const ticketId = createRes.body.ticket.id;

      await request(app)
        .post(`/api/tickets/${ticketId}/assign`)
        .set("Authorization", `Bearer ${agentA.token}`);

      const blockedRes = await request(app)
        .patch(`/api/tickets/${ticketId}/status`)
        .set("Authorization", `Bearer ${agentB.token}`)
        .send({ status: "RESOLVED" });
      expect(blockedRes.status).toBe(403);

      const okByOwnerRes = await request(app)
        .patch(`/api/tickets/${ticketId}/status`)
        .set("Authorization", `Bearer ${agentA.token}`)
        .send({ status: "RESOLVED" });
      expect(okByOwnerRes.status).toBe(200);
      expect(okByOwnerRes.body.ticket.status).toBe("RESOLVED");

      const okByAdminRes = await request(app)
        .patch(`/api/tickets/${ticketId}/status`)
        .set("Authorization", `Bearer ${admin.token}`)
        .send({ status: "CLOSED" });
      expect(okByAdminRes.status).toBe(200);
    });
  });

  it("cliente dono e agente responsável trocam mensagens; um terceiro cliente não pode responder", async () => {
    const customer = await createTestUser("CUSTOMER", "cliente@example.com");
    const agent = await createTestUser("AGENT", "agente@example.com");
    const outroCliente = await createTestUser("CUSTOMER", "outro@example.com");

    const createRes = await request(app)
      .post("/api/tickets")
      .set("Authorization", `Bearer ${customer.token}`)
      .send(validTicketPayload);
    const ticketId = createRes.body.ticket.id;

    await request(app)
      .post(`/api/tickets/${ticketId}/assign`)
      .set("Authorization", `Bearer ${agent.token}`);

    const replyFromAgent = await request(app)
      .post(`/api/tickets/${ticketId}/messages`)
      .set("Authorization", `Bearer ${agent.token}`)
      .send({ body: "Pode me passar mais detalhes do erro?" });
    expect(replyFromAgent.status).toBe(201);

    const replyFromOwner = await request(app)
      .post(`/api/tickets/${ticketId}/messages`)
      .set("Authorization", `Bearer ${customer.token}`)
      .send({ body: "Claro, acontece toda vez que abro o app." });
    expect(replyFromOwner.status).toBe(201);

    const blockedReply = await request(app)
      .post(`/api/tickets/${ticketId}/messages`)
      .set("Authorization", `Bearer ${outroCliente.token}`)
      .send({ body: "Também estou com esse problema!" });
    expect(blockedReply.status).toBe(403);
  });
});
