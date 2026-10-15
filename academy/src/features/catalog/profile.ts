import "server-only";
import { z } from "zod";
import { withUser } from "@/lib/db/client";

export type Profile = { id: string; display_name: string; locale: string; onboarding_goal: string | null; daily_minutes: number | null; onboarded_at: Date | null; show_name_on_credentials: boolean };

export async function getProfile(userId: string): Promise<Profile | null> {
  return withUser(userId, async (tx) => {
    const [p] = await tx<Profile[]>`select id, display_name, locale, onboarding_goal, daily_minutes, onboarded_at, show_name_on_credentials from public.profiles where id = ${userId}`;
    return p ?? null;
  });
}

export const onboardingInput = z.object({
  displayName: z.string().trim().min(2).max(80),
  goal: z.enum(["career", "business", "agency", "student", "curious"]),
  dailyMinutes: z.union([z.literal(5), z.literal(10), z.literal(15), z.literal(20), z.literal(30)]),
});

/** Uses the learner's own RLS-scoped UPDATE grant (column-limited). */
export async function saveOnboarding(userId: string, input: unknown) {
  const v = onboardingInput.parse(input);
  return withUser(userId, async (tx) => {
    await tx`update public.profiles set display_name = ${v.displayName}, onboarding_goal = ${v.goal}, daily_minutes = ${v.dailyMinutes},
             onboarded_at = coalesce(onboarded_at, now()) where id = ${userId}`;
    return { ok: true };
  });
}

export async function setCredentialNameVisibility(userId: string, visible: boolean) {
  return withUser(userId, (tx) => tx`update public.profiles set show_name_on_credentials = ${visible} where id = ${userId}`);
}
