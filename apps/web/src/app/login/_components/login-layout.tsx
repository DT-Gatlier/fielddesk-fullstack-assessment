import type { ReactNode } from 'react';
import { Wrench } from 'lucide-react';
import { ThemeSelector } from '@/modules/theme/theme-selector';
import { LoginBrandPanel } from './login-brand-panel';

export function LoginLayout({ children }: { children: ReactNode }) {
  return (
    <main className="login-layout grid lg:grid-cols-[46%_54%]">
      <LoginBrandPanel />
      <section
        className="login-panel flex min-w-0 flex-col px-5 pb-8 sm:px-10 lg:px-12"
        aria-labelledby="login-title"
      >
        <header className="flex flex-wrap items-center justify-between gap-3 py-5 lg:justify-end lg:py-8">
          <span className="flex items-center gap-2 text-lg font-semibold lg:hidden">
            <Wrench className="size-5 text-primary" aria-hidden="true" />
            FieldDesk
          </span>
          <ThemeSelector />
        </header>
        <div className="login-content mx-auto w-full max-w-[420px] pt-7 pb-8 lg:py-12">
          <h1
            id="login-title"
            className="text-3xl leading-tight font-semibold tracking-tight break-words sm:text-4xl"
          >
            Sign in to FieldDesk
          </h1>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            Enter your organisation credentials to continue.
          </p>
          <div className="mt-8">{children}</div>
          <p className="mt-7 text-sm leading-6 text-muted-foreground">
            Need access? Contact your organisation’s owner.
          </p>
        </div>
        <footer className="mt-auto pt-5 text-center text-xs leading-5 text-muted-foreground">
          Field service, organised.
        </footer>
      </section>
    </main>
  );
}
