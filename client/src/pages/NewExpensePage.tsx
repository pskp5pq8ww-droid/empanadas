import { useMemo, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, CheckCircle2, Plus, ReceiptText } from 'lucide-react';
import { Link } from 'react-router-dom';
import { api, post } from '../api';
import { Button, Card, Field, Select, TextArea } from '../components/Ui';
import { formatCOP, multiplyMoney } from '../../../shared/money';
import type { Category, Expense } from '../types';

const initial = { description: '', categoryId: '', otherDetail: '', quantity: '1', unit: 'unidad', unitValue: '', paymentMethod: 'Efectivo', supplier: '', note: '' };
export function NewExpensePage() {
  const [form, setForm] = useState(initial); const [success, setSuccess] = useState(false); const client = useQueryClient();
  const categories = useQuery({ queryKey: ['categories'], queryFn: () => api<Category[]>('/categories') });
  const methods = useQuery({ queryKey: ['payment-methods'], queryFn: () => api<{ id: number; name: string }[]>('/payment-methods') });
  const total = useMemo(() => { try { return multiplyMoney(form.quantity || 0, form.unitValue || 0); } catch { return '0.00'; } }, [form.quantity, form.unitValue]);
  const selected = categories.data?.find(x => x.id === Number(form.categoryId));
  const mutation = useMutation({ mutationFn: () => post<Expense>('/expenses', { ...form, categoryId: Number(form.categoryId), quantity: Number(form.quantity), unitValue: form.unitValue }, { 'idempotency-key': crypto.randomUUID() }), onSuccess: () => { setSuccess(true); setForm(initial); void client.invalidateQueries({ queryKey: ['expenses'] }); }, onError: () => setSuccess(false) });
  const update = (key: string, value: string) => setForm(old => ({ ...old, [key]: value }));
  const submit = (event: FormEvent) => { event.preventDefault(); mutation.mutate(); };
  if (success) return <div className="success-state"><span><CheckCircle2 /></span><h1>Gasto registrado correctamente</h1><p>El administrador ya puede verlo. ¿Qué deseas hacer ahora?</p><div><Button className="primary" onClick={() => setSuccess(false)}><Plus /> Registrar otro</Button><Link className="button secondary" to="/gastos">Ver mis envíos</Link></div></div>;
  return <>
    <div className="page-heading compact"><div><Link className="back-link" to="/"><ArrowLeft /> Volver</Link><span className="eyebrow">Nuevo movimiento</span><h1>Registrar un gasto</h1><p>Completa los datos de la compra.</p></div></div>
    <form onSubmit={submit} className="expense-form-layout">
      <Card className="form-card"><div className="form-section-title"><span className="metric-icon peach"><ReceiptText /></span><div><h2>Información del gasto</h2><p>Los campos con * son obligatorios.</p></div></div>
        <div className="form-grid"><Field label="Nombre o descripción *" value={form.description} onChange={e => update('description', e.target.value)} placeholder="Ej. Harina de maíz" required />
        <Select label="Categoría *" value={form.categoryId} onChange={e => update('categoryId', e.target.value)} required><option value="">Selecciona una categoría</option>{categories.data?.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}</Select>
        {selected?.name === 'Otros' && <Field label="Aclaración *" value={form.otherDetail} onChange={e => update('otherDetail', e.target.value)} required />}
        <Field label="Cantidad *" type="number" min="0.001" step="0.001" value={form.quantity} onChange={e => update('quantity', e.target.value)} required />
        <Select label="Unidad *" value={form.unit} onChange={e => update('unit', e.target.value)}>{['unidad','paquete','kilogramo','libra','litro','caja','otra'].map(x => <option key={x}>{x}</option>)}</Select>
        <Field label="Valor unitario en COP *" type="number" inputMode="decimal" min="0" step="0.01" value={form.unitValue} onChange={e => update('unitValue', e.target.value)} placeholder="$ 0" required />
        <Select label="Método de pago *" value={form.paymentMethod} onChange={e => update('paymentMethod', e.target.value)}>{methods.data?.map(x => <option key={x.id}>{x.name}</option>)}</Select>
        <Field label="Proveedor o lugar" value={form.supplier} onChange={e => update('supplier', e.target.value)} placeholder="Opcional" />
        <TextArea label="Nota breve" value={form.note} onChange={e => update('note', e.target.value)} placeholder="Opcional" rows={3} /></div>
      </Card>
      <aside><Card className="total-card"><span>Total del gasto</span><strong>{formatCOP(total)}</strong><small>{form.quantity || 0} {form.unit} × {formatCOP(form.unitValue || 0)}</small></Card>{mutation.isError && <div className="alert error" role="alert">{mutation.error.message}</div>}<Button type="submit" busy={mutation.isPending} className="primary submit-expense">Guardar gasto</Button><p className="server-note">La fecha, hora y usuario se guardarán automáticamente.</p></aside>
    </form>
  </>;
}
