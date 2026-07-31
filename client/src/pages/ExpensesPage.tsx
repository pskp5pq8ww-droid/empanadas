import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Filter, Plus, Search, XCircle } from 'lucide-react';
import { Link } from 'react-router-dom';
import { api, patch } from '../api';
import { useAuth } from '../Auth';
import { Button, Card, Empty, Select, Status } from '../components/Ui';
import { formatCOP } from '../../../shared/money';
import type { Category, Expense, Page } from '../types';

export function ExpensesPage() {
  const { user } = useAuth(); const admin = user?.role === 'ADMIN'; const client = useQueryClient();
  const [q, setQ] = useState(''); const [category, setCategory] = useState(''); const [status, setStatus] = useState(''); const [page, setPage] = useState(1);
  const params = new URLSearchParams({ page: String(page), pageSize: '20' }); if (q) params.set('q', q); if (category) params.set('categoryId', category); if (status) params.set('status', status);
  const query = useQuery({ queryKey: ['expenses', q, category, status, page], queryFn: () => api<Page<Expense>>(`/expenses?${params}`) });
  const categories = useQuery({ queryKey: ['categories'], queryFn: () => api<Category[]>('/categories') });
  const action = useMutation({ mutationFn: ({ id, body }: { id: number; body: unknown }) => patch(`/expenses/${id}`, body), onSuccess: () => void client.invalidateQueries({ queryKey: ['expenses'] }) });
  const voidExpense = (expense: Expense) => { const reason = window.prompt(`Motivo para anular “${expense.description}”:`); if (reason?.trim()) action.mutate({ id: expense.id, body: { voidReason: reason.trim() } }); };
  return <>
    <div className="page-heading"><div><span className="eyebrow">{admin ? 'Control de movimientos' : 'Tu actividad'}</span><h1>{admin ? 'Gastos' : 'Mis envíos'}</h1><p>{admin ? 'Revisa, verifica y consulta todas las compras.' : 'Aquí encuentras únicamente los gastos que tú registraste.'}</p></div><Link className="button primary" to="/gastos/nuevo"><Plus /> Registrar gasto</Link></div>
    <Card className="filters"><label className="search-field"><Search /><input value={q} onChange={e => { setQ(e.target.value); setPage(1); }} placeholder="Buscar por concepto…" aria-label="Buscar gastos" /></label><Select label="Categoría" value={category} onChange={e => { setCategory(e.target.value); setPage(1); }}><option value="">Todas</option>{categories.data?.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}</Select><Select label="Estado" value={status} onChange={e => { setStatus(e.target.value); setPage(1); }}><option value="">Todos</option><option value="REGISTERED">Registrado</option><option value="VERIFIED">Verificado</option><option value="VOIDED">Anulado</option></Select><span className="filter-count"><Filter /> {query.data?.pagination.total ?? 0} resultados</span></Card>
    <Card className="list-card">{query.isLoading ? <div className="loading-block">Cargando gastos…</div> : query.data?.items.length ? <div className="table-wrap"><table><thead><tr><th>Fecha y concepto</th><th>Categoría</th><th>Cantidad</th>{admin && <th>Registró</th>}<th>Estado</th><th className="right">Total</th>{admin && <th />}</tr></thead><tbody>{query.data.items.map(x => <tr key={x.id}><td><strong>{x.description}</strong><small>{new Date(x.occurredAt).toLocaleString('es-CO')}</small></td><td>{x.category.name}</td><td>{x.quantity} {x.unit}</td>{admin && <td>{x.createdBy.name}</td>}<td><Status value={x.status} /></td><td className="right"><strong>{formatCOP(x.total)}</strong><small>{x.paymentMethod}</small></td>{admin && <td className="row-actions">{x.status === 'REGISTERED' && <button title="Verificar" onClick={() => action.mutate({ id: x.id, body: { status: 'VERIFIED' } })}><Check /></button>}{x.status !== 'VOIDED' && <button className="danger" title="Anular" onClick={() => voidExpense(x)}><XCircle /></button>}</td>}</tr>)}</tbody></table></div> : <Empty>No hay gastos que coincidan con los filtros.</Empty>}</Card>
    {(query.data?.pagination.pages ?? 1) > 1 && <div className="pagination"><Button className="secondary" disabled={page === 1} onClick={() => setPage(x => x - 1)}>Anterior</Button><span>Página {page} de {query.data?.pagination.pages}</span><Button className="secondary" disabled={page === query.data?.pagination.pages} onClick={() => setPage(x => x + 1)}>Siguiente</Button></div>}
  </>;
}
