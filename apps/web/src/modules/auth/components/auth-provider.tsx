'use client';
import { createContext, useMemo, useRef, type ReactNode } from 'react';
import { useSessionObserver } from '../hooks/use-session-observer';
import { useAuthTransitions } from '../hooks/use-auth-transitions';
import { useAuthSignals } from '../hooks/use-auth-signals';

type SessionState = ReturnType<typeof useSessionObserver> & {
  changing: boolean;
  identityVersion: number;
};
type Commands = Pick<
  ReturnType<typeof useAuthTransitions>,
  'signIn' | 'signOut'
>;
export const SessionContext = createContext<SessionState | null>(null);
export const AuthCommandsContext = createContext<Commands | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const busy = useRef(false);
  const channel = useRef<BroadcastChannel | null>(null);
  const { changing, identityVersion, signIn, signOut, refresh } =
    useAuthTransitions(busy, channel);
  const { session, checking } = useSessionObserver(busy, changing);
  useAuthSignals(channel, refresh);
  const commands = useMemo(() => ({ signIn, signOut }), [signIn, signOut]);
  const state = useMemo(
    () => ({ session, checking, changing, identityVersion }),
    [session, checking, changing, identityVersion],
  );
  return (
    <AuthCommandsContext value={commands}>
      <SessionContext value={state}>{children}</SessionContext>
    </AuthCommandsContext>
  );
}
