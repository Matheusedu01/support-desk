import { Request, Response, NextFunction } from "express";
import { Role } from "@prisma/client";
import { verifyAuthToken } from "../lib/jwt";

// Estende o tipo Request do Express para incluir os dados do usuário autenticado.
// Sem isso, `req.user` não teria tipo nenhum no TypeScript.
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        role: Role;
      };
    }
  }
}

/**
 * Responde apenas "quem é você?".
 * Lê o header `Authorization: Bearer <token>`, valida o JWT e anexa
 * `req.user`. Se o token estiver ausente ou inválido, interrompe a
 * requisição aqui — o controller nunca chega a ser executado.
 */
export function authenticate(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;

  if (!header || !header.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Token de autenticação ausente." });
  }

  const token = header.slice("Bearer ".length);

  try {
    const payload = verifyAuthToken(token);
    req.user = { id: payload.userId, role: payload.role };
    next();
  } catch {
    return res.status(401).json({ error: "Token de autenticação inválido ou expirado." });
  }
}

/**
 * Responde "você, especificamente, pode fazer isso?".
 * Deve ser usado SEMPRE depois de `authenticate` na cadeia de middlewares,
 * já que depende de `req.user` já estar preenchido.
 *
 * Uso: router.get("/admin/stats", authenticate, authorize("ADMIN"), handler)
 */
export function authorize(...allowedRoles: Role[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      // Isso só aconteceria se authorize fosse usado sem authenticate antes —
      // um erro de programação, não de uso normal da API.
      return res.status(401).json({ error: "Requisição não autenticada." });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: "Você não tem permissão para executar esta ação." });
    }

    next();
  };
}
