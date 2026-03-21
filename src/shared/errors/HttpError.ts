import { AppError } from './AppError'

// ─── 400 Bad Request ──────────────────────────────────────────────────────────
export class BadRequestError extends AppError {
  constructor(message = 'Bad request', code = 'BAD_REQUEST') {
    super(message, 400, code)
  }
}

// ─── 401 Unauthorized ─────────────────────────────────────────────────────────
export class UnauthorizedError extends AppError {
  constructor(message = 'Unauthorized', code = 'UNAUTHORIZED') {
    super(message, 401, code)
  }
}

// ─── 403 Forbidden ────────────────────────────────────────────────────────────
export class ForbiddenError extends AppError {
  constructor(message = 'Access forbidden', code = 'FORBIDDEN') {
    super(message, 403, code)
  }
}

// ─── 404 Not Found ────────────────────────────────────────────────────────────
export class NotFoundError extends AppError {
  constructor(resource = 'Resource', code = 'NOT_FOUND') {
    super(`${resource} tidak ditemukan`, 404, code)
  }
}

// ─── 409 Conflict ─────────────────────────────────────────────────────────────
export class ConflictError extends AppError {
  constructor(message = 'Data conflict', code = 'CONFLICT') {
    super(message, 409, code)
  }
}

// ─── 422 Validation Error ─────────────────────────────────────────────────────
export class ValidationError extends AppError {
  public readonly details: ValidationDetail[]

  constructor(
    message = 'Validation failed',
    details: ValidationDetail[] = [],
    code = 'VALIDATION_ERROR',
  ) {
    super(message, 422, code)
    this.details = details
  }
}

export interface ValidationDetail {
  field: string
  message: string
}

// ─── 429 Rate Limit ───────────────────────────────────────────────────────────
export class RateLimitError extends AppError {
  constructor(message = 'Too many requests', code = 'RATE_LIMIT_EXCEEDED') {
    super(message, 429, code)
  }
}

// ─── 500 Internal Server Error ────────────────────────────────────────────────
export class InternalServerError extends AppError {
  constructor(message = 'Internal server error', code = 'INTERNAL_SERVER_ERROR') {
    super(message, 500, code, false) // isOperational = false
  }
}
