import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express, { type NextFunction, type Request, type Response } from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import argon2 from 'argon2';
import { addHours, addDays, endOfDay, startOfDay, startOfMonth, startOfWeek } from 'date-fns';
import { fromZonedTime, toZonedTime } from 'date-fns-tz';
import { Prisma } from '@prisma/client';
import { db } from './db.js';
import { audit, cleanJson, COOKIE_NAME, hashToken, randomToken, requireAdmin, requireAuth, requireCsrf } from './security.js';
import { expenseSchema, incomeSchema, loginSchema, parseOrReply, payableSchema } from './schemas.js';
import { multiplyMoney } from '../shared/money.js';
import { generateRecurringOccurrences } from './recurring.js';

const app = express();
const production = process.env.NODE_ENV === 'production';
const appUrl = process.env.APP_URL;
if (production) app.set('trust proxy', 1);
app.use(helmet({ contentSecurityPolicy: production ? undefined : false }));
app.use(express.json({ limit: '256kb' }));
app.use(cookieParser());
app.use('/api', rateLimit({ windowMs: 15 * 60_000, limit: 300, standardHeaders: 'draft-8', legacyHeaders: false }));
app.use('/api', (req, res, next) => {
  const origin = req.get('origin');
  if (origin && appUrl && origin !== new URL(appUrl).origin) return res.status(403).json({ message: 'Origen no permitido' });
  next();
});

const asyncRoute = (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) => { Promise.resolve(fn(req, res, next)).catch(next); };
const id = (req: Request) => Number(req.params.id);
const pageArgs = (req: Request) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 20));
  return { page, pageSize, skip: (page - 1) * pageSize };
};
const dateWhere = (req: Request, field = 'occurredAt') => {
  const range: Record<string, Date> = {};
  if (req.query.from) range.gte = new Date(String(req.query.from));
  if (req.query.to) range.lte = endOfDay(new Date(String(req.query.to)));
  return Object.keys(range).length ? { [field]: range } : {};
};
const json = (res: Response, value: unknown, status = 200) => res.status(status).json(cleanJson(value));

app.get('/api/health', asyncRoute(async (_req, res) => {
  await db.$queryRaw`SELECT 1`;
  res.json({ status: 'ok', database: 'conectada', timestamp: new Date().toISOString() });
}));

app.post('/api/auth/login', asyncRoute(async (req, res) => {
  const parsed = parseOrReply(loginSchema, req.body);
  if ('errors' in parsed) return res.status(400).json({ message: 'Revisa los datos de acceso', errors: parsed.errors });
  const { username, pin, portal } = parsed.data;
  const ipHash = hashToken(`${process.env.SESSION_SECRET ?? 'dev'}:${req.ip ?? 'unknown'}`);
  const since = new Date(Date.now() - 15 * 60_000);
  const failures = await db.loginAttempt.count({ where: { username, ipHash, success: false, createdAt: { gte: since } } });
  if (failures >= 5) return res.status(429).json({ message: 'Demasiados intentos. Espera 15 minutos antes de volver a intentar.' });
  const user = await db.user.findUnique({ where: { username } });
  const valid = Boolean(user?.active && user.role === portal && await argon2.verify(user.pinHash, pin));
  await db.loginAttempt.create({ data: { username, ipHash, success: valid } });
  if (!valid || !user) return res.status(401).json({ message: 'Usuario, PIN o portal incorrecto' });
  await db.loginAttempt.deleteMany({ where: { username, ipHash, success: false } });
  const token = randomToken();
  const csrfToken = randomToken();
  const session = await db.session.create({ data: { tokenHash: hashToken(token), csrfToken, userId: user.id, expiresAt: addHours(new Date(), 8) } });
  res.cookie(COOKIE_NAME, token, { httpOnly: true, secure: production, sameSite: 'lax', maxAge: 8 * 60 * 60_000, path: '/' });
  return json(res, { user: { id: user.id, name: user.name, username: user.username, role: user.role }, csrfToken, expiresAt: session.expiresAt });
}));

app.post('/api/cron/recurring', asyncRoute(async (req, res) => {
  if (!process.env.CRON_SECRET || req.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) return res.status(401).json({ message: 'Secreto de cron inválido' });
  res.json({ created: await generateRecurringOccurrences(), runAt: new Date().toISOString() });
}));

app.use('/api', asyncRoute(requireAuth));
app.use('/api', requireCsrf);

