import type { ReactNode } from 'react';
import { CalendarDays, CircleDollarSign, ClipboardList, Gauge, LogOut, Menu, PlusCircle, ReceiptText, Settings, UsersRound } from 'lucide-react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../Auth';

const adminLinks = [
  ['/', 'Resumen', Gauge], ['/gastos', 'Gastos', ReceiptText], ['/ingresos', 'Ingresos', CircleDollarSign], ['/pagos', 'Pagos', ClipboardList], ['/nomina', 'Nómina', UsersRound], ['/agenda', 'Agenda', CalendarDays], ['/reportes', 'Reportes', Menu], ['/configuracion', 'Configuración', Settings]
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth(); const collaborator = user?.role === 'COLLABORATOR';
  return <div className={`app-shell ${collaborator ? 'collaborator-shell' : ''}`}>
    {!collaborator && <aside className="sidebar">
      <div className="brand"><img src="/logo.png" alt="" /><div><strong>Empanadas de Ángela</strong><small>Centro administrativo</small></div></div>
      <nav aria-label="Navegación principal">{adminLinks.map(([to, label, Icon]) => <NavLink key={to} to={to} end={to === '/'}><Icon size={19} />{label}</NavLink>)}</nav>
      <button className="logout-link" onClick={() => void logout()}><LogOut size={19} /> Cerrar sesión</button>
    </aside>}
    <main className="main-content">
      <header className="topbar"><div><small>{collaborator ? 'Portal del colaborador' : 'Administración'}</small><strong>{user?.name}</strong></div><span className="avatar" aria-hidden="true">{user?.name.charAt(0)}</span></header>
      <div className="page">{children}</div>
    </main>
    {collaborator && <nav className="bottom-nav" aria-label="Navegación del colaborador">
      <NavLink to="/" end><Gauge /> <span>Inicio</span></NavLink><NavLink to="/gastos/nuevo"><PlusCircle /> <span>Nuevo gasto</span></NavLink><NavLink to="/gastos"><ReceiptText /> <span>Mis envíos</span></NavLink><button onClick={() => void logout()}><LogOut /><span>Salir</span></button>
    </nav>}
  </div>;
}
