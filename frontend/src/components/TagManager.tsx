import { FormEvent, useEffect, useState } from "react";
import { apiFetch, ApiError } from "../api/client";
import { Tag } from "../types";

interface TagManagerProps {
  ticketId: string;
  tags: Tag[];
  canManage: boolean;
  onChanged: () => void;
}

/**
 * `canManage` só controla o que este componente MOSTRA (input de nova tag,
 * botão de remover) — a mesma distinção já documentada em
 * auth/ProtectedRoute.tsx: esconder o controle na UI é conveniência, quem
 * garante a regra de verdade ("só AGENT/ADMIN gerenciam tags") é o backend
 * (ver `authorize("AGENT", "ADMIN")` em ticket.routes.ts).
 */
export function TagManager({ ticketId, tags, canManage, onChanged }: TagManagerProps) {
  const [existingTagNames, setExistingTagNames] = useState<string[]>([]);
  const [newTagName, setNewTagName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!canManage) return;
    // Alimenta o <datalist> de sugestões — evita "bug", "Bug" e "BUG" como
    // três tags diferentes por quem não lembra o que já foi usado antes.
    apiFetch<{ tags: Tag[] }>("/tags")
      .then((data) => setExistingTagNames(data.tags.map((t) => t.name)))
      .catch(() => {});
  }, [canManage]);

  async function handleAdd(event: FormEvent) {
    event.preventDefault();
    if (!newTagName.trim()) return;
    setError(null);
    setIsSubmitting(true);
    try {
      await apiFetch(`/tickets/${ticketId}/tags`, {
        method: "POST",
        body: JSON.stringify({ name: newTagName.trim() }),
      });
      setNewTagName("");
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Não foi possível adicionar a tag.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleRemove(tagId: string) {
    setError(null);
    try {
      await apiFetch(`/tickets/${ticketId}/tags/${tagId}`, { method: "DELETE" });
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Não foi possível remover a tag.");
    }
  }

  if (!canManage && tags.length === 0) {
    return null;
  }

  return (
    <div className="tag-manager">
      {tags.map((tag) => (
        <span key={tag.id} className="tag-chip">
          {tag.name}
          {canManage && (
            <button
              type="button"
              className="tag-chip-remove"
              onClick={() => handleRemove(tag.id)}
              aria-label={`Remover tag ${tag.name}`}
            >
              ×
            </button>
          )}
        </span>
      ))}

      {canManage && (
        <form className="tag-add-form" onSubmit={handleAdd}>
          <input
            list="existing-tag-names"
            placeholder="+ tag"
            value={newTagName}
            onChange={(e) => setNewTagName(e.target.value)}
            disabled={isSubmitting}
          />
          <datalist id="existing-tag-names">
            {existingTagNames.map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>
        </form>
      )}

      {error && <span className="form-error">{error}</span>}
    </div>
  );
}