app.get('/api/auth/me', (req, res) => json(res, { user: req.auth!.user, csrfToken: req.auth!.csrfToken }));
app.post('/api/auth/logout', asyncRoute(async (req, res) => {
  await db.session.delete({ where: { id: req.auth!.sessionId } }).catch(() => undefined);
  res.clearCookie(COOKIE_NAME, { path: '/' });
  res.json({ message: 'Sesión cerrada' });
}));

app.get('/api/categories', asyncRoute(async (req, res) => json(res, await db.category.findMany({ where: req.auth!.user.role === 'ADMIN' ? {} : { active: true }, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] }))));
app.post('/api/categories', requireAdmin, asyncRoute(async (req, res) => {
  const name = String(req.body.name ?? '').trim();
  if (name.length < 2) return res.status(400).json({ message: 'Escribe un nombre de categoría' });
  const item = await db.category.create({ data: { name, sortOrder: Number(req.body.sortOrder) || 0 } });
  await audit(req.auth!.user.id, 'CREATE', 'Category', item.id, undefined, item);
  return json(res, item, 201);
}));
app.patch('/api/categories/:id', requireAdmin, asyncRoute(async (req, res) => {
  const before = await db.category.findUniqueOrThrow({ where: { id: id(req) } });
  const item = await db.category.update({ where: { id: id(req) }, data: { name: req.body.name, active: req.body.active, sortOrder: req.body.sortOrder } });
  await audit(req.auth!.user.id, 'UPDATE', 'Category', item.id, before, item);
  return json(res, item);
}));
app.get('/api/payment-methods', asyncRoute(async (_req, res) => json(res, await db.paymentMethod.findMany({ where: { active: true }, orderBy: { sortOrder: 'asc' } }))));

app.get('/api/users', requireAdmin, asyncRoute(async (_req, res) => json(res, await db.user.findMany({ select: { id: true, username: true, name: true, role: true, active: true, createdAt: true }, orderBy: { name: 'asc' } }))));
app.post('/api/users', requireAdmin, asyncRoute(async (req, res) => {
  const pin = String(req.body.pin ?? '');
  if (!/^\d{4}$/.test(pin)) return res.status(400).json({ message: 'El PIN debe tener exactamente 4 dígitos' });
  const user = await db.user.create({ data: { username: String(req.body.username).trim().toLowerCase(), name: String(req.body.name).trim(), role: req.body.role === 'ADMIN' ? 'ADMIN' : 'COLLABORATOR', pinHash: await argon2.hash(pin, { type: argon2.argon2id }) } });
  await audit(req.auth!.user.id, 'CREATE', 'User', user.id, undefined, { username: user.username, name: user.name, role: user.role });
  return json(res, { id: user.id, username: user.username, name: user.name, role: user.role, active: user.active }, 201);
}));
app.patch('/api/users/:id', requireAdmin, asyncRoute(async (req, res) => {
  const before = await db.user.findUniqueOrThrow({ where: { id: id(req) } });
  const data: Prisma.UserUpdateInput = {};
  if (typeof req.body.name === 'string') data.name = req.body.name.trim();
  if (typeof req.body.active === 'boolean') data.active = req.body.active;
  if (req.body.pin) {
    if (!/^\d{4}$/.test(String(req.body.pin))) return res.status(400).json({ message: 'El PIN debe tener exactamente 4 dígitos' });
    data.pinHash = await argon2.hash(String(req.body.pin), { type: argon2.argon2id });
  }
  const user = await db.user.update({ where: { id: id(req) }, data });
  await audit(req.auth!.user.id, 'UPDATE', 'User', user.id, { name: before.name, active: before.active }, { name: user.name, active: user.active });
  return json(res, { id: user.id, username: user.username, name: user.name, role: user.role, active: user.active });
}));

