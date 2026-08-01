import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express, { type NextFunction, type Request, type Response } from 'express';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import { expenseSchema, incomeSchema, parseOrReply, payableSchema } from './schemas.js';
import { multiplyMoney } from '../shared/money.js';

type Row = Record<string, any>;
const categoryNames = ['Ingredientes o comida', 'Accesorios', 'Aseo', 'Mobiliario', 'Servilletas y empaques', 'Servicios públicos', 'Transporte', 'Arriendo', 'Nómina', 'Mantenimiento', 'Otros'];

function newState() {
  const createdAt = new Date();
  return {
    categories: categoryNames.map((name, index) => ({ id: index + 1, name, active: true, sortOrder: index })),
    paymentMethods: ['Efectivo', 'Transferencia', 'Tarjeta', 'Otro'].map((name, index) => ({ id: index + 1, name, active: true, sortOrder: index })),
    users: [{ id: 1, username: 'admin-temporal', name: 'Administrador temporal', role: 'ADMIN', active: true, createdAt }],
    expenses: [] as Row[], incomes: [] as Row[], payables: [] as Row[], recurring: [] as Row[], employees: [] as Row[], payroll: [] as Row[], events: [] as Row[], audit: [] as Row[],
    settings: [{ key: 'businessName', value: 'Las Empanadas de Ángela' }, { key: 'currency', value: 'COP' }, { key: 'timezone', value: 'America/Bogota' }],
    idempotency: new Map<string, Row>(),
    ids: { category: categoryNames.length + 1, user: 2, expense: 1, income: 1, payable: 1, recurring: 1, occurrence: 1, employee: 1, payroll: 1, event: 1, audit: 1 }
  };
}

let store = newState();
export function resetMemoryState() { store = newState(); }

const app = express();
const production = process.env.NODE_ENV === 'production';
if (production) app.set('trust proxy', 1);
app.use(helmet({ contentSecurityPolicy: production ? undefined : false }));
app.use(express.json({ limit: '256kb' }));
app.use('/api', rateLimit({ windowMs: 15 * 60_000, limit: 300, standardHeaders: 'draft-8', legacyHeaders: false }));

const admin = () => ({ id: 1, name: store.users[0].name, username: store.users[0].username, role: 'ADMIN' });
const nextId = (kind: keyof typeof store.ids) => store.ids[kind]++;
const routeId = (req: Request) => Number(req.params.id);
const category = (id: number) => store.categories.find(item => item.id === Number(id));
const employee = (id: number) => store.employees.find(item => item.id === Number(id));
const notFound = (res: Response) => res.status(404).json({ message: 'Registro no encontrado' });
const audit = (action: string, entity: string, entityId: string | number, before?: unknown, after?: unknown) => store.audit.unshift({ id: nextId('audit'), action, entity, entityId: String(entityId), before, after, user: { name: admin().name }, createdAt: new Date() });
const page = (items: Row[], req: Request) => {
  const number = Math.max(1, Number(req.query.page) || 1); const size = Math.min(100, Math.max(1, Number(req.query.pageSize) || 20)); const start = (number - 1) * size;
  return { items: items.slice(start, start + size), pagination: { page: number, pageSize: size, total: items.length, pages: Math.ceil(items.length / size) } };
};
const inRange = (value: string | Date, req: Request) => {
  const from = req.query.from ? +new Date(String(req.query.from)) : -Infinity; const to = req.query.to ? new Date(String(req.query.to)) : undefined; if (to) to.setHours(23, 59, 59, 999);
  return +new Date(value) >= from && +new Date(value) <= (to ? +to : Infinity);
};

app.get('/api/health', (_req, res) => res.json({ status: 'ok', storage: 'temporal', database: 'desactivada', timestamp: new Date().toISOString() }));
app.get('/api/auth/me', (_req, res) => res.json({ user: admin(), csrfToken: 'modo-temporal' }));
app.post('/api/auth/login', (_req, res) => res.json({ user: admin(), csrfToken: 'modo-temporal' }));
app.post('/api/auth/logout', (_req, res) => res.json({ message: 'Acceso temporal activo' }));
app.post('/api/cron/recurring', (_req, res) => res.json({ created: 0, runAt: new Date().toISOString() }));

