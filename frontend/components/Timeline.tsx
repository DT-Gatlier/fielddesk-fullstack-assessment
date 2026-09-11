import { formatDateTime } from "@/lib/format";

type TimelineItem = {
  id: string;
  label: string;
  timestamp: string;
};

type TimelineProps = {
  items: TimelineItem[];
  emptyMessage?: string;
};

export function Timeline({ items, emptyMessage = "No activity yet." }: TimelineProps) {
  if (items.length === 0) {
    return <p className="timeline-empty">{emptyMessage}</p>;
  }

  return (
    <ol className="timeline">
      {items.map((item, index) => (
        <li key={item.id} className="timeline__item">
          <div className="timeline__marker" aria-hidden>
            <span className={`timeline__dot${index === 0 ? " timeline__dot--latest" : ""}`} />
            {index < items.length - 1 ? <span className="timeline__line" /> : null}
          </div>
          <div className="timeline__content">
            <span className="timeline__label">{item.label}</span>
            <time className="timeline__time" dateTime={item.timestamp}>
              {formatDateTime(item.timestamp)}
            </time>
          </div>
        </li>
      ))}
    </ol>
  );
}
