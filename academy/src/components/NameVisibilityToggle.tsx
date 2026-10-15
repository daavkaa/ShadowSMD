"use client";
import { useState } from "react";
import { postJson } from "@/lib/client/api";

export function NameVisibilityToggle({ initial }: { initial: boolean }) {
  const [on, setOn] = useState(initial);
  const [saving, setSaving] = useState(false);
  return (
    <label className="mt-3 flex items-start gap-3">
      <input
        type="checkbox"
        className="mt-1 h-5 w-5 accent-[var(--color-primary)]"
        checked={on}
        disabled={saving}
        onChange={async (e) => {
          const v = e.target.checked;
          setSaving(true);
          const r = await postJson("/api/me/settings", { showNameOnCredentials: v });
          setSaving(false);
          if (r.ok) setOn(v);
        }}
      />
      <span>
        <span className="font-bold">Нийтийн баталгаажуулах хуудсанд нэрээ харуулах</span>
        <span className="block text-sm text-muted">Унтраавал сертификатын хүчинтэй эсэх, дугаар, огноо л харагдана.</span>
      </span>
    </label>
  );
}
