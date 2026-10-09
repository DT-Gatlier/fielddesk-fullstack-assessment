'use client';
import { Button } from '@/components/ui/button';
export default function ApplicationError({ reset }: { reset: () => void }) {
  return (
    <section className="space-y-4 p-6">
      <h1 className="text-2xl font-semibold">Something went wrong</h1>
      <p className="text-muted-foreground">
        Please try loading this page again.
      </p>
      <Button onClick={reset}>Try again</Button>
    </section>
  );
}
