// Signed cookie session for LOCAL/TEST ONLY (AUTH_MODE=dev). getEnv() refuses
// AUTH_MODE=dev when APP_STAGE=production.
import { hmacHex, safeEqualHex } from "@/lib/security/crypto";

export const DEV_COOKIE = "sa_dev_session";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function signDevSession(secret: string, userId: string, ttlSeconds = 60 * 60 * 24 * 7, now = Date.now()): string {
  if (!UUID.test(userId)) throw new Error("invalid user id");
  const exp = Math.floor(now / 1000) + ttlSeconds;
  const payload = `${userId}.${exp}`;
  return `${payload}.${hmacHex(secret, payload)}`;
}

export function verifyDevSession(secret: string, token: string | undefined | null, now = Date.now()): string | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [userId, expStr, sig] = parts as [string, string, string];
  if (!UUID.test(userId) || !/^\d+$/.test(expStr)) return null;
  if (!safeEqualHex(hmacHex(secret, `${userId}.${expStr}`), sig)) return null;
  if (Number(expStr) * 1000 < now) return null;
  return userId;
}
