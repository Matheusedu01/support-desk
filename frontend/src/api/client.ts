const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3333/api";

const TOKEN_STORAGE_KEY = "support-desk:token";

export function getStoredToken(): string | null {
  return localStorage.getItem(TOKEN_STORAGE_KEY);
}

export function setStoredToken(token: string | null): void {
  if (token) localStorage.setItem(TOKEN_STORAGE_KEY, token);
  else localStorage.removeItem(TOKEN_STORAGE_KEY);
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/**
 * Wrapper único em volta de `fetch` — tudo que fala com a API passa por
 * aqui. Isso resolve dois problemas de uma vez, num lugar só: anexar o
 * header `Authorization` em toda requisição autenticada (sem repetir isso
 * em cada chamada) e transformar respostas de erro do backend (que já vêm
 * como `{ error: "mensagem" }`, ver backend/src/app.ts) numa exceção
 * JavaScript de verdade, que os componentes conseguem capturar com try/catch.
 */
export async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getStoredToken();

  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });

  const isJson = response.headers.get("content-type")?.includes("application/json");
  const body = isJson ? await response.json() : null;

  if (!response.ok) {
    const message = body?.error ?? `Erro inesperado (HTTP ${response.status}).`;
    throw new ApiError(response.status, message);
  }

  return body as T;
}
