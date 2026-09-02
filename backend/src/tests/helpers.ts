import bcrypt from "bcrypt";
import { Role } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { signAuthToken } from "../lib/jwt";

/**
 * Limpa todas as tabelas entre testes, na ordem que respeita as chaves
 * estrangeiras (filhos antes dos pais). Cada teste de integração começa de
 * um banco vazio e conhecido — sem isso, um teste poderia passar (ou
 * falhar) dependendo de dado deixado por outro teste rodado antes, o que é
 * exatamente o tipo de teste "flaky" que ninguém confia.
 */
export async function cleanDatabase() {
  await prisma.activityLog.deleteMany();
  await prisma.ticketTag.deleteMany();
  await prisma.ticketMessage.deleteMany();
  await prisma.ticket.deleteMany();
  await prisma.tag.deleteMany();
  await prisma.user.deleteMany();
}

export interface TestUser {
  id: string;
  email: string;
  token: string;
}

/**
 * Cria um usuário direto no banco (via Prisma), pulando o endpoint HTTP de
 * registro. Isso é deliberado: o endpoint de registro só cria CUSTOMER (ver
 * Fase 2), então não haveria como criar um AGENT/ADMIN de teste por ali —
 * é o mesmo motivo pelo qual existe o script de seed para desenvolvimento.
 * O fluxo de registro em si (incluindo essa restrição) é testado à parte,
 * em auth.test.ts, batendo na rota de verdade.
 */
export async function createTestUser(role: Role, email: string): Promise<TestUser> {
  // Custo baixo de bcrypt só em teste — reduz o tempo de cada suíte sem
  // afetar a segurança real, já que nenhuma senha de teste protege nada.
  const passwordHash = await bcrypt.hash("password123", 4);

  const user = await prisma.user.create({
    data: { name: `Usuário de teste (${role})`, email, passwordHash, role },
  });

  const token = signAuthToken({ userId: user.id, role: user.role });

  return { id: user.id, email: user.email, token };
}
