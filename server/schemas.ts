import { z } from 'zod';
import { moneySchema } from '../shared/money.js';

export const loginSchema = z.object({
  username: z.string().trim().toLowerCase().min(2).max(40),
  pin: z.string().regex(/^\d{4}$/, 'El PIN debe tener exactamente 4 dígitos'),
  portal: z.enum(['ADMIN', 'COLLABORATOR'])
});

export const expenseSchema = z.object({
  description: z.string().trim().min(2).max(180),
  categoryId: z.coerce.number().int().positive(),
  otherDetail: z.string().trim().max(120).optional().nullable(),
  quantity: z.coerce.number().positive().max(999999),
  unit: z.enum(['unidad', 'paquete', 'kilogramo', 'libra', 'litro', 'caja', 'otra']),
  unitValue: moneySchema,
  paymentMethod: z.string().trim().min(2).max(60),
  supplier: z.string().trim().max(140).optional().nullable(),
  note: z.string().trim().max(500).optional().nullable()
});

export const incomeSchema = z.object({
  concept: z.string().trim().min(2).max(180),
  type: z.enum(['venta', 'aporte de capital', 'devolución', 'otro']),
  units: z.coerce.number().positive().optional().nullable(),
  total: moneySchema.refine(v => Number(v) > 0, 'El total debe ser mayor que cero'),
  paymentMethod: z.string().trim().min(2).max(60),
  channel: z.enum(['punto de venta', 'pedido', 'domicilio', 'otro']),
  note: z.string().trim().max(500).optional().nullable(),
  occurredAt: z.coerce.date()
});

export const payableSchema = z.object({
  name: z.string().trim().min(2).max(180),
  beneficiary: z.string().trim().min(2).max(140),
  categoryId: z.coerce.number().int().positive(),
  amount: moneySchema.refine(v => Number(v) > 0),
  dueDate: z.coerce.date(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH']).default('MEDIUM'),
  note: z.string().trim().max(500).optional().nullable()
});

export function parseOrReply<T>(schema: z.ZodType<T>, input: unknown): { data: T } | { errors: unknown } {
  const result = schema.safeParse(input);
  if (!result.success) return { errors: result.error.flatten().fieldErrors };
  return { data: result.data };
}