app.get('/api/expenses', asyncRoute(async (req, res) => {
  const { page, pageSize, skip } = pageArgs(req);
  const where: Prisma.ExpenseWhereInput = { ...dateWhere(req), ...(req.auth!.user.role === 'COLLABORATOR' ? { createdById: req.auth!.user.id } : {}) };
  if (req.query.categoryId) where.categoryId = Number(req.query.categoryId);
  if (req.query.status) where.status = String(req.query.status) as any;
  if (req.query.q) where.description = { contains: String(req.query.q) };
  const [items, total] = await Promise.all([db.expense.findMany({ where, include: { category: true, createdBy: { select: { id: true, name: true } } }, orderBy: { occurredAt: 'desc' }, skip, take: pageSize }), db.expense.count({ where })]);
  return json(res, { items, pagination: { page, pageSize, total, pages: Math.ceil(total / pageSize) } });
}));
app.post('/api/expenses', asyncRoute(async (req, res) => {
  const parsed = parseOrReply(expenseSchema, req.body);
  if ('errors' in parsed) return res.status(400).json({ message: 'Revisa los datos del gasto', errors: parsed.errors });
  const key = req.get('idempotency-key');
  if (!key || key.length < 12 || key.length > 100) return res.status(400).json({ message: 'Falta la clave de seguridad del registro' });
  const existing = await db.expense.findUnique({ where: { idempotencyKey: key }, include: { category: true } });
  if (existing) return json(res, existing);
  const category = await db.category.findFirst({ where: { id: parsed.data.categoryId, active: true } });
  if (!category) return res.status(400).json({ message: 'La categoría ya no está disponible' });
  if (category.name === 'Otros' && !parsed.data.otherDetail) return res.status(400).json({ message: 'Aclara el tipo de gasto' });
  const item = await db.expense.create({ data: { ...parsed.data, total: multiplyMoney(parsed.data.quantity, parsed.data.unitValue), idempotencyKey: key, createdById: req.auth!.user.id }, include: { category: true, createdBy: { select: { id: true, name: true } } } });
  await audit(req.auth!.user.id, 'CREATE', 'Expense', item.id, undefined, item);
  return json(res, item, 201);
}));
app.patch('/api/expenses/:id', requireAdmin, asyncRoute(async (req, res) => {
  const before = await db.expense.findUniqueOrThrow({ where: { id: id(req) } });
  const data: Prisma.ExpenseUpdateInput = {};
  if (req.body.status) data.status = req.body.status;
  if (req.body.description) data.description = String(req.body.description).trim();
  if (req.body.voidReason) { data.voidReason = String(req.body.voidReason).trim(); data.voidedAt = new Date(); data.status = 'VOIDED'; }
  const item = await db.expense.update({ where: { id: id(req) }, data, include: { category: true, createdBy: { select: { id: true, name: true } } } });
  await audit(req.auth!.user.id, data.status === 'VOIDED' ? 'VOID' : 'UPDATE', 'Expense', item.id, before, item, item.voidReason ?? undefined);
  return json(res, item);
}));

app.get('/api/incomes', requireAdmin, asyncRoute(async (req, res) => {
  const { page, pageSize, skip } = pageArgs(req); const where = dateWhere(req);
  const [items, total] = await Promise.all([db.income.findMany({ where, orderBy: { occurredAt: 'desc' }, skip, take: pageSize }), db.income.count({ where })]);
  return json(res, { items, pagination: { page, pageSize, total } });
}));
app.post('/api/incomes', requireAdmin, asyncRoute(async (req, res) => {
  const parsed = parseOrReply(incomeSchema, req.body);
  if ('errors' in parsed) return res.status(400).json({ message: 'Revisa los datos del ingreso', errors: parsed.errors });
  const item = await db.income.create({ data: { ...parsed.data, createdById: req.auth!.user.id } });
  await audit(req.auth!.user.id, 'CREATE', 'Income', item.id, undefined, item); return json(res, item, 201);
}));
app.patch('/api/incomes/:id', requireAdmin, asyncRoute(async (req, res) => {
  const before = await db.income.findUniqueOrThrow({ where: { id: id(req) } });
  const item = await db.income.update({ where: { id: id(req) }, data: req.body.void ? { status: 'VOIDED', voidedAt: new Date() } : { note: req.body.note } });
  await audit(req.auth!.user.id, req.body.void ? 'VOID' : 'UPDATE', 'Income', item.id, before, item, req.body.reason); return json(res, item);
}));

