import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { app } from "../app";
import { cleanDatabase, createTestUser } from "./helpers";

describe("GET /api/admin/stats (Fase 6)", () => {
  beforeEach(cleanDatabase);

  it("recusa acesso de CUSTOMER e AGENT — só ADMIN entra", async () => {
    const customer = await createTestUser("CUSTOMER", "cliente@example.com");
    const agent = await createTestUser("AGENT", "agente@example.com");

    const asCustomer = await request(app)
      .get("/api/admin/stats")
      .set("Authorization", `Bearer ${customer.token}`);
    const asAgent = await request(app)
      .get("/api/admin/stats")
      .set("Authorization", `Bearer ${agent.token}`);

    expect(asCustomer.status).toBe(403);
    expect(asAgent.status).toBe(403);
  });

  it("ADMIN recebe as métricas agregadas, incluindo a contagem por status", async () => {
    const admin = await createTestUser("ADMIN", "admin@example.com");
    const customer = await createTestUser("CUSTOMER", "cliente@example.com");

    await request(app)
      .post("/api/tickets")
      .set("Authorization", `Bearer ${customer.token}`)
      .send({ title: "Ticket de teste", description: "Descrição com mais de dez caracteres." });

    const res = await request(app)
      .get("/api/admin/stats")
      .set("Authorization", `Bearer ${admin.token}`);

    expect(res.status).toBe(200);
    expect(res.body.ticketsByStatus).toEqual(
      expect.arrayContaining([expect.objectContaining({ status: "OPEN", count: 1 })])
    );
  });
});
