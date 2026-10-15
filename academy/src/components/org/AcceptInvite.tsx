"use client";
import { useState } from "react";
import { Alert, Button } from "@/components/ui";
import { postJson } from "@/lib/client/api";

export function AcceptInvite({ locale, token }: { locale: string; token: string }) {
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <div className="mt-4 space-y-3">
      <Button
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          const r = await postJson<{ orgSlug: string }>("/api/invitations/accept", { token });
          if (r.ok) window.location.assign(`/${locale}/learn/smm-foundations`);
          else { setErr(r.message); setBusy(false); }
        }}
      >
        Урилга хүлээн авах
      </Button>
      {err && <Alert tone="danger" role="alert">{err}</Alert>}
    </div>
  );
}
