export abstract class AppError extends Error {
  public abstract readonly statusCode: number;
  public abstract readonly code: string;
  public abstract readonly title: string;
  public readonly type: string;
  public readonly errors?: unknown[];

  constructor(message: string, errors?: unknown[]) {
    super(message);
    this.name = this.constructor.name;
    this.type = `https://api.fielddesk.internal/errors/${this.constructor.name
      .replace(/Error$/, '')
      .toLowerCase()}`;
    this.errors = errors;
    Error.captureStackTrace(this, this.constructor);
  }
}

