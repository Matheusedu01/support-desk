import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { app } from "../app";
import { cleanDatabase, createTestUser } from "./helpers";

const validTicketPayload = {
  title: "Não consigo fazer login",
  description: "Recebo erro 500 ao tentar entrar no app pelo celular.",
};

describe("Tags em tickets", () => {
  beforeEach(cleanDatabase);

  it("AGENT adiciona uma tag nova a um ticket ainda na fila", async () => {
    const customer = await createTestUser("CUSTOMER", "cliente@example.com");
    const agent = await createTestUser("AGENT", "agente@example.com");

    const createRes = await request(app)
      .post("/api/tickets")
      .set("Authorization", `Bearer ${customer.token}`)
      .send(validTicketPayload);
    const ticketId = createRes.body.ticket.id;

    const tagRes = await request(app)
      .post(`/api/tickets/${ticketId}/tags`)
      .set("Authorization", `Bearer ${agent.token}`)
      .send({ name: "bug" });

    expect(tagRes.status).toBe(201);
    expect(tagRes.body.tag.name).toBe("bug");

    const getRes = await request(app)
      .get(`/api/tickets/${ticketId}`)
      .set("Authorization", `Bearer ${agent.token}`);
    expect(getRes.body.ticket.tags).toEqual([expect.objectContaining({ name: "bug" })]);
  });

  it("adicionar a mesma tag duas vezes é idempotente (não duplica)", async () => {
    const customer = await createTestUser("CUSTOMER", "cliente@example.com");
    const agent = await createTestUser("AGENT", "agente@example.com");

    const createRes = await request(app)
      .post("/api/tickets")
      .set("Authorization", `Bearer ${customer.token}`)
      .send(validTicketPayload);
    const ticketId = createRes.body.ticket.id;

    await request(app)
      .post(`/api/tickets/${ticketId}/tags`)
      .set("Authorization", `Bearer ${agent.token}`)
      .send({ name: "urgente" });
    await request(app)
      .post(`/api/tickets/${ticketId}/tags`)
      .set("Authorization", `Bearer ${agent.token}`)
      .send({ name: "urgente" });

    const getRes = await request(app)
      .get(`/api/tickets/${ticketId}`)
      .set("Authorization", `Bearer ${agent.token}`);
    expect(getRes.body.ticket.tags).toHaveLength(1);
  });

  it("CUSTOMER não pode adicionar tag (só AGENT/ADMIN)", async () => {
    const customer = await createTestUser("CUSTOMER", "cliente@example.com");

    const createRes = await request(app)
      .post("/api/tickets")
      .set("Authorization", `Bearer ${customer.token}`)
      .send(validTicketPayload);
    const ticketId = createRes.body.ticket.id;

    const tagRes = await request(app)
      .post(`/api/tickets/${ticketId}/tags`)
      .set("Authorization", `Bearer ${customer.token}`)
      .send({ name: "bug" });

    expect(tagRes.status).toBe(403);
  });

  it("um AGENT não pode marcar tag num ticket que já é de outro agente (mesma regra de visibilidade da Fase 4)", async () => {
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

    const tagRes = await request(app)
      .post(`/api/tickets/${ticketId}/tags`)
      .set("Authorization", `Bearer ${agentB.token}`)
      .send({ name: "bug" });

    expect(tagRes.status).toBe(403);
  });

  it("AGENT remove uma tag do ticket", async () => {
    const customer = await createTestUser("CUSTOMER", "cliente@example.com");
    const agent = await createTestUser("AGENT", "agente@example.com");

    const createRes = await request(app)
      .post("/api/tickets")
      .set("Authorization", `Bearer ${customer.token}`)
      .send(validTicketPayload);
    const ticketId = createRes.body.ticket.id;

    const tagRes = await request(app)
      .post(`/api/tickets/${ticketId}/tags`)
      .set("Authorization", `Bearer ${agent.token}`)
      .send({ name: "bug" });
    const tagId = tagRes.body.tag.id;

    const deleteRes = await request(app)
      .delete(`/api/tickets/${ticketId}/tags/${tagId}`)
      .set("Authorization", `Bearer ${agent.token}`);
    expect(deleteRes.status).toBe(204);

    const getRes = await request(app)
      .get(`/api/tickets/${ticketId}`)
      .set("Authorization", `Bearer ${agent.token}`);
    expect(getRes.body.ticket.tags).toEqual([]);
  });

  it("GET /api/tags lista as tags já criadas, para qualquer papel autenticado", async () => {
    const customer = await createTestUser("CUSTOMER", "cliente@example.com");
    const agent = await createTestUser("AGENT", "agente@example.com");

    const createRes = await request(app)
      .post("/api/tickets")
      .set("Authorization", `Bearer ${customer.token}`)
      .send(validTicketPayload);
    await request(app)
      .post(`/api/tickets/${createRes.body.ticket.id}/tags`)
      .set("Authorization", `Bearer ${agent.token}`)
      .send({ name: "bug" });

    const listRes = await request(app).get("/api/tags").set("Authorization", `Bearer ${customer.token}`);
    expect(listRes.status).toBe(200);
    expect(listRes.body.tags).toEqual(expect.arrayContaining([expect.objectContaining({ name: "bug" })]));
  });
});
