import { Request, Response, NextFunction, RequestHandler } from "express";

/**
 * Express 4 não captura rejeições de Promise lançadas dentro de um handler
 * async — o erro vira uma "unhandled rejection" e, a partir do Node 15,
 * isso derruba o processo inteiro (não apenas a requisição). Esse wrapper
 * garante que qualquer erro assíncrono caia no `next(err)`, chegando até o
 * middleware de erro global (ver app.ts) em vez de matar o servidor.
 *
 * Uso: router.post("/rota", asyncHandler(meuController))
 */
export function asyncHandler(handler: RequestHandler): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}
