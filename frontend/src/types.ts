// Espelha os enums e formatos de resposta do backend (ver
// backend/prisma/schema.prisma). Não existe geração automática de tipos
// entre os dois projetos aqui de propósito — é simples o bastante para
// manter os dois em sincronia manualmente, e evita acoplar o frontend a
// implementação interna do backend. Em um projeto maior/times separados,
// isso seria substituído por um contrato gerado (ex: OpenAPI + codegen).

export type Role = "CUSTOMER" | "AGENT" | "ADMIN";

export type TicketStatus = "OPEN" | "IN_PROGRESS" | "RESOLVED" | "CLOSED";

export type TicketPriority = "LOW" | "MEDIUM" | "HIGH" | "URGENT";

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  createdAt?: string;
}

export interface TicketMessage {
  id: string;
  body: string;
  createdAt: string;
  author: { id: string; name: string; role: Role };
}

export interface TicketSummary {
  id: string;
  title: string;
  description: string;
  status: TicketStatus;
  priority: TicketPriority;
  createdAt: string;
  updatedAt: string;
  customer: { id: string; name: string; email: string };
  assignedAgent: { id: string; name: string } | null;
}

export interface TicketDetail extends TicketSummary {
  messages: TicketMessage[];
}

export interface DashboardStats {
  ticketsByStatus: { status: TicketStatus; count: number }[];
  ticketsByPriority: { priority: TicketPriority; count: number }[];
  ticketsByAgent: { agentId: string; agentName: string; count: number }[];
  avgMinutesToFirstResponse: number | null;
  avgHoursToResolution: number | null;
}
