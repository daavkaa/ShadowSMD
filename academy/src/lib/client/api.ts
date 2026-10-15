"use client";
import { errorMessages } from "@/messages";

export type ApiResult<T> = { ok: true; data: T } | { ok: false; code: string; message: string; details?: Record<string, unknown> };

export async function postJson<T = unknown>(url: string, body?: unknown): Promise<ApiResult<T>> {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: "same-origin",
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      const code = json?.error?.code ?? "internal";
      return { ok: false, code, message: errorMessages[code] ?? "Алдаа гарлаа. Дахин оролдоно уу.", details: json?.error?.details };
    }
    return { ok: true, data: json as T };
  } catch {
    return { ok: false, code: "network", message: "Сүлжээний алдаа. Холболтоо шалгана уу." };
  }
}
