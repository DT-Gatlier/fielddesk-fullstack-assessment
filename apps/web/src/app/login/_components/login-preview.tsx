import { ArrowUpRight, ClipboardList, MapPin } from 'lucide-react';
const examples = [
  {
    reference: 'FD-1042',
    title: 'HVAC inspection',
    site: 'Riverside Office Center · Zone B',
    status: 'Scheduled',
  },
  {
    reference: 'FD-1043',
    title: 'Supply valve repair',
    site: 'Central Warehouse · Depot 4',
    status: 'In progress',
  },
];
export function LoginPreview() {
  return (
    <section className="mt-12 max-w-md" aria-labelledby="examples-title">
      <h3
        id="examples-title"
        className="mb-4 text-xs font-semibold tracking-widest uppercase"
      >
        Example work orders
      </h3>
      <div className="space-y-3">
        {examples.map((item) => (
          <div
            key={item.reference}
            className="rounded-2xl border border-white/25 bg-white/10 p-5 shadow-sm"
          >
            <div className="flex items-center justify-between gap-3 text-xs">
              <span className="flex items-center gap-2">
                <ClipboardList className="size-4" aria-hidden="true" />
                {item.reference}
              </span>
              <span className="rounded-full bg-black/15 px-3 py-1">
                {item.status}
              </span>
            </div>
            <div className="mt-3 flex items-center justify-between gap-3">
              <p className="font-semibold">{item.title}</p>
              <ArrowUpRight className="size-4" aria-hidden="true" />
            </div>
            <p className="mt-2 flex items-start gap-2 text-xs leading-5 text-blue-100">
              <MapPin className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
              {item.site}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
