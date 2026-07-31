import type { User } from '@prisma/client';

declare global {
  namespace Express {
    interface Request {
      auth?: { user: Pick<User, 'id' | 'username' | 'name' | 'role'>; sessionId: number; csrfToken: string };
    }
  }
}

export {};
