import { Request, Response } from "express";
import { prisma } from "../lib/prisma";

// Qualquer papel autenticado pode listar as tags existentes — é só uma
// lista de nomes, sem nenhum dado sensível, usada para sugerir tags já
// criadas antes de digitar uma nova (evita "bug", "Bug" e "BUG" como três
// tags diferentes por erro de digitação).
export async function listTags(_req: Request, res: Response) {
  const tags = await prisma.tag.findMany({ orderBy: { name: "asc" } });
  return res.json({ tags });
}
