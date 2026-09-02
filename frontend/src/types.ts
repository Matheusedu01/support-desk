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

export interface Tag {
  id: string;
  name: string;
}

// O formato de `metadata` varia por `action` (ver backend/prisma/schema.prisma
// e o comentário em ActivityLog) — por isso é `unknown` aqui, e cada caso é
// tratado explicitamente em `formatActivity` (components/ActivityTimeline.tsx)
// em vez de assumir uma forma fixa.
export interface ActivityLogEntry {
  id: string;
  action: "ASSIGNED" | "STATUS_CHANGED" | "MESSAGE_ADDED" | "TAG_ADDED" | "TAG_REMOVED";
  metadata: unknown;
  createdAt: string;
  user: { id: string; name: string; role: Role };
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
  tags: Tag[];
}

export interface TicketDetail extends TicketSummary {
  messages: TicketMessage[];
  activityLogs: ActivityLogEntry[];
}

export interface DashboardStats {
  ticketsByStatus: { status: TicketStatus; count: number }[];
  ticketsByPriority: { priority: TicketPriority; count: number }[];
  ticketsByAgent: { agentId: string; agentName: string; count: number }[];
  avgMinutesToFirstResponse: number | null;
  avgHoursToResolution: number | null;
}
