/**
 * Base class for all application-level errors.
 *
 * `isOperational = true` → expected error (wrong input, not found, etc.)
 *   → safe to send the message to the client
 *
 * `isOperational = false` → programmer error or unexpected failure
 *   → log it, send generic 500 to client
 */
export class AppError extends Error {
  public readonly statusCode: number
  public readonly code: string
  public readonly isOperational: boolean

  constructor(message: string, statusCode: number, code: string, isOperational = true) {
    super(message)
    this.statusCode = statusCode
    this.code = code
    this.isOperational = isOperational

    // Restore prototype chain (required when extending built-in classes in TS)
    Object.setPrototypeOf(this, new.target.prototype)
    Error.captureStackTrace(this, this.constructor)
  }
}
