import { addDays, addMonths, addWeeks } from 'date-fns';
import type { Frequency } from '@prisma/client';
import { db } from './db.js';

export function nextRecurringDate(date: Date, frequency: Frequency, intervalDays?: number | null): Date {
  if (frequency === 'WEEKLY') return addWeeks(date, 1);
  if (frequency === 'BIWEEKLY') return addWeeks(date, 2);
  if (frequency === 'MONTHLY') return addMonths(date, 1);
  return addDays(date, Math.max(1, intervalDays ?? 1));
}

export async function generateRecurringOccurrences(horizon = addDays(new Date(), 30)) {
  const rules = await db.recurringPaymentRule.findMany({ where: { active: true, nextDueDate: { lte: horizon } } });
  let created = 0;
  for (const rule of rules) {
    let dueDate = rule.nextDueDate;
    while (dueDate <= horizon && (!rule.endDate || dueDate <= rule.endDate)) {
      const result = await db.paymentOccurrence.createMany({
        data: [{ ruleId: rule.id, dueDate, amount: rule.estimatedValue }],
        skipDuplicates: true
      });
      created += result.count;
      dueDate = nextRecurringDate(dueDate, rule.frequency, rule.intervalDays);
    }
    await db.recurringPaymentRule.update({ where: { id: rule.id }, data: { nextDueDate: dueDate, active: rule.endDate ? dueDate <= rule.endDate : true } });
  }
  return created;
}
