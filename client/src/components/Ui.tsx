import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react';
import { LoaderCircle } from 'lucide-react';

export function Button({ children, className = '', busy, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { busy?: boolean }) {
  return <button className={`button ${className}`} disabled={busy || props.disabled} {...props}>{busy && <LoaderCircle className="spin" size={18} />}{children}</button>;
}
export function Field({ label, error, ...props }: InputHTMLAttributes<HTMLInputElement> & { label: string; error?: string }) {
  return <label className="field"><span>{label}</span><input aria-invalid={Boolean(error)} {...props} />{error && <small className="field-error">{error}</small>}</label>;
}
export function Select({ label, children, ...props }: SelectHTMLAttributes<HTMLSelectElement> & { label: string; children: ReactNode }) {
  return <label className="field"><span>{label}</span><select {...props}>{children}</select></label>;
}
export function TextArea({ label, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string }) {
  return <label className="field"><span>{label}</span><textarea {...props} /></label>;
}
export function Card({ children, className = '' }: { children: ReactNode; className?: string }) { return <section className={`card ${className}`}>{children}</section>; }
export function Empty({ children = 'Aún no hay registros para mostrar.' }: { children?: ReactNode }) { return <div className="empty">{children}</div>; }
export function Status({ value }: { value: string }) {
  const labels: Record<string, string> = { REGISTERED: 'Registrado', VERIFIED: 'Verificado', VOIDED: 'Anulado', ACTIVE: 'Activo', PENDING: 'Pendiente', PAID: 'Pagado', COMPLETED: 'Completado' };
  return <span className={`status status-${value.toLowerCase()}`}>{labels[value] ?? value}</span>;
}
