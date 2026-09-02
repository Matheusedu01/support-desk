import rateLimit, { Options } from "express-rate-limit";

/**
 * Fábrica, não uma instância única exportada — de propósito. Isso permite
 * que `rateLimit.test.ts` crie sua própria cópia com um `max` bem menor e
 * determinístico (ver o teste) para provar o comportamento de verdade
 * (bloqueia depois de N tentativas) sem depender do valor real de produção
 * nem de disparar dezenas de requisições numa suíte que é rápida de propósito.
 *
 * Por padrão, um único limitador é compartilhado entre `/register` e
 * `/login` (ver auth.routes.ts) — a contagem por IP soma as tentativas nas
 * duas rotas, porque tanto tentar adivinhar senha quanto martelar criação de
 * conta são o mesmo tipo de abuso vindo do mesmo IP.
 */
export function createAuthLimiter(overrides: Partial<Options> = {}) {
  return rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    // Mesma convenção de erro do resto da API (ver app.ts e os controllers):
    // sempre `{ error: "mensagem" }`, nunca um formato diferente só porque
    // veio de um middleware de terceiros.
    message: { error: "Muitas tentativas. Tente novamente em alguns minutos." },
    ...overrides,
  });
}
