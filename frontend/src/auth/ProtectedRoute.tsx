import { Navigate } from "react-router-dom";
import { useAuth } from "./AuthContext";
import { Role } from "../types";

interface ProtectedRouteProps {
  children: React.ReactNode;
  allowedRoles?: Role[];
}

/**
 * IMPORTANTE — leia isto antes de confiar demais neste componente: esconder
 * uma rota no frontend é conveniência de interface, NÃO é a autorização de
 * verdade. Um usuário curioso pode ler o JavaScript, adivinhar a URL da API,
 * e chamar o endpoint diretamente com o token dele. A ÚNICA autorização que
 * conta é a que roda no backend (`middleware/auth.ts` + `canAccessTicket`,
 * ver GUIDE.md do backend, Fases 3 e 4). Este componente só evita que um
 * usuário sem permissão veja uma tela que, de qualquer forma, a API
 * recusaria — é sobre experiência de uso, não sobre segurança.
 */
export function ProtectedRoute({ children, allowedRoles }: ProtectedRouteProps) {
  const { user, isLoading } = useAuth();

  if (isLoading) return <p className="page-loading">Carregando...</p>;

  if (!user) return <Navigate to="/login" replace />;

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return <Navigate to="/tickets" replace />;
  }

  return <>{children}</>;
}
