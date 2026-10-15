/** Only same-site relative paths are allowed as post-login destinations (prevents open redirects). */
export function safeNext(next: string | null | undefined, fallback = "/mn/learn/smm-foundations"): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\") || next.includes("://")) return fallback;
  return next;
}
