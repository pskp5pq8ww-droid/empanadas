import { describe, expect, it } from 'vitest';
import { formatCOP, moneySchema, multiplyMoney } from './money';

describe('dinero', () => {
  it('calcula cantidad por valor unitario sin error binario visible', () => {
    expect(multiplyMoney('2.5', '1999.90')).toBe('4999.75');
  });
  it('formatea COP y rechaza negativos', () => {
    expect(formatCOP(12500)).toContain('12.500');
    expect(moneySchema.safeParse('-1').success).toBe(false);
  });
});
