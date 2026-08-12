import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../api/client';
import type { ApiResponse, SelectOption } from '../types';
import { Field } from './FormControls';

interface AsyncSelectProps {
  label: string;
  resource?: string;
  path?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  error?: string;
  disabled?: boolean;
  labelKey?: string;
}

export function AsyncSelect({ label, resource, path, value, onChange, placeholder = 'Select an option', error, disabled, labelKey = 'value' }: AsyncSelectProps) {
  const endpoint = path ?? `/${resource}/select/options`;
  const query = useQuery({
    queryKey: ['select-options', endpoint],
    queryFn: async () => (await apiFetch<ApiResponse<Array<SelectOption & Record<string, unknown>>>>(endpoint)).data,
    staleTime: 5 * 60_000,
    enabled: !disabled
  });

  return <Field label={label} error={error} hint={query.isError ? 'Options could not be loaded. Try again.' : undefined}>{(id) =>
    <select id={id} value={value} disabled={disabled || query.isLoading || query.isError} onChange={(event) => onChange(event.target.value)} aria-invalid={Boolean(error)}>
      <option value="">{query.isLoading ? 'Loading options…' : placeholder}</option>
      {query.data?.map((option) => <option key={option.id} value={option.id}>{String(option[labelKey] ?? option.value)}</option>)}
    </select>
  }</Field>;
}
