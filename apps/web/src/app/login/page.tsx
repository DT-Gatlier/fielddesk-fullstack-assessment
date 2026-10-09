import { SessionBoundary } from '@/modules/auth/components/session-boundary';
import { LoginForm } from './_components/login-form';
import { LoginLayout } from './_components/login-layout';
export default function LoginPage() {
  return (
    <LoginLayout>
      <SessionBoundary mode="guest">
        <LoginForm />
      </SessionBoundary>
    </LoginLayout>
  );
}
