export type User = { id: number; name: string; username: string; role: 'ADMIN' | 'COLLABORATOR' };
export type Category = { id: number; name: string; active: boolean; sortOrder: number };
export type Expense = { id: number; description: string; category: Category; quantity: string; unit: string; unitValue: string; total: string; paymentMethod: string; supplier?: string; status: 'REGISTERED' | 'VERIFIED' | 'VOIDED'; occurredAt: string; createdBy: { id: number; name: string } };
export type Page<T> = { items: T[]; pagination: { page: number; pageSize: number; total: number; pages?: number } };