app.get('/api/payables', requireAdmin, asyncRoute(async (req, res) => json(res, await db.payable.findMany({ include: { category: true }, orderBy: { dueDate: 'asc' } }))));
app.post('/api/payables', requireAdmin, asyncRoute(async (req, res) => {
  const parsed = parseOrReply(payableSchema, req.body); if ('errors' in parsed) return res.status(400).json({ message: 'Revisa los datos de la cuenta', errors: parsed.errors });
  const item = await db.payable.create({ data: parsed.data }); await audit(req.auth!.user.id, 'CREATE', 'Payable', item.id, undefined, item); return json(res, item, 201);
}));
app.post('/api/payables/:id/pay', requireAdmin, asyncRoute(async (req, res) => {
  const item = await db.payable.findUniqueOrThrow({ where: { id: id(req) }, include: { expense: true, category: true } });
  if (item.expense) return json(res, item);
  const paidAt = req.body.paidAt ? new Date(req.body.paidAt) : new Date(); const paymentMethod = String(req.body.paymentMethod ?? 'Efectivo');
  const result = await db.$transaction(async tx => {
    await tx.expense.create({ data: { description: `Pago: ${item.name}`, categoryId: item.categoryId, quantity: 1, unit: 'unidad', unitValue: item.amount, total: item.amount, paymentMethod, supplier: item.beneficiary, createdById: req.auth!.user.id, idempotencyKey: `payable:${item.id}`, payableId: item.id, occurredAt: paidAt, status: 'VERIFIED' } });
    return tx.payable.update({ where: { id: item.id }, data: { status: 'PAID', paidAt, paymentMethod }, include: { expense: true, category: true } });
  });
  await audit(req.auth!.user.id, 'PAY', 'Payable', item.id, item, result); return json(res, result);
}));

app.get('/api/recurring', requireAdmin, asyncRoute(async (_req, res) => json(res, await db.recurringPaymentRule.findMany({ include: { category: true, occurrences: { orderBy: { dueDate: 'desc' }, take: 3 } }, orderBy: { nextDueDate: 'asc' } }))));
app.post('/api/recurring', requireAdmin, asyncRoute(async (req, res) => {
  const data = req.body;
  const item = await db.recurringPaymentRule.create({ data: { name: String(data.name), beneficiary: String(data.beneficiary), categoryId: Number(data.categoryId), estimatedValue: new Prisma.Decimal(data.estimatedValue), frequency: data.frequency, intervalDays: data.frequency === 'CUSTOM' ? Number(data.intervalDays) : null, startDate: new Date(data.startDate), endDate: data.endDate ? new Date(data.endDate) : null, nextDueDate: new Date(data.startDate), reminderDays: Number(data.reminderDays) || 3 } });
  await audit(req.auth!.user.id, 'CREATE', 'RecurringPaymentRule', item.id, undefined, item); await generateRecurringOccurrences(); return json(res, item, 201);
}));
app.post('/api/recurring/generate', requireAdmin, asyncRoute(async (_req, res) => res.json({ created: await generateRecurringOccurrences() })));
app.get('/api/employees', requireAdmin, asyncRoute(async (_req, res) => json(res, await db.employee.findMany({ orderBy: { name: 'asc' } }))));
app.post('/api/employees', requireAdmin, asyncRoute(async (req, res) => {
  const item = await db.employee.create({ data: { name: String(req.body.name).trim(), document: req.body.document || null, position: String(req.body.position).trim(), usualPayment: new Prisma.Decimal(req.body.usualPayment), active: true } });
  await audit(req.auth!.user.id, 'CREATE', 'Employee', item.id, undefined, item); return json(res, item, 201);
}));
app.get('/api/payroll', requireAdmin, asyncRoute(async (_req, res) => json(res, await db.payrollPayment.findMany({ include: { employee: true, expense: true }, orderBy: { dueDate: 'desc' } }))));
app.post('/api/payroll', requireAdmin, asyncRoute(async (req, res) => {
  const base = Number(req.body.basePayment), extras = Number(req.body.extras || 0), bonuses = Number(req.body.bonuses || 0), deductions = Number(req.body.deductions || 0);
  const total = base + extras + bonuses - deductions;
  if (!(total >= 0)) return res.status(400).json({ message: 'El total de nómina no puede ser negativo' });
  const item = await db.payrollPayment.create({ data: { employeeId: Number(req.body.employeeId), periodFrom: new Date(req.body.periodFrom), periodTo: new Date(req.body.periodTo), basePayment: base, extras, bonuses, deductions, total, dueDate: new Date(req.body.dueDate), notes: req.body.notes || null } });
  await audit(req.auth!.user.id, 'CREATE', 'PayrollPayment', item.id, undefined, item); return json(res, item, 201);
}));
app.post('/api/payroll/:id/pay', requireAdmin, asyncRoute(async (req, res) => {
  const item = await db.payrollPayment.findUniqueOrThrow({ where: { id: id(req) }, include: { employee: true, expense: true } }); if (item.expense) return json(res, item);
  const category = await db.category.findUniqueOrThrow({ where: { name: 'Nómina' } }); const paidAt = req.body.paidAt ? new Date(req.body.paidAt) : new Date(); const method = String(req.body.paymentMethod ?? 'Efectivo');
  const result = await db.$transaction(async tx => {
    await tx.expense.create({ data: { description: `Nómina: ${item.employee.name}`, categoryId: category.id, quantity: 1, unit: 'unidad', unitValue: item.total, total: item.total, paymentMethod: method, createdById: req.auth!.user.id, idempotencyKey: `payroll:${item.id}`, payrollId: item.id, occurredAt: paidAt, status: 'VERIFIED' } });
    return tx.payrollPayment.update({ where: { id: item.id }, data: { status: 'PAID', paidAt, paymentMethod: method }, include: { employee: true, expense: true } });
  });
  await audit(req.auth!.user.id, 'PAY', 'PayrollPayment', item.id, item, result); return json(res, result);
}));

