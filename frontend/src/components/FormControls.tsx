import { useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';

interface FieldProps { label: string; error?: string; hint?: string; children: (id: string) => ReactNode }

export function Field({ label, error, hint, children }: FieldProps) {
  const id = useId();
  const descriptionId = `${id}-description`;
  return <div className={`field ${error ? 'field--error' : ''}`}>
    <label htmlFor={id}>{label}</label>
    {children(id)}
    {(error || hint) && <small id={descriptionId} role={error ? 'alert' : undefined}>{error ?? hint}</small>}
  </div>;
}

export function TextInput({ label, error, hint, ...props }: InputHTMLAttributes<HTMLInputElement> & { label: string; error?: string; hint?: string }) {
  return <Field label={label} error={error} hint={hint}>{(id) => <input id={id} aria-invalid={Boolean(error)} aria-describedby={error || hint ? `${id}-description` : undefined} {...props} />}</Field>;
}

export function TextArea({ label, error, hint, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string; error?: string; hint?: string }) {
  return <Field label={label} error={error} hint={hint}>{(id) => <textarea id={id} aria-invalid={Boolean(error)} aria-describedby={error || hint ? `${id}-description` : undefined} {...props} />}</Field>;
}

export function SelectInput({ label, error, hint, children, ...props }: SelectHTMLAttributes<HTMLSelectElement> & { label: string; error?: string; hint?: string }) {
  return <Field label={label} error={error} hint={hint}>{(id) => <select id={id} aria-invalid={Boolean(error)} aria-describedby={error || hint ? `${id}-description` : undefined} {...props}>{children}</select>}</Field>;
}

export function Button({ variant = 'primary', busy, children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'danger' | 'ghost'; busy?: boolean }) {
  return <button className={`button button--${variant}`} disabled={busy || props.disabled} {...props}>{busy ? <><span className="spinner spinner--inline" /> Working…</> : children}</button>;
}
