import { useEffect, useState } from "react";
import { apiFetch, ApiError } from "../api/client";
import { DashboardStats } from "../types";
import { StatusBadge, PriorityBadge } from "../components/Badges";

export function AdminStatsPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    apiFetch<DashboardStats>("/admin/stats")
      .then(setStats)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Falha ao carregar métricas."))
      .finally(() => setIsLoading(false));
  }, []);

  if (isLoading) return <p className="page-loading">Carregando...</p>;
  if (error) return <p className="form-error">{error}</p>;
  if (!stats) return null;

  return (
    <div className="page">
      <h1>Métricas</h1>

      <div className="stats-grid">
        <div className="card stat-card">
          <span className="stat-value">
            {stats.avgMinutesToFirstResponse !== null ? `${stats.avgMinutesToFirstResponse} min` : "—"}
          </span>
          <span className="stat-label">Tempo médio até a 1ª resposta</span>
        </div>
        <div className="card stat-card">
          <span className="stat-value">
            {stats.avgHoursToResolution !== null ? `${stats.avgHoursToResolution} h` : "—"}
          </span>
          <span className="stat-label">Tempo médio até resolução</span>
        </div>
      </div>

      <div className="stats-columns">
        <div className="card">
          <h2>Por status</h2>
          <ul className="stat-list">
            {stats.ticketsByStatus.map((row) => (
              <li key={row.status}>
                <StatusBadge status={row.status} />
                <span>{row.count}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="card">
          <h2>Por prioridade</h2>
          <ul className="stat-list">
            {stats.ticketsByPriority.map((row) => (
              <li key={row.priority}>
                <PriorityBadge priority={row.priority} />
                <span>{row.count}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="card">
          <h2>Por agente</h2>
          <ul className="stat-list">
            {stats.ticketsByAgent.length === 0 && <p className="empty-state">Nenhum ticket atribuído ainda.</p>}
            {stats.ticketsByAgent.map((row) => (
              <li key={row.agentId}>
                <span>{row.agentName}</span>
                <span>{row.count}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
