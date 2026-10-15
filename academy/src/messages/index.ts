// UI chrome dictionary. Mongolian is the source of truth; English is secondary
// and falls back to Mongolian for untranslated keys. Course content is mn-only for MVP.
const mn = {
  brand: "Skills Academy",
  nav_learn: "Суралцах",
  nav_explore: "Судлах",
  nav_review: "Давтлага",
  nav_profile: "Профайл",
  nav_org: "Байгууллага",
  nav_admin: "Админ",
  login: "Нэвтрэх",
  logout: "Гарах",
  start_free: "Үнэгүй эхлэх",
  continue: "Үргэлжлүүлэх",
  demo_banner: "ДЕМО ОРЧИН — бодит төлбөр хийгдэхгүй, туршилтын өгөгдөл.",
};
export type Dict = typeof mn;
const en: Partial<Dict> = {
  nav_learn: "Learn",
  nav_explore: "Explore",
  nav_review: "Review",
  nav_profile: "Profile",
  nav_org: "Organization",
  nav_admin: "Admin",
  login: "Sign in",
  logout: "Sign out",
  start_free: "Start free",
  continue: "Continue",
  demo_banner: "DEMO ENVIRONMENT — no real payments, test data.",
};
export const LOCALES = ["mn", "en"] as const;
export type Locale = (typeof LOCALES)[number];
export function isLocale(v: string): v is Locale {
  return (LOCALES as readonly string[]).includes(v);
}
export function dict(locale: Locale): Dict {
  return locale === "en" ? { ...mn, ...en } : mn;
}

/** Mongolian messages for API error codes (shown to learners). */
export const errorMessages: Record<string, string> = {
  unauthenticated: "Үргэлжлүүлэхийн тулд нэвтэрнэ үү.",
  forbidden: "Танд энэ үйлдлийг хийх эрх байхгүй.",
  not_found: "Олдсонгүй.",
  invalid_input: "Оруулсан мэдээлэл буруу эсвэл дутуу байна.",
  premium_required: "Энэ түвшин Premium эрх шаардана.",
  prerequisite_incomplete: "Эхлээд өмнөх түвшнээ дуусгана уу.",
  rate_limited: "Хэт олон оролдлого. Түр хүлээгээд дахин оролдоно уу.",
  already_owned: "Та энэ багцыг аль хэдийн худалдан авсан байна.",
  student_verification_required: "Оюутны эрхийн баталгаажуулалт MVP-д хараахан нээгдээгүй.",
  b2b_requires_invoice: "Байгууллагын суудлыг нэхэмжлэлээр захиална.",
  coupon_invalid: "Промо код буруу байна.",
  coupon_expired: "Промо кодын хугацаа дууссан.",
  coupon_exhausted: "Промо кодын ашиглалтын тоо дууссан.",
  coupon_not_applicable: "Энэ промо код сонгосон төлөвлөгөөнд хамаарахгүй.",
  zero_total_not_supported: "0₮ болох хөнгөлөлт дэмжигдэхгүй.",
  provider_error: "Төлбөрийн үйлчилгээ үзүүлэгчтэй холбогдож чадсангүй. Дахин оролдоно уу.",
  provider_not_configured: "Төлбөрийн хэрэгсэл тохируулагдаагүй байна.",
  cooldown_active: "Дахин өгөх хүлээлтийн хугацаа дуусаагүй байна.",
  already_certified: "Та энэ сертификатыг аль хэдийн авсан.",
  attempt_expired: "Шалгалтын хугацаа дууссан.",
  attempt_closed: "Энэ оролдлого аль хэдийн илгээгдсэн.",
  lessons_incomplete: "Бүх түвшнээ дуусгасны дараа шалгалт өгнө.",
  no_seats_available: "Сул суудал байхгүй байна.",
  not_org_member: "Энэ хэрэглэгч танай байгууллагын гишүүн биш.",
  invitation_invalid: "Урилга хүчингүй эсвэл хугацаа дууссан.",
  invitation_email_mismatch: "Урилга өөр имэйл хаягт илгээгдсэн байна.",
  order_not_payable: "Энэ захиалгыг төлөх боломжгүй.",
};
