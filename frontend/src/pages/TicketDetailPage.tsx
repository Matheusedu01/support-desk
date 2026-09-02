import { FormEvent, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { apiFetch, ApiError } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { TicketDetail, TicketStatus } from "../types";
import { StatusBadge, PriorityBadge } from "../components/Badges";
import { TagManager } from "../components/TagManager";
import { ActivityTimeline } from "../components/ActivityTimeline";

export function TicketDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const [ticket, setTicket] = useState<TicketDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  async function loadTicket() {
    if (!id) return;
    setIsLoading(true);
    try {
      const data = await apiFetch<{ ticket: TicketDetail }>(`/tickets/${id}`);
      setTicket(data.ticket);
      setError(null);
    } catch (err) {
      // 403 aqui é o BOLA-check do backend em ação (ver GUIDE.md, Fase 4) —
      // não é um bug, é a regra de negócio funcionando.
      setError(err instanceof ApiError ? err.message : "Não foi possível carregar o ticket.");
      setTicket(null);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadTicket();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (isLoading) return <p className="page-loading">Carregando...</p>;
  if (error) return <p className="form-error">{error}</p>;
  if (!ticket) return null;

  const canManage = user?.role === "AGENT" || user?.role === "ADMIN";
  const isOwningAgent = user?.role === "AGENT" && ticket.assignedAgent?.id === user.id;
  const canClaim = user?.role === "AGENT" && (!ticket.assignedAgent || isOwningAgent);
  const canChangeStatus = user?.role === "ADMIN" || isOwningAgent;

  return (
    <div className="page">
      <div className="ticket-detail-header">
        <div>
          <h1>{ticket.title}</h1>
          <p className="ticket-row-meta">
            Cliente: {ticket.customer.name} · Aberto em{" "}
            {new Date(ticket.createdAt).toLocaleString("pt-BR")}
          </p>
        </div>
        <div className="ticket-row-badges">
          <PriorityBadge priority={ticket.priority} />
          <StatusBadge status={ticket.status} />
        </div>
      </div>

      <p className="ticket-description">{ticket.description}</p>

      <TagManager ticketId={ticket.id} tags={ticket.tags} canManage={canManage} onChanged={loadTicket} />

      {canManage && (
        <div className="card ticket-actions">
          <span>
            Agente responsável: {ticket.assignedAgent ? ticket.assignedAgent.name : "Ninguém ainda"}
          </span>
          <div className="form-actions">
            {canClaim && !isOwningAgent && (
              <ActionButton
                label="Assumir ticket"
                onDone={loadTicket}
                run={() => apiFetch(`/tickets/${ticket.id}/assign`, { method: "POST" })}
              />
            )}
            {canChangeStatus && (
              <StatusSelect ticketId={ticket.id} current={ticket.status} onChanged={loadTicket} />
            )}
          </div>
        </div>
      )}

      <h2>Conversa</h2>
      <ul className="message-list">
        {ticket.messages.length === 0 && <p className="empty-state">Nenhuma mensagem ainda.</p>}
        {ticket.messages.map((message) => (
          <li key={message.id} className="message">
            <div className="message-meta">
              <strong>{message.author.name}</strong>
              <span>{new Date(message.createdAt).toLocaleString("pt-BR")}</span>
            </div>
            <p>{message.body}</p>
          </li>
        ))}
      </ul>

      <NewMessageForm ticketId={ticket.id} onSent={loadTicket} />

      <ActivityTimeline entries={ticket.activityLogs} />
    </div>
  );
}

function ActionButton({
  label,
  run,
  onDone,
}: {
  label: string;
  run: () => Promise<unknown>;
  onDone: () => void;
}) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setIsSubmitting(true);
    setError(null);
    try {
      await run();
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Ação falhou.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <span>
      <button className="btn btn-primary" onClick={handleClick} disabled={isSubmitting}>
        {label}
      </button>
      {error && <span className="form-error"> {error}</span>}
    </span>
  );
}

function StatusSelect({
  ticketId,
  current,
  onChanged,
}: {
  ticketId: string;
  current: TicketStatus;
  onChanged: () => void;
}) {
  const [error, setError] = useState<string | null>(null);

  async function handleChange(status: TicketStatus) {
    setError(null);
    try {
      await apiFetch(`/tickets/${ticketId}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Não foi possível mudar o status.");
    }
  }

  return (
    <span>
      <select value={current} onChange={(e) => handleChange(e.target.value as TicketStatus)}>
        <option value="OPEN">Aberto</option>
        <option value="IN_PROGRESS">Em andamento</option>
        <option value="RESOLVED">Resolvido</option>
        <option value="CLOSED">Fechado</option>
      </select>
      {error && <span className="form-error"> {error}</span>}
    </span>
  );
}

function NewMessageForm({ ticketId, onSent }: { ticketId: string; onSent: () => void }) {
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      await apiFetch(`/tickets/${ticketId}/messages`, {
        method: "POST",
        body: JSON.stringify({ body }),
      });
      setBody("");
      onSent();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Não foi possível enviar a mensagem.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form className="card new-message-form" onSubmit={handleSubmit}>
      {error && <p className="form-error">{error}</p>}
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Escreva uma resposta..."
        rows={3}
        required
      />
      <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
        {isSubmitting ? "Enviando..." : "Enviar"}
      </button>
    </form>
  );
}
