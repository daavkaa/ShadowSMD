"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Button, ButtonLink } from "@/components/ui";
import { postJson } from "@/lib/client/api";

type Status = "pending" | "paid" | "failed" | "expired" | "cancelled" | "refunded";
type Props = {
  locale: string;
  orderId: string;
  initialStatus: Status;
  qrDataUrl: string | null;
  deeplinks: { name: string; link: string }[];
  instructions: string | null;
  canSimulate: boolean;
};

const POLL_MS = 4000;

/** Displays authoritative order status from the server. Never infers success from the QR display or a redirect. */
export function CheckoutStatus({ locale, orderId, initialStatus, qrDataUrl, deeplinks, instructions, canSimulate }: Props) {
  const [status, setStatus] = useState<Status>(initialStatus);
  const [checking, setChecking] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const check = useCallback(async () => {
    setChecking(true);
    try {
      const res = await fetch(`/api/orders/${orderId}/status`, { cache: "no-store" });
      if (res.ok) setStatus(((await res.json()) as { status: Status }).status);
    } finally {
      setChecking(false);
    }
  }, [orderId]);

  useEffect(() => {
    if (status !== "pending") return;
    timer.current = setTimeout(() => void check(), POLL_MS);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [status, check]);

  async function simulate() {
    setNote(null);
    const r = await postJson<{ ok: boolean }>(`/api/dev/demo-payments/${orderId}/simulate`);
    if (!r.ok) setNote(r.message);
    await check();
  }

  async function cancel() {
    const r = await postJson(`/api/orders/${orderId}/cancel`);
    if (r.ok) setStatus("cancelled");
    else setNote(r.message);
  }

  return (
    <div className="mt-4 space-y-4" aria-live="polite">
      <p className="text-sm">
        Төлөв: <strong data-testid="order-status">{label[status]}</strong>
      </p>
      {status === "pending" && (
        <>
          {qrDataUrl && <img src={qrDataUrl} alt="Төлбөрийн QR код" width={220} height={220} className="mx-auto rounded-xl border border-line" />}
          {instructions && <p className="text-sm text-muted">{instructions}</p>}
          {deeplinks.length > 0 && (
            <ul className="grid grid-cols-2 gap-2">
              {deeplinks.map((d) => (
                <li key={d.link}><a href={d.link} className="block rounded-xl border-2 border-line px-3 py-2 text-center text-sm font-bold" rel="noopener noreferrer">{d.name}</a></li>
              ))}
            </ul>
          )}
          <p className="text-sm text-muted">Төлбөр баталгаажихыг хүлээж байна… Энэ хуудсыг хааж болно — захиалга хадгалагдсан.</p>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => void check()} disabled={checking} data-testid="check-status">Төлөв шалгах</Button>
            <Button variant="ghost" onClick={() => void cancel()}>Захиалга цуцлах</Button>
          </div>
          {canSimulate && (
            <div className="rounded-2xl border-2 border-dashed border-warning p-3">
              <p className="text-xs font-bold text-warning">ХӨГЖҮҮЛЭГЧИЙН ХЭРЭГСЭЛ (production-д байхгүй)</p>
              <Button variant="secondary" className="mt-2 w-full" onClick={() => void simulate()} data-testid="simulate-payment">
                Симуляц: үйлчилгээ үзүүлэгчийн талд төлбөр хийгдсэн гэж дуурайлгах
              </Button>
            </div>
          )}
        </>
      )}
      {status === "paid" && (
        <Alert tone="success" title="Төлбөр баталгаажлаа">
          <p>Premium эрх нээгдлээ. Төлбөрийн баримт таны захиалгын түүхэнд харагдана.</p>
          <ButtonLink href={`/${locale}/learn/smm-foundations`} className="mt-3" data-testid="go-learn">Суралцах руу</ButtonLink>
        </Alert>
      )}
      {(status === "expired" || status === "failed" || status === "cancelled") && (
        <Alert tone="danger" title={label[status]}>
          <p>Төлбөр хийгдээгүй тул эрх нээгдээгүй. Шинээр захиалга үүсгэж дахин оролдоно уу.</p>
          <ButtonLink href={`/${locale}/unlock/smm-foundations`} variant="secondary" className="mt-3">Дахин оролдох</ButtonLink>
        </Alert>
      )}
      {status === "refunded" && <Alert tone="warning" title="Буцаалт хийгдсэн">Энэ захиалгаар нээгдсэн эрх цуцлагдсан.</Alert>}
      {note && <Alert tone="danger" role="alert">{note}</Alert>}
    </div>
  );
}

const label: Record<Status, string> = {
  pending: "Төлбөр хүлээгдэж байна",
  paid: "Төлөгдсөн (баталгаажсан)",
  failed: "Амжилтгүй",
  expired: "Хугацаа дууссан",
  cancelled: "Цуцлагдсан",
  refunded: "Буцаагдсан",
};
