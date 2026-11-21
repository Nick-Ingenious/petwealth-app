/**
 * Typed application errors. HTTP handlers map `status` straight to the
 * response; server actions surface `message` to the user. Never put PII or
 * internal details in `message`.
 */
export class AppError extends Error {
  constructor(
    readonly status: 400 | 401 | 403 | 404 | 409 | 422,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export const notFound = (what: string) => new AppError(404, "not_found", `${what} not found.`);
export const forbidden = (permission: string) =>
  new AppError(403, "forbidden", `You don't have permission to do this (${permission}).`);
export const conflict = (message: string) => new AppError(409, "conflict", message);
export const invalid = (message: string, details?: unknown) => new AppError(422, "invalid", message, details);
