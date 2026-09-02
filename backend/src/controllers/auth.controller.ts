import { Request, Response } from "express";
import bcrypt from "bcrypt";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { signAuthToken } from "../lib/jwt";

// Validação de entrada com zod: rejeita payloads malformados antes de tocar
// no banco. Note que `role` não é aceito aqui — se aceitássemos, qualquer
// pessoa poderia se registrar como ADMIN só editando o corpo da requisição.
// Contas de agente/admin são criadas por seed ou por um admin já existente.
const registerSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(8),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

const SALT_ROUNDS = 10;

export async function register(req: Request, res: Response) {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Dados inválidos.", details: parsed.error.flatten() });
  }

  const { name, email, password } = parsed.data;

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return res.status(409).json({ error: "Já existe uma conta com este email." });
  }

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

  const user = await prisma.user.create({
    data: { name, email, passwordHash, role: "CUSTOMER" },
  });

  const token = signAuthToken({ userId: user.id, role: user.role });

  return res.status(201).json({
    token,
    user: { id: user.id, name: user.name, email: user.email, role: user.role },
  });
}

export async function login(req: Request, res: Response) {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Dados inválidos." });
  }

  const { email, password } = parsed.data;

  const user = await prisma.user.findUnique({ where: { email } });

  // Mensagem de erro idêntica para "email não existe" e "senha errada" é de
  // propósito: se disséssemos "email não encontrado" especificamente, alguém
  // poderia usar o endpoint de login para descobrir quais emails têm conta.
  const invalidMessage = { error: "Email ou senha inválidos." };

  if (!user) {
    return res.status(401).json(invalidMessage);
  }

  const passwordMatches = await bcrypt.compare(password, user.passwordHash);
  if (!passwordMatches) {
    return res.status(401).json(invalidMessage);
  }

  const token = signAuthToken({ userId: user.id, role: user.role });

  return res.json({
    token,
    user: { id: user.id, name: user.name, email: user.email, role: user.role },
  });
}
