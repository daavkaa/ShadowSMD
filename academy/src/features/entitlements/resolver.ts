// Pure mirror of public.has_premium_access() used for UI explanations and unit
// tests. The database function remains the enforcement point.
export type EntitlementLike = {
  scope_kind: "library_core" | "library_pro" | "course" | "bundle";
  scope_course_id: string | null;
  scope_bundle_product_id: string | null;
  status: "active" | "revoked";
  valid_from: Date;
  valid_until: Date | null;
};

export function entitlementCovers(
  e: EntitlementLike,
  course: { id: string; library_tier: "core" | "pro" },
  bundleCourses: ReadonlyMap<string, ReadonlySet<string>>,
  at: Date,
): boolean {
  if (e.status !== "active") return false;
  if (e.valid_from > at) return false;
  if (e.valid_until && e.valid_until <= at) return false;
  switch (e.scope_kind) {
    case "library_pro":
      return true;
    case "library_core":
      return course.library_tier === "core";
    case "course":
      return e.scope_course_id === course.id;
    case "bundle":
      return Boolean(e.scope_bundle_product_id && bundleCourses.get(e.scope_bundle_product_id)?.has(course.id));
  }
}

export function hasAccess(ents: readonly EntitlementLike[], course: { id: string; library_tier: "core" | "pro" }, bundleCourses: ReadonlyMap<string, ReadonlySet<string>>, at: Date) {
  return ents.some((e) => entitlementCovers(e, course, bundleCourses, at));
}
