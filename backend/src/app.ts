import express, { NextFunction, Request, Response } from "express";
import cors from "cors";
import routes from "./routes";

// app.ts monta o Express sem ligar a porta de rede — isso permite que testes
// de integração importem `app` e façam requisições diretamente contra ele,
// sem depender de uma porta real estar aberta (ver GUIDE.md > Fase 0).
export const app = express();

app.use(cors());
app.use(express.json());

app.use("/api", routes);

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

// Middleware de erro global: rede de segurança final. Qualquer erro que
// chegue até aqui (via asyncHandler, ver middleware/asyncHandler.ts) é
// convertido numa resposta HTTP em vez de derrubar o processo. Precisa ter
// exatamente 4 parâmetros — é assim que o Express reconhece um error handler.
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err);
  res.status(500).json({ error: "Erro interno do servidor." });
});
