import { Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './Auth';
import { LoginPage } from './pages/LoginPage';
import { AppShell } from './components/AppShell';
import { DashboardPage } from './pages/DashboardPage';
import { NewExpensePage } from './pages/NewExpensePage';
import { ExpensesPage } from './pages/ExpensesPage';
import { AdminModulePage } from './pages/AdminModulePage';

function ProtectedApp() {
  const { user, loading } = useAuth();
  if (loading) return <div className="splash"><img src="/logo.png" alt="Las Empanadas de Ángela" /><p>Preparando tu espacio…</p></div>;
  if (!user) return <LoginPage />;
  const collaborator = user.role === 'COLLABORATOR';
  return <AppShell>
    <Routes>
      <Route path="/" element={collaborator ? <DashboardPage collaborator /> : <DashboardPage />} />
      <Route path="/gastos/nuevo" element={<NewExpensePage />} />
      <Route path="/gastos" element={<ExpensesPage />} />
      {!collaborator && <>
        <Route path="/ingresos" element={<AdminModulePage module="incomes" />} />
        <Route path="/pagos" element={<AdminModulePage module="payables" />} />
        <Route path="/nomina" element={<AdminModulePage module="payroll" />} />
        <Route path="/agenda" element={<AdminModulePage module="agenda" />} />
        <Route path="/reportes" element={<AdminModulePage module="reports" />} />
        <Route path="/configuracion" element={<AdminModulePage module="settings" />} />
      </>}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  </AppShell>;
}

export function App() { return <AuthProvider><ProtectedApp /></AuthProvider>; }
