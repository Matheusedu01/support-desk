import { ActivityLogEntry } from "../types";
import { STATUS_LABEL } from "./Badges";

/**
 * `metadata` chega da API como `unknown` (ver types.ts) porque seu formato
 * muda por `action`. Em vez de um `as` genérico arriscado, cada `case`
 * abaixo valida a forma exata que ele mesmo espera antes de usar os campos
 * — se o backend um dia mudar o formato de um evento sem atualizar aqui,
 * isso cai no fallback em vez de quebrar a tela com `undefined`.
 */
function formatActivity(entry: ActivityLogEntry): string {
  const { action, metadata, user } = entry;

  switch (action) {
    case "ASSIGNED": {
      const m = metadata as { agentId?: string; agentName?: string } | null;
      if (m?.agentName && m.agentName !== user.name) {
        return `${user.name} atribuiu o ticket a ${m.agentName}`;
      }
      return `${user.name} assumiu o ticket`;
    }
    case "STATUS_CHANGED": {
      const m = metadata as { from?: keyof typeof STATUS_LABEL; to?: keyof typeof STATUS_LABEL } | null;
      if (m?.from && m?.to) {
        return `${user.name} mudou o status de "${STATUS_LABEL[m.from]}" para "${STATUS_LABEL[m.to]}"`;
      }
      return `${user.name} mudou o status do ticket`;
    }
    case "MESSAGE_ADDED":
      return `${user.name} adicionou uma mensagem`;
    case "TAG_ADDED": {
      const m = metadata as { tagName?: string } | null;
      return m?.tagName ? `${user.name} adicionou a tag "${m.tagName}"` : `${user.name} adicionou uma tag`;
    }
    case "TAG_REMOVED": {
      const m = metadata as { tagName?: string } | null;
      return m?.tagName ? `${user.name} removeu a tag "${m.tagName}"` : `${user.name} removeu uma tag`;
    }
    default:
      return `${user.name} fez uma alteração no ticket`;
  }
}

export function ActivityTimeline({ entries }: { entries: ActivityLogEntry[] }) {
  if (entries.length === 0) {
    return null;
  }

  return (
    <details className="activity-timeline">
      <summary>Histórico de atividade ({entries.length})</summary>
      <ul>
        {entries.map((entry) => (
          <li key={entry.id}>
            <span>{formatActivity(entry)}</span>
            <time>{new Date(entry.createdAt).toLocaleString("pt-BR")}</time>
          </li>
        ))}
      </ul>
    </details>
  );
}
