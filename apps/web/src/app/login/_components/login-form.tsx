'use client';
import { useState } from 'react';
import { ArrowRight, LoaderCircle, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field, FieldError, FieldLabel } from '@/components/ui/field';
import { PasswordField } from './password-field';
import { DemoAccountsDialog, DEMO_PASSWORD, type DemoUser } from './demo-accounts-dialog';
import { useLoginForm } from '../_hooks/use-login-form';
import { useInputVisibility } from '../_hooks/use-input-visibility';

export function LoginForm() {
  const { form, submit, pending, blocked, inputsDisabled, checking } =
    useLoginForm();
  const visibilityRef = useInputVisibility();
  const [demoOpen, setDemoOpen] = useState(false);
  const errors = form.formState.errors;

  const handleSelectDemoAccount = (account: DemoUser) => {
    form.setValue('email', account.email, { shouldValidate: true });
    form.setValue('password', DEMO_PASSWORD, { shouldValidate: true });
  };

  return (
    <>
      <form
        ref={visibilityRef}
        className="space-y-5"
        noValidate
        onSubmit={submit}
        aria-busy={pending}
      >
        <Field>
          <FieldLabel htmlFor="email">Email address</FieldLabel>
          <Input
            id="email"
            type="email"
            inputMode="email"
            autoCapitalize="none"
            spellCheck={false}
            autoComplete="username"
            enterKeyHint="next"
            maxLength={254}
            disabled={inputsDisabled}
            aria-invalid={Boolean(errors.email)}
            aria-describedby={errors.email ? 'email-error' : undefined}
            {...form.register('email')}
          />
          {errors.email && (
            <FieldError id="email-error">{errors.email.message}</FieldError>
          )}
        </Field>
        <Field>
          <FieldLabel htmlFor="password">Password</FieldLabel>
          <PasswordField
            id="password"
            autoComplete="current-password"
            enterKeyHint="go"
            maxLength={128}
            disabled={inputsDisabled}
            aria-invalid={Boolean(errors.password)}
            aria-describedby={errors.password ? 'password-error' : undefined}
            {...form.register('password')}
          />
          {errors.password && (
            <FieldError id="password-error">{errors.password.message}</FieldError>
          )}
        </Field>
        <Button type="submit" className="h-12 w-full" disabled={blocked}>
          {pending ? (
            <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
          ) : null}
          {pending ? 'Signing in…' : 'Sign in'}
          {!pending && <ArrowRight className="size-4" aria-hidden="true" />}
        </Button>

        <div className="flex flex-col items-center justify-center pt-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setDemoOpen(true)}
            className="h-8 gap-1.5 text-xs text-muted-foreground hover:text-foreground"
          >
            <Users className="size-3.5" aria-hidden="true" />
            Demo accounts
          </Button>
        </div>

        <p
          role="status"
          className="min-h-5 text-center text-xs text-muted-foreground"
        >
          {checking ? 'Checking your session…' : ''}
        </p>
      </form>

      <DemoAccountsDialog
        open={demoOpen}
        onOpenChange={setDemoOpen}
        onSelectAccount={handleSelectDemoAccount}
      />
    </>
  );
}
