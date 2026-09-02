import { FormEvent, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiFetch, ApiError } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { TicketPriority, TicketSummary } from "../types";
import { StatusBadge, PriorityBadge } from "../components/Badges";

const LIST_TITLE: Record<string, string> = {
  CUSTOMER: "Meus tickets",
  AGENT: "Fila de atendimento",
  ADMIN: "Todos os tickets",
};

export function TicketsListPage() {
  const { user } = useAuth();
  const [tickets, setTickets] = useState<TicketSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function loadTickets() {
    setIsLoading(true);
    try {
      const data = await apiFetch<{ tickets: TicketSummary[] }>("/tickets");
      setTickets(data.tickets);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Não foi possível carregar os tickets.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadTickets();
  }, []);

  return (
    <div className="page">
      <div className="page-header">
        <h1>{user ? LIST_TITLE[user.role] : "Tickets"}</h1>
      </div>

      {/* Só CUSTOMER cria ticket — o backend recusaria a chamada de qualquer
          outro papel (rota /tickets exige authorize("CUSTOMER") na criação),
          então nem faz sentido oferecer o formulário para agente/admin. */}
      {user?.role === "CUSTOMER" && <NewTicketForm onCreated={loadTickets} />}

      {error && <p className="form-error">{error}</p>}
      {isLoading ? (
        <p className="page-loading">Carregando...</p>
      ) : tickets.length === 0 ? (
        <p className="empty-state">Nenhum ticket por aqui ainda.</p>
      ) : (
        <ul className="ticket-list">
          {tickets.map((ticket) => (
            <li key={ticket.id}>
              <Link to={`/tickets/${ticket.id}`} className="ticket-row">
                <div className="ticket-row-main">
                  <strong>{ticket.title}</strong>
                  <span className="ticket-row-meta">
                    Cliente: {ticket.customer.name}
                    {ticket.assignedAgent && ` · Agente: ${ticket.assignedAgent.name}`}
                  </span>
                </div>
                <div className="ticket-row-badges">
                  <PriorityBadge priority={ticket.priority} />
                  <StatusBadge status={ticket.status} />
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function NewTicketForm({ onCreated }: { onCreated: () => void }) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<TicketPriority>("MEDIUM");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isOpen, setIsOpen] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      await apiFetch("/tickets", {
        method: "POST",
        body: JSON.stringify({ title, description, priority }),
      });
      setTitle("");
      setDescription("");
      setPriority("MEDIUM");
      setIsOpen(false);
      onCreated();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Não foi possível criar o ticket.");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (!isOpen) {
    return (
      <button className="btn btn-primary" onClick={() => setIsOpen(true)}>
        + Novo ticket
      </button>
    );
  }

  return (
    <form className="card new-ticket-form" onSubmit={handleSubmit}>
      {error && <p className="form-error">{error}</p>}
      <label>
        Título
        <input value={title} onChange={(e) => setTitle(e.target.value)} minLength={3} required />
      </label>
      <label>
        Descrição
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          minLength={10}
          rows={3}
          required
        />
      </label>
      <label>
        Prioridade
        <select value={priority} onChange={(e) => setPriority(e.target.value as TicketPriority)}>
          <option value="LOW">Baixa</option>
          <option value="MEDIUM">Média</option>
          <option value="HIGH">Alta</option>
          <option value="URGENT">Urgente</option>
        </select>
      </label>
      <div className="form-actions">
        <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
          {isSubmitting ? "Enviando..." : "Abrir ticket"}
        </button>
        <button type="button" className="btn btn-ghost" onClick={() => setIsOpen(false)}>
          Cancelar
        </button>
      </div>
    </form>
  );
}
