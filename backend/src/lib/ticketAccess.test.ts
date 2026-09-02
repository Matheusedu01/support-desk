import { describe, it, expect } from "vitest";
import { canAccessTicket } from "./ticketAccess";

/**
 * Teste unitário puro: nenhuma dependência de banco, servidor ou rede. Só
 * chama a função com objetos simples e checa o retorno. Roda em
 * milissegundos e não precisa de Postgres — por isso é o primeiro teste
 * deste projeto e o único que roda igual em qualquer máquina, sem setup.
 *
 * O que está sendo testado aqui é a regra de negócio mais importante do
 * projeto (ver GUIDE.md, Fase 4: BOLA) — vale testá-la isoladamente da
 * camada HTTP, sem precisar de uma requisição de verdade para confirmar
 * que a lógica está certa.
 */
describe("canAccessTicket", () => {
  const ticketNaFila = { customerId: "customer-1", assignedAgentId: null as string | null };
  const ticketDoAgenteA = { customerId: "customer-1", assignedAgentId: "agent-a" };

  it("ADMIN acessa qualquer ticket", () => {
    expect(canAccessTicket({ id: "qualquer-id", role: "ADMIN" }, ticketNaFila)).toBe(true);
    expect(canAccessTicket({ id: "qualquer-id", role: "ADMIN" }, ticketDoAgenteA)).toBe(true);
  });

  it("CUSTOMER acessa o próprio ticket", () => {
    expect(canAccessTicket({ id: "customer-1", role: "CUSTOMER" }, ticketNaFila)).toBe(true);
  });

  it("CUSTOMER não acessa o ticket de outro cliente", () => {
    expect(canAccessTicket({ id: "customer-2", role: "CUSTOMER" }, ticketNaFila)).toBe(false);
  });

  it("AGENT acessa um ticket ainda sem dono (fila)", () => {
    expect(canAccessTicket({ id: "agent-a", role: "AGENT" }, ticketNaFila)).toBe(true);
  });

  it("AGENT acessa um ticket que já é dele", () => {
    expect(canAccessTicket({ id: "agent-a", role: "AGENT" }, ticketDoAgenteA)).toBe(true);
  });

  it("AGENT não acessa um ticket atribuído a outro agente", () => {
    expect(canAccessTicket({ id: "agent-b", role: "AGENT" }, ticketDoAgenteA)).toBe(false);
  });
});