app.get('/api/categories', (_req, res) => res.json(store.categories.slice().sort((a, b) => a.sortOrder - b.sortOrder)));
app.post('/api/categories', (req, res) => {
  const name = String(req.body.name ?? '').trim(); if (name.length < 2) return res.status(400).json({ message: 'Escribe un nombre de categoría' });
  if (store.categories.some(item => item.name.toLowerCase() === name.toLowerCase())) return res.status(409).json({ message: 'Ya existe esa categoría' });
  const item = { id: nextId('category'), name, active: true, sortOrder: store.categories.length }; store.categories.push(item); audit('CREATE', 'Category', item.id, undefined, item); return res.status(201).json(item);
});
app.patch('/api/categories/:id', (req, res) => {
  const item = category(routeId(req)); if (!item) return notFound(res); const before = { ...item }; if (typeof req.body.name === 'string') item.name = req.body.name.trim(); if (typeof req.body.active === 'boolean') item.active = req.body.active; if (req.body.sortOrder !== undefined) item.sortOrder = Number(req.body.sortOrder); audit('UPDATE', 'Category', item.id, before, item); return res.json(item);
});
app.get('/api/payment-methods', (_req, res) => res.json(store.paymentMethods));

app.get('/api/users', (_req, res) => res.json(store.users));
app.post('/api/users', (req, res) => {
  const name = String(req.body.name ?? '').trim(); const username = String(req.body.username ?? '').trim().toLowerCase(); const pin = String(req.body.pin ?? '');
  if (name.length < 2 || username.length < 2 || !/^\d{4}$/.test(pin)) return res.status(400).json({ message: 'Completa nombre, usuario y PIN de 4 dígitos' });
  if (store.users.some(item => item.username === username)) return res.status(409).json({ message: 'Ese usuario ya existe' });
  const item = { id: nextId('user'), name, username, role: req.body.role === 'ADMIN' ? 'ADMIN' : 'COLLABORATOR', active: true, createdAt: new Date() }; store.users.push(item); audit('CREATE', 'User', item.id, undefined, item); return res.status(201).json(item);
});
app.patch('/api/users/:id', (req, res) => {
  const item = store.users.find(row => row.id === routeId(req)); if (!item) return notFound(res); const before = { ...item }; if (typeof req.body.name === 'string') item.name = req.body.name.trim(); if (typeof req.body.active === 'boolean') item.active = req.body.active; if (req.body.pin && !/^\d{4}$/.test(String(req.body.pin))) return res.status(400).json({ message: 'El PIN debe tener 4 dígitos' }); audit('UPDATE', 'User', item.id, before, item); return res.json(item);
});

app.get('/api/expenses', (req, res) => {
  let items = store.expenses.filter(item => inRange(item.occurredAt, req)); if (req.query.categoryId) items = items.filter(item => item.categoryId === Number(req.query.categoryId)); if (req.query.status) items = items.filter(item => item.status === String(req.query.status)); if (req.query.q) items = items.filter(item => item.description.toLowerCase().includes(String(req.query.q).toLowerCase())); return res.json(page(items.slice().sort((a, b) => +new Date(b.occurredAt) - +new Date(a.occurredAt)), req));
});
app.post('/api/expenses', (req, res) => {
  const parsed = parseOrReply(expenseSchema, req.body); if ('errors' in parsed) return res.status(400).json({ message: 'Revisa los datos del gasto', errors: parsed.errors });
  const key = req.get('idempotency-key'); if (!key || key.length < 12) return res.status(400).json({ message: 'Falta la clave de seguridad del registro' }); const existing = store.idempotency.get(key); if (existing) return res.json(existing);
  const group = category(parsed.data.categoryId); if (!group?.active) return res.status(400).json({ message: 'Categoría inválida' }); if (group.name === 'Otros' && !parsed.data.otherDetail) return res.status(400).json({ message: 'Aclara el tipo de gasto' });
  const item = { id: nextId('expense'), ...parsed.data, category: group, total: multiplyMoney(parsed.data.quantity, parsed.data.unitValue), createdById: 1, createdBy: { id: 1, name: admin().name }, occurredAt: req.body.occurredAt ? new Date(req.body.occurredAt) : new Date(), status: 'REGISTERED', createdAt: new Date(), voidReason: null }; store.expenses.push(item); store.idempotency.set(key, item); audit('CREATE', 'Expense', item.id, undefined, item); return res.status(201).json(item);
});
app.patch('/api/expenses/:id', (req, res) => {
  const item = store.expenses.find(row => row.id === routeId(req)); if (!item) return notFound(res); const before = { ...item }; if (req.body.status) item.status = req.body.status; if (req.body.description) item.description = String(req.body.description).trim(); if (req.body.voidReason) { item.voidReason = String(req.body.voidReason); item.status = 'VOIDED'; item.voidedAt = new Date(); } audit(item.status === 'VOIDED' ? 'VOID' : 'UPDATE', 'Expense', item.id, before, item); return res.json(item);
});

