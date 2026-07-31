let csrfToken = '';
export function setCsrf(value: string) { csrfToken = value; }

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  if (options.body && !(options.body instanceof FormData)) headers.set('content-type', 'application/json');
  if (options.method && !['GET', 'HEAD'].includes(options.method.toUpperCase()) && csrfToken) headers.set('x-csrf-token', csrfToken);
  const response = await fetch(`/api${path}`, { ...options, headers, credentials: 'same-origin' });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'No fue posible completar la solicitud' }));
    throw new Error(error.message || 'No fue posible completar la solicitud');
  }
  if (response.status === 204) return undefined as T;
  return response.json();
}

export const post = <T>(path: string, data?: unknown, headers?: HeadersInit) => api<T>(path, { method: 'POST', body: data === undefined ? undefined : JSON.stringify(data), headers });
export const patch = <T>(path: string, data: unknown) => api<T>(path, { method: 'PATCH', body: JSON.stringify(data) });
