"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Alert, Button } from "@/components/ui";
import { postJson } from "@/lib/client/api";

export function MemberActions({ orgId, userId, assignmentId, canRemove }: { orgId: string; userId: string; assignmentId: string | null; canRemove: boolean }) {
  const router = useRouter();
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const run = async (url: string, body: unknown, confirmText?: string) => {
    if (confirmText && !confirm(confirmText)) return;
    setBusy(true);
    setErr(null);
    const r = await postJson(url, body);
    setBusy(false);
    if (r.ok) router.refresh();
    else setErr(r.message);
  };
  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      {assignmentId ? (
        <button disabled={busy} className="text-xs font-bold text-danger underline" onClick={() => void run(`/api/orgs/${orgId}/seats/revoke`, { assignmentId }, "Суудлыг хасах уу? Ажилтны ахиц хадгалагдана.")}>Суудал хасах</button>
      ) : (
        <button disabled={busy} className="text-xs font-bold text-primary-strong underline" onClick={() => void run(`/api/orgs/${orgId}/seats/assign`, { userId })} data-testid={`assign-${userId}`}>Суудал олгох</button>
      )}
      {canRemove && (
        <button disabled={busy} className="text-xs font-bold text-muted underline" onClick={() => void run(`/api/orgs/${orgId}/members/remove`, { userId }, "Гишүүнийг байгууллагаас хасах уу?")}>Хасах</button>
      )}
      {err && <span role="alert" className="text-xs text-danger">{err}</span>}
    </div>
  );
}

export function InviteForm({ orgId }: { orgId: string }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"member" | "manager">("member");
  const [link, setLink] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  return (
    <form
      className="mt-3 space-y-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setErr(null);
        setLink(null);
        const r = await postJson<{ link: string }>(`/api/orgs/${orgId}/invitations`, { email, role });
        if (r.ok) { setLink(r.data.link); setEmail(""); router.refresh(); }
        else setErr(r.message);
      }}
    >
      <div className="flex flex-col gap-2 sm:flex-row">
        <label className="sr-only" htmlFor="inv-email">Имэйл</label>
        <input id="inv-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="ajiltan@company.mn" className="flex-1 rounded-xl border-2 border-line px-4 py-2.5" />
        <label className="sr-only" htmlFor="inv-role">Үүрэг</label>
        <select id="inv-role" value={role} onChange={(e) => setRole(e.target.value as "member" | "manager")} className="rounded-xl border-2 border-line px-3 py-2.5">
          <option value="member">Ажилтан</option>
          <option value="manager">Менежер</option>
        </select>
        <Button type="submit">Урих</Button>
      </div>
      {link && (
        <Alert tone="success" title="Урилгын холбоос (нэг л удаа харагдана)">
          <p className="break-all font-mono text-xs">{link}</p>
          <p className="mt-1 text-xs">Имэйл илгээх үйлчилгээ MVP-д холбогдоогүй тул холбоосыг ажилтанд аюулгүй сувгаар дамжуулна уу. 14 хоног хүчинтэй.</p>
        </Alert>
      )}
      {err && <Alert tone="danger" role="alert">{err}</Alert>}
    </form>
  );
}
