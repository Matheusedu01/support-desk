import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { app } from "../app";
import { cleanDatabase } from "./helpers";

/**
 * Teste de integração: bate na API de verdade (via supertest, importando
 * `app` diretamente — ver GUIDE.md, Fase 0, sobre por que app.ts e
 * server.ts são arquivos separados) e confere o que sai do outro lado,
 * incluindo o banco. Precisa de um Postgres real rodando (ver GUIDE.md,
 * Fase 8, para como apontar isso para um banco de teste separado).
 */
describe("POST /api/auth/register e /api/auth/login", () => {
  beforeEach(cleanDatabase);

  it("registra um novo usuário como CUSTOMER e devolve um token", async () => {
    const res = await request(app).post("/api/auth/register").send({
      name: "Ana",
      email: "ana@example.com",
      password: "senha1234",
    });

    expect(res.status).toBe(201);
    expect(res.body.user.role).toBe("CUSTOMER");
    expect(res.body.token).toEqual(expect.any(String));
  });

  it("recusa registro com email já existente", async () => {
    await request(app)
      .post("/api/auth/register")
      .send({ name: "Ana", email: "ana@example.com", password: "senha1234" });

    const res = await request(app)
      .post("/api/auth/register")
      .send({ name: "Outra Ana", email: "ana@example.com", password: "outrasenha" });

    expect(res.status).toBe(409);
  });

  // Regressão direta da decisão em auth.controller.ts: o schema de validação
  // não aceita `role` no corpo do registro, então mesmo alguém enviando isso
  // de propósito continua virando CUSTOMER.
  it("ignora um campo 'role' enviado no corpo do registro", async () => {
    const res = await request(app).post("/api/auth/register").send({
      name: "Tentando virar admin",
      email: "tentativa@example.com",
      password: "senha1234",
      role: "ADMIN",
    });

    expect(res.body.user.role).toBe("CUSTOMER");
  });

  it("faz login com credenciais corretas", async () => {
    await request(app)
      .post("/api/auth/register")
      .send({ name: "Ana", email: "ana@example.com", password: "senha1234" });

    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "ana@example.com", password: "senha1234" });

    expect(res.status).toBe(200);
    expect(res.body.token).toEqual(expect.any(String));
  });

  // Regressão do comentário em auth.controller.ts: a mensagem de erro tem
  // que ser IDÊNTICA para "senha errada" e "email não existe" — se algum dia
  // alguém "melhorar a mensagem de erro" e diferenciar os dois casos, esse
  // teste quebra e avisa que a proteção contra enumeração de email foi perdida.
  it("recusa senha errada e email inexistente com a MESMA mensagem", async () => {
    await request(app)
      .post("/api/auth/register")
      .send({ name: "Ana", email: "ana@example.com", password: "senha1234" });

    const senhaErrada = await request(app)
      .post("/api/auth/login")
      .send({ email: "ana@example.com", password: "senha-errada" });

    const emailInexistente = await request(app)
      .post("/api/auth/login")
      .send({ email: "ninguem@example.com", password: "senha-errada" });

    expect(senhaErrada.status).toBe(401);
    expect(emailInexistente.status).toBe(401);
    expect(senhaErrada.body.error).toBe(emailInexistente.body.error);
  });
});
