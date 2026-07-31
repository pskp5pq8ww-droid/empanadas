import { useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { LockKeyhole, ShieldCheck, Users } from 'lucide-react';
import { post, setCsrf } from '../api';
import type { User } from '../types';
import { Button, Field } from '../components/Ui';

export function LoginPage() {
  const [portal, setPortal] = useState<'ADMIN' | 'COLLABORATOR'>('ADMIN');
  const [username, setUsername] = useState(''); const [pin, setPin] = useState(''); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const client = useQueryClient();
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setError(''); setBusy(true);
    try {
      const data = await post<{ user: User; csrfToken: string }>('/auth/login', { username, pin, portal });
      setCsrf(data.csrfToken); client.setQueryData(['me'], data.user);
    } catch (e) { setError(e instanceof Error ? e.message : 'No fue posible ingresar'); } finally { setBusy(false); }
  };
  return <main className="login-page">
    <section className="login-brand-panel" aria-label="Las Empanadas de Ángela">
      <div className="logo-frame"><img src="/logo.png" alt="Logo de Las Empanadas de Ángela" /></div>
      <div className="welcome-copy"><span className="eyebrow">Hecho con cariño, administrado con claridad</span><h1>Todo tu negocio,<br />en un solo lugar.</h1><p>Ingresos, gastos, pagos y el día a día de la familia Empanadas de Ángela.</p></div>
      <div className="pastel-dots" aria-hidden="true"><i /><i /><i /></div>
    </section>
    <section className="login-form-panel">
      <form className="login-card" onSubmit={submit}>
        <div className="mobile-logo"><img src="/logo.png" alt="Logo" /></div>
        <span className="eyebrow">Centro administrativo</span><h2>Qué alegría verte</h2><p className="muted">Elige tu perfil e ingresa con tus datos.</p>
        <div className="portal-tabs" role="tablist" aria-label="Tipo de acceso">
          <button type="button" className={portal === 'ADMIN' ? 'active' : ''} onClick={() => setPortal('ADMIN')}><ShieldCheck /> Administrador</button>
          <button type="button" className={portal === 'COLLABORATOR' ? 'active' : ''} onClick={() => setPortal('COLLABORATOR')}><Users /> Colaborador</button>
        </div>
        <Field label="Usuario" value={username} onChange={e => setUsername(e.target.value)} autoComplete="username" placeholder="Tu usuario" required />
        <Field label="PIN de 4 dígitos" value={pin} onChange={e => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))} autoComplete="current-password" inputMode="numeric" pattern="\d{4}" maxLength={4} placeholder="••••" required />
        {error && <div className="alert error" role="alert">{error}</div>}
        <Button type="submit" busy={busy} className="primary login-submit"><LockKeyhole size={18} /> Ingresar con seguridad</Button>
        <small className="secure-note"><ShieldCheck size={15} /> Tus datos están protegidos</small>
      </form>
    </section>
  </main>;
}
