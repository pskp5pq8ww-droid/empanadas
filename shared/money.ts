import { z } from 'zod';

export const moneySchema = z.union([z.string(), z.number()]).transform((value, ctx) => {
  const normalized = typeof value === 'string' ? value.replace(/[^\d,-]/g, '').replace(',', '.') : value;
  const amount = Number(normalized);
  if (!Number.isFinite(amount) || amount < 0) {
    ctx.addIssue({ code: 'custom', message: 'Ingresa un valor válido mayor o igual a cero' });
    return z.NEVER;
  }
  return amount.toFixed(2);
});

export function multiplyMoney(quantity: string | number, unitValue: string | number): string {
  const q = Math.round(Number(quantity) * 1000);
  const v = Math.round(Number(unitValue) * 100);
  if (!Number.isFinite(q) || !Number.isFinite(v)) throw new Error('Valores monetarios inválidos');
  return ((q * v) / 100000).toFixed(2);
}

export function formatCOP(value: string | number): string {
  const amount = Number(value);
  if (!Number.isFinite(amount)) throw new Error('Valor COP inválido');
  return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(amount);
}
