type LoadingScreenProps = {
  message?: string;
  variant?: "page" | "inline" | "skeleton";
  rows?: number;
};

export function LoadingScreen({
  message = "Loading…",
  variant = "page",
  rows = 5,
}: LoadingScreenProps) {
  if (variant === "skeleton") {
    return (
      <div className="skeleton-list" aria-busy="true" aria-label={message}>
        {Array.from({ length: rows }).map((_, index) => (
          <div key={index} className="skeleton-row" />
        ))}
      </div>
    );
  }

  if (variant === "inline") {
    return (
      <div className="loading-inline" aria-busy="true">
        <div className="loading-screen__spinner" aria-hidden />
        <span>{message}</span>
      </div>
    );
  }

  return (
    <div className="loading-screen">
      <div className="loading-screen__spinner" aria-hidden />
      <p>{message}</p>
    </div>
  );
}
