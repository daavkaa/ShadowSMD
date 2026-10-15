import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const ALPHANUM = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";

/** Unbiased random alphanumeric id (rejection sampling). */
export function randomId(length = 20): string {
  let out = "";
  while (out.length < length) {
    for (const b of randomBytes(length * 2)) {
      if (b < 256 - (256 % ALPHANUM.length)) out += ALPHANUM[b % ALPHANUM.length];
      if (out.length === length) break;
    }
  }
  return out;
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function sha256Hex(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

export function hmacHex(secret: string, payload: string): string {
  return createHmac("sha256", secret).update(payload).digest("hex");
}

export function safeEqualHex(a: string, b: string): boolean {
  if (!/^[0-9a-f]+$/i.test(a) || !/^[0-9a-f]+$/i.test(b) || a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
}

export function verifyHmac(secret: string, payload: string, signatureHex: string | null | undefined): boolean {
  if (!signatureHex) return false;
  return safeEqualHex(hmacHex(secret, payload), signatureHex.trim());
}
