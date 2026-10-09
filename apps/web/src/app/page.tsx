import { SessionBoundary } from '@/modules/auth/components/session-boundary';

export default function Home() {
  return <SessionBoundary mode="entry" />;
}
