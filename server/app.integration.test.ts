// @vitest-environment node
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import argon2 from 'argon2';

const fake = vi.hoisted(() => {
  const model = () => new Proxy({}, { get: (target, key) => (target as any)[key] ?? ((target as any)[key] = vi.fn()) });
  const db: any = {
    user: model(), session: model(), loginAttempt: model(), expense: model(), category: model(),
    paymentMethod: model(), income: model(), payable: model(), recurringPaymentRule: model(),
    paymentOccurrence: model(), employee: model(), payrollPayment: model(), calendarEvent: model(),
    businessSetting: model(), auditLog: model(),
    $queryRaw: vi.fn(), $transaction: vi.fn()
  };
  return db;
});

vi.mock('./db.js', () => ({ db: fake }));

let app: import('express').Express;
let pinHash: string;
const admin = { id: 1, username: 'admin', name: 'Ángela', role: 'ADMIN', active: true };
const collaborator = { id: 2, username: 'cata', name: 'Catalina', role: 'COLLABORATOR', active: true };

beforeAll(async () => {
  process.env.SESSION_SECRET = 'test-secret-that-is-long-enough';
  pinHash = await argon2.hash('1234');
  ({ app } = await import('./app.js'));
});

beforeEach(() => {
  vi.clearAllMocks();
  fake.loginAttempt.count.mockResolvedValue(0);
  fake.loginAttempt.create.mockResolvedValue({});
  fake.loginAttempt.deleteMany.mockResolvedValue({ count: 0 });
  fake.session.create.mockResolvedValue({ expiresAt: new Date(Date.now() + 60_000) });
  fake.session.findUnique.mockResolvedValue({ id: 20, csrfToken: 'csrf-test', expiresAt: new Date(Date.now() + 60_000), user: admin });
  fake.auditLog.create.mockResolvedValue({});
  fake.recurringPaymentRule.findMany.mockResolvedValue([]);
  fake.$transaction.mockImplementation(async (work: any) => typeof work === 'function' ? work(fake) : Promise.all(work));
});

describe('autenticación y permisos', () => {
  it('permite acceso con usuario, portal y PIN correctos', async () => {
    fake.user.findUnique.mockResolvedValue({ ...admin, pinHash });
    const response = await request(app).post('/api/auth/login').send({ username: 'admin', pin: '1234', portal: 'ADMIN' });
    expect(response.status).toBe(200);
    expect(response.body.user.role).toBe('ADMIN');
    expect(response.headers['set-cookie']?.[0]).toContain('HttpOnly');
  });

  it('rechaza un PIN incorrecto sin revelar la causa', async () => {
    fake.user.findUnique.mockResolvedValue({ ...admin, pinHash });
    const response = await request(app).post('/api/auth/login').send({ username: 'admin', pin: '9999', portal: 'ADMIN' });
    expect(response.status).toBe(401);
    expect(response.body.message).toContain('incorrecto');
  });

  it('bloquea después de cinco intentos fallidos en 15 minutos', async () => {
    fake.loginAttempt.count.mockResolvedValue(5);
    const response = await request(app).post('/api/auth/login').send({ username: 'admin', pin: '9999', portal: 'ADMIN' });
    expect(response.status).toBe(429);
  });

  it('impide que un colaborador use endpoints administrativos', async () => {
    fake.session.findUnique.mockResolvedValue({ id: 21, csrfToken: 'csrf-test', expiresAt: new Date(Date.now() + 60_000), user: collaborator });
    const response = await request(app).get('/api/users').set('Cookie', 'angela_session=test-token');
    expect(response.status).toBe(403);
  });
});

