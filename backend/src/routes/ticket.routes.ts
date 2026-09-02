import { Router } from "express";
import { authenticate, authorize } from "../middleware/auth";
import { asyncHandler } from "../middleware/asyncHandler";
import {
  createTicket,
  listTickets,
  getTicket,
  addMessage,
  assignTicket,
  updateTicketStatus,
  addTagToTicket,
  removeTagFromTicket,
} from "../controllers/ticket.controller";

const router = Router();

// Toda rota de ticket exige estar logado — aplicado uma vez aqui em vez de
// repetir `authenticate` em cada linha abaixo.
router.use(authenticate);

// Só CUSTOMER abre ticket. Agentes/admin não criam tickets para si mesmos
// neste fluxo — eles atendem os que os clientes abrem (ver Fase 5).
router.post("/", authorize("CUSTOMER"), asyncHandler(createTicket));

// Sem `authorize()` aqui: os três papéis podem listar/ver tickets, só que
// cada um vê um subconjunto diferente. Essa diferença é resolvida dentro do
// controller (ver comentário em listTickets), não no middleware.
router.get("/", asyncHandler(listTickets));
router.get("/:id", asyncHandler(getTicket));
router.post("/:id/messages", asyncHandler(addMessage));

// Reivindicar/atribuir e mudar status são ações operacionais de quem atende
// o ticket — só AGENT e ADMIN, nunca CUSTOMER.
router.post("/:id/assign", authorize("AGENT", "ADMIN"), asyncHandler(assignTicket));
router.patch("/:id/status", authorize("AGENT", "ADMIN"), asyncHandler(updateTicketStatus));

// Tags são ferramenta de triagem interna — só quem atende o ticket gerencia.
router.post("/:id/tags", authorize("AGENT", "ADMIN"), asyncHandler(addTagToTicket));
router.delete("/:id/tags/:tagId", authorize("AGENT", "ADMIN"), asyncHandler(removeTagFromTicket));

export default router;
