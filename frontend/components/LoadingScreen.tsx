type LoadingScreenProps = {
  message?: string;
};

export function LoadingScreen({ message = "Loading…" }: LoadingScreenProps) {
  return (
    <div className="loading-screen">
      <div className="loading-screen__spinner" aria-hidden />
      <p>{message}</p>
    </div>
  );
}
