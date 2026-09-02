import { PrismaClient } from "@prisma/client";

// Uma única instância de PrismaClient reutilizada em toda a aplicação.
// Criar um PrismaClient por requisição esgotaria o pool de conexões do banco
// rapidamente sob carga — por isso ele vive aqui como um singleton simples.
export const prisma = new PrismaClient();
