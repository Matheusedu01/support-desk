import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";

const ROLE_LABEL: Record<string, string> = {
  CUSTOMER: "Cliente",
  AGENT: "Agente",
  ADMIN: "Administrador",
};

export function Layout() {
  const { user, logout } = useAuth();

  return (
    <div className="app-shell">
      <header className="app-header">
        <span className="app-title">Support Desk</span>
        <nav className="app-nav">
          <NavLink to="/tickets" className={({ isActive }) => (isActive ? "active" : "")}>
            Tickets
          </NavLink>
          {user?.role === "ADMIN" && (
            <NavLink to="/admin" className={({ isActive }) => (isActive ? "active" : "")}>
              Métricas
            </NavLink>
          )}
        </nav>
        <div className="app-user">
          {user && (
            <>
              <span>
                {user.name} <small>({ROLE_LABEL[user.role]})</small>
              </span>
              <button onClick={logout} className="btn btn-ghost">
                Sair
              </button>
            </>
          )}
        </div>
      </header>
      <main className="app-content">
        <Outlet />
      </main>
    </div>
  );
}
