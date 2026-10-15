export type ErrorCode =
  | "unauthenticated"
  | "forbidden"
  | "not_found"
  | "invalid_input"
  | "premium_required"
  | "prerequisite_incomplete"
  | "rate_limited"
  | "conflict"
  | "already_owned"
  | "student_verification_required"
  | "b2b_requires_invoice"
  | "coupon_invalid"
  | "coupon_expired"
  | "coupon_exhausted"
  | "coupon_not_applicable"
  | "zero_total_not_supported"
  | "order_not_payable"
  | "amount_mismatch"
  | "provider_error"
  | "provider_not_configured"
  | "signature_invalid"
  | "cooldown_active"
  | "already_certified"
  | "attempt_expired"
  | "attempt_closed"
  | "lessons_incomplete"
  | "no_seats_available"
  | "not_org_member"
  | "invitation_invalid"
  | "invitation_email_mismatch";

const STATUS: Partial<Record<ErrorCode, number>> = {
  unauthenticated: 401,
  forbidden: 403,
  premium_required: 402,
  not_found: 404,
  rate_limited: 429,
  conflict: 409,
  already_owned: 409,
  already_certified: 409,
  signature_invalid: 401,
  provider_error: 502,
  provider_not_configured: 503,
};

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details?: Record<string, unknown>;
  constructor(code: ErrorCode, message?: string, details?: Record<string, unknown>) {
    super(message ?? code);
    this.code = code;
    this.status = STATUS[code] ?? 400;
    this.details = details;
  }
}

export function isAppError(e: unknown): e is AppError {
  return e instanceof AppError;
}
