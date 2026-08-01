import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { app, resetMemoryState } from './memory-app.js';

describe('modo temporal sin base de datos', () => {
  beforeEach(() => resetMemoryState());

  it('sirve la aplicación sin consultar MySQL', async () => {
    const health = await request(app).get('/api/health').expect(200);
    expect(health.body).toMatchObject({ status: 'ok', storage: 'temporal', database: 'desactivada' });
    const auth = await request(app).get('/api/auth/me').expect(200);
    expect(auth.body.user).toMatchObject({ username: 'admin-temporal', role: 'ADMIN' });
  });

  it('mantiene formularios y resumen operativos durante la sesión', async () => {
    await request(app).post('/api/incomes').send({ concept: 'Venta de prueba', type: 'venta', total: 30000, paymentMethod: 'Efectivo', channel: 'punto de venta', occurredAt: new Date().toISOString() }).expect(201);
    await request(app).post('/api/expenses').set('idempotency-key', 'prueba-temporal-0001').send({ description: 'Insumos de prueba', categoryId: 1, quantity: 2, unit: 'unidad', unitValue: 5000, paymentMethod: 'Efectivo' }).expect(201);
    const dashboard = await request(app).get('/api/dashboard').expect(200);
    expect(dashboard.body).toMatchObject({ income: 30000, expense: 10000, profit: 20000, pendingVerification: 1 });
  });
});
