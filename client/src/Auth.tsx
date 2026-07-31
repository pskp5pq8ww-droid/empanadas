import { createContext, useContext, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, post, setCsrf } from './api';
import type { User } from './types';

type AuthValue = { user?: User; loading: boolean; logout: () => Promise<void> };
const AuthContext = createContext<AuthValue>({ loading: true, logout: async () => undefined });

export function AuthProvider({ children }: { children: ReactNode }) {
  const client = useQueryClient();
  const query = useQuery({ queryKey: ['me'], queryFn: async () => { const data = await api<{ user: User; csrfToken: string }>('/auth/me'); setCsrf(data.csrfToken); return data.user; }, retry: false });
  const logout = async () => { await post('/auth/logout'); setCsrf(''); client.setQueryData(['me'], undefined); await client.invalidateQueries(); };
  return <AuthContext.Provider value={{ user: query.data, loading: query.isLoading, logout }}>{children}</AuthContext.Provider>;
}
export const useAuth = () => useContext(AuthContext);