describe('gastos protegidos', () => {
  it('filtra los envíos por el colaborador autenticado', async () => {
    fake.session.findUnique.mockResolvedValue({ id: 21, csrfToken: 'csrf-test', expiresAt: new Date(Date.now() + 60_000), user: collaborator });
    fake.expense.findMany.mockResolvedValue([]); fake.expense.count.mockResolvedValue(0);
    const response = await request(app).get('/api/expenses').set('Cookie', 'angela_session=test-token');
    expect(response.status).toBe(200);
    expect(fake.expense.findMany.mock.calls[0][0].where.createdById).toBe(collaborator.id);
  });

  it('devuelve el mismo gasto al repetir una clave de idempotencia', async () => {
    fake.expense.findUnique.mockResolvedValue({ id: 88, description: 'Aceite', total: '20000.00', category: { name: 'Ingredientes o comida' } });
    const send = () => request(app).post('/api/expenses').set('Cookie', 'angela_session=test-token').set('x-csrf-token', 'csrf-test').set('idempotency-key', 'key-idempotente-123').send({ description: 'Aceite', categoryId: 1, quantity: 1, unit: 'litro', unitValue: 20000, paymentMethod: 'Efectivo' });
    expect((await send()).body.id).toBe(88);
    expect((await send()).body.id).toBe(88);
    expect(fake.expense.create).not.toHaveBeenCalled();
  });
});

describe('integridad contable', () => {
  it('pagar una cuenta crea exactamente un gasto y repetir no lo duplica', async () => {
    const payable = { id: 9, name: 'Arriendo', beneficiary: 'Arrendador', categoryId: 3, amount: '900000.00', category: { name: 'Arriendo' }, expense: null };
    fake.payable.findUniqueOrThrow.mockResolvedValueOnce(payable).mockResolvedValueOnce({ ...payable, expense: { id: 44 } });
    fake.expense.create.mockResolvedValue({ id: 44 }); fake.payable.update.mockResolvedValue({ ...payable, status: 'PAID', expense: { id: 44 } });
    const send = () => request(app).post('/api/payables/9/pay').set('Cookie', 'angela_session=test-token').set('x-csrf-token', 'csrf-test').send({ paymentMethod: 'Transferencia' });
    expect((await send()).status).toBe(200); expect((await send()).status).toBe(200);
    expect(fake.expense.create).toHaveBeenCalledTimes(1);
  });

  it('pagar nómina crea exactamente un gasto relacionado', async () => {
    const payroll = { id: 7, total: '450000.00', employee: { name: 'María' }, expense: null };
    fake.payrollPayment.findUniqueOrThrow.mockResolvedValue(payroll); fake.category.findUniqueOrThrow.mockResolvedValue({ id: 4, name: 'Nómina' }); fake.expense.create.mockResolvedValue({ id: 55 }); fake.payrollPayment.update.mockResolvedValue({ ...payroll, status: 'PAID', expense: { id: 55 } });
    const response = await request(app).post('/api/payroll/7/pay').set('Cookie', 'angela_session=test-token').set('x-csrf-token', 'csrf-test').send({ paymentMethod: 'Efectivo' });
    expect(response.status).toBe(200); expect(fake.expense.create).toHaveBeenCalledTimes(1);
    expect(fake.expense.create.mock.calls[0][0].data.idempotencyKey).toBe('payroll:7');
  });

  it('el dashboard excluye anulados de los totales', async () => {
    fake.income.aggregate.mockResolvedValue({ _sum: { total: '100000.00' } });
    fake.expense.aggregate.mockResolvedValue({ _sum: { total: '25000.00' } });
    fake.payrollPayment.aggregate.mockResolvedValue({ _sum: { total: '0' } });
    fake.payable.count.mockResolvedValue(0); fake.expense.count.mockResolvedValue(0); fake.expense.findMany.mockResolvedValue([]); fake.$queryRaw.mockResolvedValue([]);
    const response = await request(app).get('/api/dashboard').set('Cookie', 'angela_session=test-token');
    expect(response.status).toBe(200); expect(response.body.profit).toBe(75000);
    expect(fake.expense.aggregate.mock.calls[0][0].where.status).toEqual({ not: 'VOIDED' });
  });
});
