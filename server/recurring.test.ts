import { beforeEach, describe, expect, it, vi } from 'vitest';

const fakeDb = vi.hoisted(() => ({
  recurringPaymentRule: { findMany: vi.fn(), update: vi.fn() },
  paymentOccurrence: { createMany: vi.fn() }
}));
vi.mock('./db.js', () => ({ db: fakeDb }));
import { generateRecurringOccurrences, nextRecurringDate } from './recurring';

describe('recurrencias', () => {
  beforeEach(() => vi.clearAllMocks());
  it('avanza una mensualidad preservando una única próxima fecha', () => {
    expect(nextRecurringDate(new Date('2026-07-15T12:00:00Z'), 'MONTHLY').toISOString()).toBe('2026-08-15T12:00:00.000Z');
  });
  it('usa intervalo personalizado', () => {
    expect(nextRecurringDate(new Date('2026-07-01T00:00:00Z'), 'CUSTOM', 10).toISOString()).toBe('2026-07-11T00:00:00.000Z');
  });

  it('genera ocurrencias de forma idempotente mediante restricción compuesta', async () => {
    fakeDb.recurringPaymentRule.findMany.mockResolvedValue([{ id: 1, nextDueDate: new Date('2026-07-01T00:00:00Z'), endDate: new Date('2026-07-01T00:00:00Z'), frequency: 'MONTHLY', intervalDays: null, estimatedValue: '1000.00' }]);
    fakeDb.paymentOccurrence.createMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });
    fakeDb.recurringPaymentRule.update.mockResolvedValue({});
    expect(await generateRecurringOccurrences(new Date('2026-07-01T23:00:00Z'))).toBe(1);
    expect(await generateRecurringOccurrences(new Date('2026-07-01T23:00:00Z'))).toBe(0);
    expect(fakeDb.paymentOccurrence.createMany.mock.calls[0][0].skipDuplicates).toBe(true);
  });
});
