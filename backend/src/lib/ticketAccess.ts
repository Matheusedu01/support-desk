import { Role } from "@prisma/client";

type MinimalTicket = {
  customerId: string;
  assignedAgentId: string | null;
};

type MinimalUser = {
  id: string;
  role: Role;
};

/**
 * Checagem de acesso NO NÍVEL DO OBJETO — diferente do `authorize()` em
 * middleware/auth.ts, que só sabe responder "esse papel pode usar esta rota?".
 *
 * Ter o papel certo não significa ter direito a QUALQUER ticket daquele tipo:
 * um CUSTOMER autenticado ainda não pode ler o ticket de outro cliente só
 * porque a rota aceita clientes. Faltar essa checagem é exatamente a falha
 * nº 1 do OWASP API Security Top 10 (Broken Object Level Authorization —
 * "BOLA"): a rota está protegida, mas o registro específico não é validado
 * contra quem está pedindo. Por isso essa função existe separada do
 * middleware — ela roda DEPOIS que o ticket já foi carregado do banco,
 * porque só aí dá pra comparar `ticket.customerId` com `user.id`.
 *
 * Regras de negócio:
 * - ADMIN acessa qualquer ticket.
 * - CUSTOMER só acessa tickets que ele mesmo abriu.
 * - AGENT acessa tickets ainda não atribuídos (fila) ou atribuídos a ele —
 *   um agente não deve conseguir ler/responder um ticket que já é de outro
 *   agente.
 */
export function canAccessTicket(user: MinimalUser, ticket: MinimalTicket): boolean {
  switch (user.role) {
    case "ADMIN":
      return true;
    case "CUSTOMER":
      return ticket.customerId === user.id;
    case "AGENT":
      return ticket.assignedAgentId === null || ticket.assignedAgentId === user.id;
    default:
      return false;
  }
}
