import jwt from "jsonwebtoken";
import { Role } from "@prisma/client";

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    // Falhar cedo e alto: um servidor rodando sem segredo de assinatura é um
    // servidor rodando com autenticação quebrada, e isso não deve passar despercebido.
    throw new Error("JWT_SECRET não está definido. Confira o seu arquivo .env.");
  }
  return secret;
}

const JWT_SECRET = getJwtSecret();

export interface AuthTokenPayload {
  userId: string;
  role: Role;
}

export function signAuthToken(payload: AuthTokenPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "7d" });
}

export function verifyAuthToken(token: string): AuthTokenPayload {
  return jwt.verify(token, JWT_SECRET) as unknown as AuthTokenPayload;
}
