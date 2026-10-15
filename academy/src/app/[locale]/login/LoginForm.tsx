"use client";
import { useState } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { Alert, Button } from "@/components/ui";
import { postJson } from "@/lib/client/api";

type Props = { mode: "supabase" | "dev"; next: string; supabaseUrl: string | null; supabaseAnonKey: string | null };

const DEMO_ACCOUNTS = [
  ["learner@demo.local", "Шинэ суралцагч (үнэгүй)"],
  ["employee@demo.local", "Байгууллагын суудалтай ажилтан"],
  ["manager@demo.local", "Байгууллагын HR менежер"],
  ["other-manager@demo.local", "Өөр компанийн менежер"],
  ["admin@demo.local", "Платформын админ"],
] as const;

export function LoginForm({ mode, next, supabaseUrl, supabaseAnonKey }: Props) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "danger" | "success"; text: string } | null>(null);

  async function devLogin(e: string) {
    setBusy(true);
    setMsg(null);
    const r = await postJson("/api/auth/dev-login", { email: e });
    if (r.ok) window.location.assign(next);
    else {
      setMsg({ tone: "danger", text: r.message });
      setBusy(false);
    }
  }

  if (mode === "dev") {
    return (
      <div className="space-y-5">
        <Alert tone="warning" title="Хөгжүүлэлтийн нэвтрэлт">
          Энэ нь зөвхөн локал/тест орчны хялбаршуулсан нэвтрэлт (нууц үггүй). Production-д Supabase Auth ашиглана.
        </Alert>
        <form
          onSubmit={(ev) => {
            ev.preventDefault();
            void devLogin(email);
          }}
          className="space-y-3"
        >
          <label className="block text-sm font-bold" htmlFor="email">Имэйл</label>
          <input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email"
            className="w-full rounded-xl border-2 border-line px-4 py-3 focus:border-primary" placeholder="tani@example.mn" />
          <Button type="submit" disabled={busy} className="w-full">Нэвтрэх / шинээр үүсгэх</Button>
        </form>
        <div>
          <p className="mb-2 text-sm font-bold">Демо бүртгэлүүд</p>
          <ul className="space-y-2">
            {DEMO_ACCOUNTS.map(([e, label]) => (
              <li key={e}>
                <button type="button" disabled={busy} onClick={() => void devLogin(e)}
                  className="w-full rounded-xl border-2 border-line px-4 py-2.5 text-left text-sm hover:border-lavender" data-testid={`demo-login-${e}`}>
                  <span className="font-bold">{label}</span> <span className="text-muted">· {e}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
        {msg && <Alert tone={msg.tone} role="alert">{msg.text}</Alert>}
      </div>
    );
  }

  const sb = () => createBrowserClient(supabaseUrl!, supabaseAnonKey!);
  const redirectTo = () => `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;

  async function withPassword(kind: "in" | "up") {
    setBusy(true);
    setMsg(null);
    const res =
      kind === "in"
        ? await sb().auth.signInWithPassword({ email, password })
        : await sb().auth.signUp({ email, password, options: { emailRedirectTo: redirectTo() } });
    setBusy(false);
    if (res.error) return setMsg({ tone: "danger", text: "Нэвтрэх боломжгүй: имэйл эсвэл нууц үгээ шалгана уу." });
    if (kind === "up" && !res.data.session) return setMsg({ tone: "success", text: "Баталгаажуулах холбоосыг имэйлээр илгээлээ." });
    window.location.assign(next);
  }

  async function magicLink() {
    setBusy(true);
    const { error } = await sb().auth.signInWithOtp({ email, options: { emailRedirectTo: redirectTo() } });
    setBusy(false);
    setMsg(error ? { tone: "danger", text: "Холбоос илгээж чадсангүй." } : { tone: "success", text: "Нэвтрэх холбоосыг имэйлээр илгээлээ." });
  }

  return (
    <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); void withPassword("in"); }}>
      <label className="block text-sm font-bold" htmlFor="email">Имэйл</label>
      <input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" className="w-full rounded-xl border-2 border-line px-4 py-3" />
      <label className="block text-sm font-bold" htmlFor="password">Нууц үг</label>
      <input id="password" type="password" minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" className="w-full rounded-xl border-2 border-line px-4 py-3" />
      <div className="grid gap-2 sm:grid-cols-2">
        <Button type="submit" disabled={busy}>Нэвтрэх</Button>
        <Button type="button" variant="secondary" disabled={busy} onClick={() => void withPassword("up")}>Бүртгүүлэх</Button>
      </div>
      <Button type="button" variant="ghost" disabled={busy || !email} onClick={() => void magicLink()} className="w-full">Нууц үггүй — имэйлээр холбоос авах</Button>
      {msg && <Alert tone={msg.tone} role="alert">{msg.text}</Alert>}
    </form>
  );
}
