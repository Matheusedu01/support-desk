import { TicketPriority, TicketStatus } from "../types";

// Exportado porque components/ActivityTimeline.tsx também precisa traduzir
// esses valores (na frase "mudou o status de X para Y") — melhor reaproveitar
// o mesmo mapa do que manter duas traduções que podem divergir com o tempo.
export const STATUS_LABEL: Record<TicketStatus, string> = {
  OPEN: "Aberto",
  IN_PROGRESS: "Em andamento",
  RESOLVED: "Resolvido",
  CLOSED: "Fechado",
};

const PRIORITY_LABEL: Record<TicketPriority, string> = {
  LOW: "Baixa",
  MEDIUM: "Média",
  HIGH: "Alta",
  URGENT: "Urgente",
};

export function StatusBadge({ status }: { status: TicketStatus }) {
  return <span className={`badge badge-status-${status.toLowerCase()}`}>{STATUS_LABEL[status]}</span>;
}

export function PriorityBadge({ priority }: { priority: TicketPriority }) {
  return (
    <span className={`badge badge-priority-${priority.toLowerCase()}`}>{PRIORITY_LABEL[priority]}</span>
  );
}