app.get('/api/agenda', requireAdmin, asyncRoute(async (req, res) => {
  await generateRecurringOccurrences();
  const [events, payables, recurring, payroll] = await Promise.all([
    db.calendarEvent.findMany({ orderBy: { startsAt: 'asc' } }),
    db.payable.findMany({ where: { status: 'PENDING' }, orderBy: { dueDate: 'asc' } }),
    db.paymentOccurrence.findMany({ where: { status: 'PENDING' }, include: { rule: true }, orderBy: { dueDate: 'asc' } }),
    db.payrollPayment.findMany({ where: { status: 'PENDING' }, include: { employee: true }, orderBy: { dueDate: 'asc' } })
  ]);
  return json(res, { events, payables, recurring, payroll });
}));
app.post('/api/events', requireAdmin, asyncRoute(async (req, res) => {
  const item = await db.calendarEvent.create({ data: { title: String(req.body.title).trim(), startsAt: new Date(req.body.startsAt), description: req.body.description || null, type: req.body.type || 'manual' } });
  await audit(req.auth!.user.id, 'CREATE', 'CalendarEvent', item.id, undefined, item); return json(res, item, 201);
}));

function dashboardRange(req: Request) {
  if (req.query.from && req.query.to) return { gte: new Date(String(req.query.from)), lte: endOfDay(new Date(String(req.query.to))) };
  const now = new Date(); const bogota = toZonedTime(now, 'America/Bogota'); const period = String(req.query.period || 'month');
  const start = period === 'today' ? startOfDay(bogota) : period === 'week' ? startOfWeek(bogota, { weekStartsOn: 1 }) : startOfMonth(bogota);
  return { gte: fromZonedTime(start, 'America/Bogota'), lte: now };
}
app.get('/api/dashboard', requireAdmin, asyncRoute(async (req, res) => {
  await generateRecurringOccurrences(); const range = dashboardRange(req);
  const [income, expense, pendingPayroll, paidPayroll, upcoming, overdue, pendingVerification, latest, expensesByCategory, incomesByDay, expensesByDay] = await Promise.all([
    db.income.aggregate({ where: { occurredAt: range, status: 'ACTIVE' }, _sum: { total: true } }),
    db.expense.aggregate({ where: { occurredAt: range, status: { not: 'VOIDED' } }, _sum: { total: true } }),
    db.payrollPayment.aggregate({ where: { dueDate: range, status: 'PENDING' }, _sum: { total: true } }),
    db.payrollPayment.aggregate({ where: { paidAt: range, status: 'PAID' }, _sum: { total: true } }),
    db.payable.count({ where: { status: 'PENDING', dueDate: { gte: new Date(), lte: addDays(new Date(), 7) } } }),
    db.payable.count({ where: { status: 'PENDING', dueDate: { lt: new Date() } } }),
    db.expense.count({ where: { status: 'REGISTERED' } }),
    db.expense.findMany({ include: { category: true, createdBy: { select: { name: true } } }, orderBy: { occurredAt: 'desc' }, take: 5 }),
    db.$queryRaw<Array<{ name: string; total: Prisma.Decimal }>>`SELECT c.name, SUM(e.total) total FROM Expense e JOIN Category c ON c.id=e.categoryId WHERE e.status <> 'VOIDED' AND e.occurredAt BETWEEN ${range.gte} AND ${range.lte} GROUP BY c.id,c.name ORDER BY total DESC`,
    db.$queryRaw<Array<{ day: Date; total: Prisma.Decimal }>>`SELECT DATE(occurredAt) day, SUM(total) total FROM Income WHERE status='ACTIVE' AND occurredAt BETWEEN ${range.gte} AND ${range.lte} GROUP BY DATE(occurredAt)`,
    db.$queryRaw<Array<{ day: Date; total: Prisma.Decimal }>>`SELECT DATE(occurredAt) day, SUM(total) total FROM Expense WHERE status <> 'VOIDED' AND occurredAt BETWEEN ${range.gte} AND ${range.lte} GROUP BY DATE(occurredAt)`
  ]);
  const incomeTotal = Number(income._sum.total || 0), expenseTotal = Number(expense._sum.total || 0);
  return json(res, { income: incomeTotal, expense: expenseTotal, profit: incomeTotal - expenseTotal, payrollPending: Number(pendingPayroll._sum.total || 0), payrollPaid: Number(paidPayroll._sum.total || 0), upcoming, overdue, pendingVerification, latest, expensesByCategory, trend: mergeTrend(incomesByDay, expensesByDay) });
}));

