import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { apiFetch, getStoredToken, setStoredToken } from "../api/client";
import { User } from "../types";

interface AuthContextValue {
  user: User | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

interface AuthResponse {
  token: string;
  user: User;
}

/**
 * O JWT fica em `localStorage`, não em cookie. É uma escolha simples de
 * implementar (sem precisar configurar cookie `httpOnly` + CORS com
 * credenciais), mas tem um trade-off real que vale entender: um token em
 * localStorage é acessível por qualquer script rodando na página, então uma
 * vulnerabilidade de XSS no frontend poderia roubar o token. Um cookie
 * `httpOnly` não teria esse problema, mas fica mais vulnerável a CSRF e exige
 * mais configuração. Para portfolio, localStorage é aceitável — mas é o tipo
 * de trade-off que vale mencionar numa entrevista, não só usar sem saber por quê.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const token = getStoredToken();
    if (!token) {
      setIsLoading(false);
      return;
    }

    // Um token salvo pode ter expirado ou ser inválido (ex: veio de uma
    // versão antiga do backend) — confirmamos com a API em vez de confiar
    // cegamente no que está salvo localmente.
    apiFetch<{ user: User }>("/me")
      .then(({ user }) => setUser(user))
      .catch(() => setStoredToken(null))
      .finally(() => setIsLoading(false));
  }, []);

  async function login(email: string, password: string) {
    const { token, user } = await apiFetch<AuthResponse>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    setStoredToken(token);
    setUser(user);
  }

  async function register(name: string, email: string, password: string) {
    const { token, user } = await apiFetch<AuthResponse>("/auth/register", {
      method: "POST",
      body: JSON.stringify({ name, email, password }),
    });
    setStoredToken(token);
    setUser(user);
  }

  function logout() {
    setStoredToken(null);
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, isLoading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth precisa ser usado dentro de um <AuthProvider>.");
  return ctx;
}
