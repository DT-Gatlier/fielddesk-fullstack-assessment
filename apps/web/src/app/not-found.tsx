import Link from 'next/link';
export default function NotFound() {
  return (
    <main className="grid min-h-screen place-items-center p-6">
      <div className="space-y-4">
        <h1 className="text-3xl font-semibold">Page not found</h1>
        <p className="text-muted-foreground">This page could not be found.</p>
        <Link className="text-primary underline" href="/">
          Go to FieldDesk
        </Link>
      </div>
    </main>
  );
}
