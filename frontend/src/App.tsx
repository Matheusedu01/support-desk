import { Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider, useAuth } from "./auth/AuthContext";
import { ProtectedRoute } from "./auth/ProtectedRoute";
import { Layout } from "./components/Layout";
import { LoginPage } from "./pages/LoginPage";
import { RegisterPage } from "./pages/RegisterPage";
import { TicketsListPage } from "./pages/TicketsListPage";
import { TicketDetailPage } from "./pages/TicketDetailPage";
import { AdminStatsPage } from "./pages/AdminStatsPage";

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />

        <Route
          element={
            <ProtectedRoute>
              <Layout />
            </ProtectedRoute>
          }
        >
          <Route path="/tickets" element={<TicketsListPage />} />
          <Route path="/tickets/:id" element={<TicketDetailPage />} />
          <Route
            path="/admin"
            element={
              <ProtectedRoute allowedRoles={["ADMIN"]}>
                <AdminStatsPage />
              </ProtectedRoute>
            }
          />
        </Route>

        <Route path="*" element={<RootRedirect />} />
      </Routes>
    </AuthProvider>
  );
}

function RootRedirect() {
  const { user, isLoading } = useAuth();
  if (isLoading) return <p className="page-loading">Carregando...</p>;
  return <Navigate to={user ? "/tickets" : "/login"} replace />;
}
