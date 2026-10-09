'use client';
import { useRef, useState, type ComponentProps } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

export function PasswordField({
  ref: registerRef,
  ...props
}: ComponentProps<typeof Input>) {
  const [visible, setVisible] = useState(false);
  const input = useRef<HTMLInputElement | null>(null);
  function toggle() {
    const element = input.current;
    const start = element?.selectionStart ?? null;
    const end = element?.selectionEnd ?? null;
    setVisible((value) => !value);
    requestAnimationFrame(() => {
      element?.focus({ preventScroll: true });
      if (start !== null && end !== null)
        element?.setSelectionRange(start, end);
    });
  }
  return (
    <div className="relative">
      <Input
        {...props}
        className="pr-12"
        type={visible ? 'text' : 'password'}
        ref={(element) => {
          input.current = element;
          if (typeof registerRef === 'function') registerRef(element);
          else if (registerRef) registerRef.current = element;
        }}
      />
      <Button
        variant="outline"
        className="absolute top-0 right-0 size-11 rounded-l-none border-0 bg-transparent p-0 hover:bg-muted"
        aria-label={visible ? 'Hide password' : 'Show password'}
        aria-pressed={visible}
        disabled={props.disabled}
        onPointerDown={(event) => event.preventDefault()}
        onClick={toggle}
      >
        {visible ? (
          <EyeOff className="size-4" aria-hidden="true" />
        ) : (
          <Eye className="size-4" aria-hidden="true" />
        )}
      </Button>
    </div>
  );
}
