import { describe, it, expect } from "vitest";
import express from "express";
import request from "supertest";
import { createAuthLimiter } from "./rateLimit";

/**
 * Teste unitário puro: nenhuma dependência de Postgres, nem do resto da
 * aplicação — só um app Express descartável, só para esta suíte, com o
 * limitador de verdade montado nele. Isso prova o comportamento de bloqueio
 * sem precisar disparar dezenas de requisições reais contra /auth/login
 * (o que, além de lento, faria este teste depender do valor de produção
 * `max: 10` em vez de um número pequeno e controlado).
 */
describe("createAuthLimiter", () => {
  it("permite requisições dentro do limite e bloqueia com 429 acima dele", async () => {
    const app = express();
    // `max: 3` só para este teste — não é o valor real usado em produção
    // (10 por 15 minutos, ver auth.routes.ts).
    app.use(createAuthLimiter({ max: 3 }));
    app.get("/ping", (_req, res) => res.json({ ok: true }));

    for (let i = 0; i < 3; i++) {
      const res = await request(app).get("/ping");
      expect(res.status).toBe(200);
    }

    const blocked = await request(app).get("/ping");
    expect(blocked.status).toBe(429);
    expect(blocked.body.error).toMatch(/muitas tentativas/i);
  });
});
