import { z } from "zod";

/** Any 8-4-4-4-12 hex id. Seed content uses deterministic md5-derived ids that are not RFC-4122 versioned. */
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const uuidLike = z.string().regex(UUID_RE, "invalid id");
export const isUuidLike = (v: unknown): v is string => typeof v === "string" && UUID_RE.test(v);
