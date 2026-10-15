// Higher-level helpers that drive real service code paths.
import { completeLesson, submitStep } from "@/features/learning/service";
import { createOrder } from "@/features/commerce/orders";
import { DemoPaymentAdapter } from "@/features/commerce/payments/demo";
import { handleDemoWebhook, signDemoWebhook } from "@/features/commerce/webhooks";
import { admin, correctAnswerFor, ids, stepsOf } from "./db";
import { randomUUID } from "node:crypto";

export async function finishLesson(userId: string, lessonId: string) {
  for (const s of await stepsOf(lessonId)) await submitStep(userId, s.id, await correctAnswerFor(s.id));
  return completeLesson(userId, lessonId);
}

export async function finishAllLessons(userId: string) {
  for (const l of await ids.lessons()) await finishLesson(userId, l.id);
}

/** Full demo purchase: order → provider-side simulated payment → signed webhook → verification. */
export async function buyWithDemo(userId: string, priceCode = "pro_month_prepaid") {
  const { orderId } = await createOrder(userId, { priceCode });
  const [o] = await admin<{ provider_invoice_id: string }[]>`select provider_invoice_id from public.orders where id = ${orderId}`;
  await DemoPaymentAdapter.simulateProviderPayment(o!.provider_invoice_id);
  const body = JSON.stringify({ event_id: "evt_" + randomUUID(), order_id: orderId, type: "invoice.paid" });
  const res = await handleDemoWebhook(body, signDemoWebhook(body));
  return { orderId, res, body };
}
