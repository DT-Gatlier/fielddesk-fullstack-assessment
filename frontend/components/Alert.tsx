import type { ReactNode } from "react";

type AlertProps = {
  variant: "error" | "success" | "info";
  title?: string;
  children: ReactNode;
  onDismiss?: () => void;
};

export function Alert({ variant, title, children, onDismiss }: AlertProps) {
  return (
    <div className={`alert alert--${variant}`} role="alert">
      <div className="alert__content">
        {title ? <strong className="alert__title">{title}</strong> : null}
        <p className="alert__message">{children}</p>
      </div>
      {onDismiss ? (
        <button type="button" className="alert__dismiss" onClick={onDismiss} aria-label="Dismiss">
          ×
        </button>
      ) : null}
    </div>
  );
}