function mergeTrend(incomes: Array<{ day: Date; total: Prisma.Decimal }>, expenses: Array<{ day: Date; total: Prisma.Decimal }>) {
  const rows = new Map<string, { day: string; ingresos: number; gastos: number }>();
  for (const x of incomes) { const day = new Date(x.day).toISOString().slice(0, 10); rows.set(day, { day, ingresos: Number(x.total), gastos: 0 }); }
  for (const x of expenses) { const day = new Date(x.day).toISOString().slice(0, 10); const row = rows.get(day) ?? { day, ingresos: 0, gastos: 0 }; row.gastos = Number(x.total); rows.set(day, row); }
  return [...rows.values()].sort((a, b) => a.day.localeCompare(b.day));
}

app.get('/api/reports/expenses.csv', requireAdmin, asyncRoute(async (req, res) => {
  const items = await db.expense.findMany({ where: { ...dateWhere(req), status: { not: 'VOIDED' } }, include: { category: true, createdBy: { select: { name: true } } }, orderBy: { occurredAt: 'desc' } });
  const quote = (v: unknown) => `"${String(v ?? '').replaceAll('"', '""')}"`;
  const rows = [['Fecha', 'Concepto', 'Categoría', 'Cantidad', 'Unidad', 'Valor unitario', 'Total', 'Método de pago', 'Proveedor', 'Registrado por'], ...items.map(x => [x.occurredAt.toISOString(), x.description, x.category.name, x.quantity, x.unit, x.unitValue, x.total, x.paymentMethod, x.supplier, x.createdBy.name])];
  res.set({ 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="gastos.csv"' }).send('\ufeff' + rows.map(row => row.map(quote).join(',')).join('\r\n'));
}));
app.get('/api/audit', requireAdmin, asyncRoute(async (req, res) => { const { skip, pageSize } = pageArgs(req); return json(res, await db.auditLog.findMany({ include: { user: { select: { name: true } } }, orderBy: { createdAt: 'desc' }, skip, take: pageSize })); }));
app.get('/api/settings', requireAdmin, asyncRoute(async (_req, res) => json(res, await db.businessSetting.findMany({ orderBy: { key: 'asc' } }))));
app.patch('/api/settings', requireAdmin, asyncRoute(async (req, res) => {
  const entries = Object.entries(req.body as Record<string, string>);
  await db.$transaction(entries.map(([key, value]) => db.businessSetting.upsert({ where: { key }, update: { value: String(value) }, create: { key, value: String(value) } })));
  await audit(req.auth!.user.id, 'UPDATE', 'BusinessSetting', 'global', undefined, req.body); res.json({ message: 'Configuración guardada' });
}));

app.use('/api', (_req, res) => res.status(404).json({ message: 'Ruta no encontrada' }));
app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  const code = error instanceof Prisma.PrismaClientKnownRequestError ? error.code : undefined;
  if (code === 'P2002') return res.status(409).json({ message: 'Ya existe un registro con esos datos' });
  if (code === 'P2025') return res.status(404).json({ message: 'Registro no encontrado' });
  console.error('Error de servidor', error instanceof Error ? error.message : 'desconocido');
  return res.status(500).json({ message: 'Ocurrió un error inesperado. Intenta nuevamente.' });
});

if (production) {
  const currentDir = path.dirname(fileURLToPath(import.meta.url)); const publicDir = path.resolve(currentDir, '../public');
  app.use(express.static(publicDir));
  app.get('*splat', (_req, res) => res.sendFile(path.join(publicDir, 'index.html')));
}

export { app };