app.get('/api/incomes', (req, res) => res.json(page(store.incomes.filter(item => inRange(item.occurredAt, req)).slice().sort((a, b) => +new Date(b.occurredAt) - +new Date(a.occurredAt)), req)));
app.post('/api/incomes', (req, res) => {
  const parsed = parseOrReply(incomeSchema, req.body); if ('errors' in parsed) return res.status(400).json({ message: 'Revisa los datos del ingreso', errors: parsed.errors }); const item = { id: nextId('income'), ...parsed.data, status: 'ACTIVE', createdById: 1, createdAt: new Date() }; store.incomes.push(item); audit('CREATE', 'Income', item.id, undefined, item); return res.status(201).json(item);
});
app.patch('/api/incomes/:id', (req, res) => {
  const item = store.incomes.find(row => row.id === routeId(req)); if (!item) return notFound(res); const before = { ...item }; if (req.body.void) { item.status = 'VOIDED'; item.voidedAt = new Date(); } else if (typeof req.body.note === 'string') item.note = req.body.note; audit(req.body.void ? 'VOID' : 'UPDATE', 'Income', item.id, before, item); return res.json(item);
});

app.get('/api/payables', (_req, res) => res.json(store.payables.slice().sort((a, b) => +new Date(a.dueDate) - +new Date(b.dueDate))));
app.post('/api/payables', (req, res) => {
  const parsed = parseOrReply(payableSchema, req.body); if ('errors' in parsed) return res.status(400).json({ message: 'Revisa los datos de la cuenta', errors: parsed.errors }); const group = category(parsed.data.categoryId); if (!group) return res.status(400).json({ message: 'Categoría inválida' }); const item = { id: nextId('payable'), ...parsed.data, category: group, status: 'PENDING', paidAt: null, expense: null, createdAt: new Date() }; store.payables.push(item); audit('CREATE', 'Payable', item.id, undefined, item); return res.status(201).json(item);
});
app.post('/api/payables/:id/pay', (req, res) => {
  const item = store.payables.find(row => row.id === routeId(req)); if (!item) return notFound(res); if (item.expense) return res.json(item); const before = { ...item }; const paidAt = req.body.paidAt ? new Date(req.body.paidAt) : new Date(); const method = String(req.body.paymentMethod ?? 'Efectivo'); const expense = makeExpense(`Pago: ${item.name}`, item.category, item.amount, method, paidAt, item.beneficiary); store.expenses.push(expense); item.status = 'PAID'; item.paidAt = paidAt; item.paymentMethod = method; item.expense = expense; audit('PAY', 'Payable', item.id, before, item); return res.json(item);
});

app.get('/api/recurring', (_req, res) => res.json(store.recurring));
app.post('/api/recurring', (req, res) => {
  const group = category(Number(req.body.categoryId)); const name = String(req.body.name ?? '').trim(); const beneficiary = String(req.body.beneficiary ?? '').trim(); if (!group || name.length < 2 || beneficiary.length < 2 || !(Number(req.body.estimatedValue) > 0) || !req.body.startDate) return res.status(400).json({ message: 'Revisa los datos del pago recurrente' }); const occurrence = { id: nextId('occurrence'), dueDate: new Date(req.body.startDate), status: 'PENDING' }; const item = { id: nextId('recurring'), name, beneficiary, categoryId: group.id, category: group, estimatedValue: Number(req.body.estimatedValue).toFixed(2), frequency: req.body.frequency || 'MONTHLY', intervalDays: req.body.frequency === 'CUSTOM' ? Number(req.body.intervalDays) : null, startDate: new Date(req.body.startDate), endDate: req.body.endDate ? new Date(req.body.endDate) : null, nextDueDate: new Date(req.body.startDate), reminderDays: Number(req.body.reminderDays) || 3, active: true, occurrences: [occurrence] }; store.recurring.push(item); audit('CREATE', 'RecurringPaymentRule', item.id, undefined, item); return res.status(201).json(item);
});
app.post('/api/recurring/generate', (_req, res) => res.json({ created: 0 }));

