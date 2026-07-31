import { useQuery } from '@tanstack/react-query';
import { ArrowDownRight, ArrowUpRight, CalendarClock, CheckCircle2, ChevronRight, Clock3, Plus, ReceiptText, WalletCards } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { api } from '../api';
import { useAuth } from '../Auth';
import { Card, Empty, Status } from '../components/Ui';
import { formatCOP } from '../../../shared/money';
import type { Expense, Page } from '../types';

type Dashboard = { income: number; expense: number; profit: number; payrollPending: number; payrollPaid: number; upcoming: number; overdue: number; pendingVerification: number; latest: Expense[]; expensesByCategory: { name: string; total: string }[]; trend: { day: string; ingresos: number; gastos: number }[] };

export function DashboardPage({ collaborator = false }: { collaborator?: boolean }) {
  const { user } = useAuth();
  const expenses = useQuery({ queryKey: ['expenses', 'home'], queryFn: () => api<Page<Expense>>('/expenses?pageSize=3'), enabled: collaborator });
  const dashboard = useQuery({ queryKey: ['dashboard'], queryFn: () => api<Dashboard>('/dashboard?period=month'), enabled: !collaborator });
  if (collaborator) {
    const today = expenses.data?.items.filter(item => item.occurredAt.slice(0, 10) === new Date().toISOString().slice(0, 10)).length ?? 0;
    return <>
      <div className="hero-collaborator"><span className="eyebrow">Hola, {user?.name}</span><h1>¿Qué necesitas registrar hoy?</h1><p>Guardar un gasto toma menos de un minuto.</p><Link className="button primary big-action" to="/gastos/nuevo"><Plus size={22} /> Registrar un gasto</Link></div>
      <div className="collab-summary"><Card><span className="metric-icon peach"><ReceiptText /></span><div><strong>{today}</strong><span>gastos enviados hoy</span></div></Card><Card><span className="metric-icon sage"><CheckCircle2 /></span><div><strong>{expenses.data?.pagination.total ?? 0}</strong><span>envíos en total</span></div></Card></div>
      <div className="section-title"><div><span className="eyebrow">Tu actividad</span><h2>Últimos envíos</h2></div><Link to="/gastos">Ver todos <ChevronRight size={16} /></Link></div>
      <div className="expense-cards">{expenses.isLoading ? <Card>Cargando tus registros…</Card> : expenses.data?.items.length ? expenses.data.items.map(item => <Card key={item.id} className="expense-card"><div className="expense-card-top"><span className="metric-icon gold"><ReceiptText /></span><Status value={item.status} /></div><h3>{item.description}</h3><p>{item.category.name} · {new Date(item.occurredAt).toLocaleDateString('es-CO')}</p><strong>{formatCOP(item.total)}</strong></Card>) : <Empty>Todavía no has enviado gastos.</Empty>}</div>
    </>;
  }
  if (dashboard.isLoading) return <div className="loading-block">Calculando el resumen del negocio…</div>;
  if (dashboard.isError || !dashboard.data) return <div className="alert error">No fue posible cargar el resumen.</div>;
  const data = dashboard.data;
  return <>
    <div className="page-heading"><div><span className="eyebrow">Vista general</span><h1>Así va el negocio</h1><p>Un resumen claro de este mes.</p></div><div className="heading-actions"><select aria-label="Periodo"><option>Este mes</option></select><Link className="button primary" to="/gastos/nuevo"><Plus size={18} /> Nuevo gasto</Link></div></div>
    <div className="metrics-grid">
      <Metric title="Ingresos" value={data.income} icon={<ArrowUpRight />} tone="sage" note="este mes" />
      <Metric title="Gastos" value={data.expense} icon={<ArrowDownRight />} tone="peach" note={`${data.pendingVerification} por verificar`} />
      <Metric title="Utilidad estimada" value={data.profit} icon={<WalletCards />} tone="gold" note="ingresos menos gastos" />
      <Metric title="Nómina pendiente" value={data.payrollPending} icon={<Clock3 />} tone="lavender" note={`${formatCOP(data.payrollPaid)} pagado`} />
    </div>
    <div className="dashboard-grid">
      <Card className="chart-card"><div className="card-heading"><div><span className="eyebrow">Movimiento diario</span><h2>Ingresos y gastos</h2></div><span className="legend"><i className="income" /> Ingresos <i className="expense" /> Gastos</span></div>{data.trend.length ? <ResponsiveContainer width="100%" height={280}><AreaChart data={data.trend}><defs><linearGradient id="income" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#7f9b7b" stopOpacity={.45}/><stop offset="1" stopColor="#7f9b7b" stopOpacity={0}/></linearGradient></defs><CartesianGrid stroke="#eadfd5" vertical={false}/><XAxis dataKey="day" tickFormatter={x => x.slice(5)} /><YAxis tickFormatter={x => `${Math.round(x / 1000)}k`} /><Tooltip formatter={value => formatCOP(Number(value))}/><Area type="monotone" dataKey="ingresos" stroke="#738e70" fill="url(#income)" strokeWidth={3}/><Area type="monotone" dataKey="gastos" stroke="#d9896a" fill="transparent" strokeWidth={3}/></AreaChart></ResponsiveContainer> : <Empty>Registra movimientos para ver la gráfica.</Empty>}</Card>
      <Card><div className="card-heading"><div><span className="eyebrow">Atención</span><h2>Por resolver</h2></div></div><div className="attention-list"><Link to="/pagos"><span className="metric-icon peach"><CalendarClock /></span><div><strong>{data.overdue} pagos vencidos</strong><small>Revisar cuanto antes</small></div><ChevronRight /></Link><Link to="/pagos"><span className="metric-icon gold"><Clock3 /></span><div><strong>{data.upcoming} pagos próximos</strong><small>Vencen en 7 días</small></div><ChevronRight /></Link><Link to="/gastos"><span className="metric-icon sage"><CheckCircle2 /></span><div><strong>{data.pendingVerification} gastos</strong><small>Pendientes de verificar</small></div><ChevronRight /></Link></div></Card>
      <Card className="latest-card"><div className="card-heading"><div><span className="eyebrow">Actividad reciente</span><h2>Últimos movimientos</h2></div><Link to="/gastos">Ver gastos</Link></div>{data.latest.length ? <div className="table-wrap"><table><thead><tr><th>Concepto</th><th>Categoría</th><th>Registró</th><th>Estado</th><th className="right">Total</th></tr></thead><tbody>{data.latest.map(x => <tr key={x.id}><td><strong>{x.description}</strong><small>{new Date(x.occurredAt).toLocaleDateString('es-CO')}</small></td><td>{x.category.name}</td><td>{x.createdBy.name}</td><td><Status value={x.status} /></td><td className="right"><strong>{formatCOP(x.total)}</strong></td></tr>)}</tbody></table></div> : <Empty />}</Card>
    </div>
  </>;
}

function Metric({ title, value, icon, tone, note }: { title: string; value: number; icon: React.ReactNode; tone: string; note: string }) { return <Card className="metric"><div className={`metric-icon ${tone}`}>{icon}</div><span>{title}</span><strong>{formatCOP(value)}</strong><small>{note}</small></Card>; }