app.get('/api/employees', (_req, res) => res.json(store.employees));
app.post('/api/employees', (req, res) => {
  const name = String(req.body.name ?? '').trim(); const position = String(req.body.position ?? '').trim(); const usualPayment = Number(req.body.usualPayment); if (name.length < 2 || position.length < 2 || !(usualPayment >= 0)) return res.status(400).json({ message: 'Revisa los datos del empleado' }); const item = { id: nextId('employee'), name, document: req.body.document || null, position, usualPayment: usualPayment.toFixed(2), active: true, createdAt: new Date() }; store.employees.push(item); audit('CREATE', 'Employee', item.id, undefined, item); return res.status(201).json(item);
});
app.get('/api/payroll', (_req, res) => res.json(store.payroll));
app.post('/api/payroll', (req, res) => {
  const person = employee(Number(req.body.employeeId)); const base = Number(req.body.basePayment), extras = Number(req.body.extras || 0), bonuses = Number(req.body.bonuses || 0), deductions = Number(req.body.deductions || 0), total = base + extras + bonuses - deductions; if (!person || !req.body.periodFrom || !req.body.periodTo || !req.body.dueDate || !(total >= 0)) return res.status(400).json({ message: 'Revisa los datos de la nómina' }); const item = { id: nextId('payroll'), employeeId: person.id, employee: person, periodFrom: new Date(req.body.periodFrom), periodTo: new Date(req.body.periodTo), basePayment: base.toFixed(2), extras: extras.toFixed(2), bonuses: bonuses.toFixed(2), deductions: deductions.toFixed(2), total: total.toFixed(2), dueDate: new Date(req.body.dueDate), status: 'PENDING', paidAt: null, expense: null }; store.payroll.push(item); audit('CREATE', 'PayrollPayment', item.id, undefined, item); return res.status(201).json(item);
});
app.post('/api/payroll/:id/pay', (req, res) => {
  const item = store.payroll.find(row => row.id === routeId(req)); if (!item) return notFound(res); if (item.expense) return res.json(item); const before = { ...item }; const paidAt = req.body.paidAt ? new Date(req.body.paidAt) : new Date(); const method = String(req.body.paymentMethod ?? 'Efectivo'); const group = store.categories.find(row => row.name === 'Nómina')!; const expense = makeExpense(`Nómina: ${item.employee.name}`, group, item.total, method, paidAt); store.expenses.push(expense); item.status = 'PAID'; item.paidAt = paidAt; item.paymentMethod = method; item.expense = expense; audit('PAY', 'PayrollPayment', item.id, before, item); return res.json(item);
});

function makeExpense(description: string, group: Row, total: string, paymentMethod: string, occurredAt: Date, supplier: string | null = null) {
  return { id: nextId('expense'), description, categoryId: group.id, category: group, quantity: 1, unit: 'unidad', unitValue: total, total, paymentMethod, supplier, createdById: 1, createdBy: { id: 1, name: admin().name }, occurredAt, status: 'VERIFIED', createdAt: new Date() };
}

app.get('/api/agenda', (_req, res) => res.json({ events: store.events, payables: store.payables.filter(item => item.status === 'PENDING'), recurring: store.recurring.flatMap(rule => rule.occurrences.map((occurrence: Row) => ({ ...occurrence, rule }))), payroll: store.payroll.filter(item => item.status === 'PENDING') }));
app.post('/api/events', (req, res) => {
  const title = String(req.body.title ?? '').trim(); if (title.length < 2 || !req.body.startsAt) return res.status(400).json({ message: 'Completa el título y la fecha' }); const item = { id: nextId('event'), title, startsAt: new Date(req.body.startsAt), description: req.body.description || null, type: req.body.type || 'manual', status: 'PENDING', createdAt: new Date() }; store.events.push(item); audit('CREATE', 'CalendarEvent', item.id, undefined, item); return res.status(201).json(item);
});

app.get('/api/dashboard', (req, res) => {
  const now = new Date(); const from = req.query.from ? new Date(String(req.query.from)) : new Date(now.getFullYear(), now.getMonth(), 1); const to = req.query.to ? new Date(String(req.query.to)) : now; to.setHours(23, 59, 59, 999); const inside = (date: Date | string) => +new Date(date) >= +from && +new Date(date) <= +to;
  const incomes = store.incomes.filter(item => item.status === 'ACTIVE' && inside(item.occurredAt)); const expenses = store.expenses.filter(item => item.status !== 'VOIDED' && inside(item.occurredAt)); const income = incomes.reduce((sum, item) => sum + Number(item.total), 0); const expense = expenses.reduce((sum, item) => sum + Number(item.total), 0); const groups = new Map<string, number>(); const trend = new Map<string, { day: string; ingresos: number; gastos: number }>();
  expenses.forEach(item => { groups.set(item.category.name, (groups.get(item.category.name) || 0) + Number(item.total)); const day = new Date(item.occurredAt).toISOString().slice(0, 10); const row = trend.get(day) || { day, ingresos: 0, gastos: 0 }; row.gastos += Number(item.total); trend.set(day, row); }); incomes.forEach(item => { const day = new Date(item.occurredAt).toISOString().slice(0, 10); const row = trend.get(day) || { day, ingresos: 0, gastos: 0 }; row.ingresos += Number(item.total); trend.set(day, row); });
  const pendingPayroll = store.payroll.filter(item => item.status === 'PENDING'); const paidPayroll = store.payroll.filter(item => item.status === 'PAID' && item.paidAt && inside(item.paidAt)); const week = +now + 7 * 86_400_000;
  return res.json({ income, expense, profit: income - expense, payrollPending: pendingPayroll.reduce((sum, item) => sum + Number(item.total), 0), payrollPaid: paidPayroll.reduce((sum, item) => sum + Number(item.total), 0), upcoming: store.payables.filter(item => item.status === 'PENDING' && +new Date(item.dueDate) >= +now && +new Date(item.dueDate) <= week).length, overdue: store.payables.filter(item => item.status === 'PENDING' && +new Date(item.dueDate) < +now).length, pendingVerification: store.expenses.filter(item => item.status === 'REGISTERED').length, latest: store.expenses.slice().sort((a, b) => +new Date(b.occurredAt) - +new Date(a.occurredAt)).slice(0, 5), expensesByCategory: [...groups].map(([name, total]) => ({ name, total: total.toFixed(2) })), trend: [...trend.values()].sort((a, b) => a.day.localeCompare(b.day)) });
});

app.get('/api/reports/expenses.csv', (req, res) => {
  const quote = (value: unknown) => `"${String(value ?? '').replaceAll('"', '""')}"`; const items = store.expenses.filter(item => item.status !== 'VOIDED' && inRange(item.occurredAt, req)); const rows: unknown[][] = [['Fecha', 'Concepto', 'Categoría', 'Cantidad', 'Unidad', 'Valor unitario', 'Total', 'Método de pago', 'Proveedor', 'Registrado por'], ...items.map(item => [new Date(item.occurredAt).toISOString(), item.description, item.category.name, item.quantity, item.unit, item.unitValue, item.total, item.paymentMethod, item.supplier, item.createdBy.name])]; return res.set({ 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="gastos.csv"' }).send('\ufeff' + rows.map(row => row.map(quote).join(',')).join('\r\n'));
});
app.get('/api/audit', (req, res) => res.json(page(store.audit, req).items));
app.get('/api/settings', (_req, res) => res.json(store.settings));
app.patch('/api/settings', (req, res) => {
  Object.entries(req.body as Record<string, unknown>).forEach(([key, value]) => { const item = store.settings.find(row => row.key === key); if (item) item.value = String(value); else store.settings.push({ key, value: String(value) }); }); audit('UPDATE', 'BusinessSetting', 'global', undefined, req.body); return res.json({ message: 'Configuración guardada temporalmente' });
});

app.use('/api', (_req, res) => res.status(404).json({ message: 'Ruta no encontrada' }));
app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => { console.error('Error temporal', error instanceof Error ? error.message : 'desconocido'); return res.status(500).json({ message: 'Ocurrió un error inesperado. Intenta nuevamente.' }); });

if (production) {
  const currentDir = path.dirname(fileURLToPath(import.meta.url)); const publicDir = path.resolve(currentDir, '../public'); app.use(express.static(publicDir)); app.get('*splat', (_req, res) => res.sendFile(path.join(publicDir, 'index.html')));
}

export { app };
