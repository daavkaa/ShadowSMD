import "server-only";
import { withUser } from "@/lib/db/client";

export type CourseSummary = {
  id: string;
  slug: string;
  title: string;
  summary: string;
  status: "published" | "coming_soon";
  estimated_minutes: number;
  library_tier: "core" | "pro";
  reviewed_at: string | null;
  lesson_count: number;
};

export type AcademyWithCourses = {
  id: string;
  slug: string;
  title: string;
  description: string;
  courses: (CourseSummary & { track_title: string })[];
};

export async function listAcademies(userId: string | null): Promise<AcademyWithCourses[]> {
  return withUser(userId, async (tx) => {
    const academies = await tx<{ id: string; slug: string; title: string; description: string }[]>`
      select id, slug, title, description from public.academies order by sort_order`;
    const courses = await tx<(CourseSummary & { academy_id: string; track_title: string })[]>`
      select c.id, c.slug, c.title, c.summary, c.status, c.estimated_minutes, c.library_tier,
             to_char(c.reviewed_at, 'YYYY-MM-DD') as reviewed_at,
             (select count(*)::int from public.lessons l where l.course_id = c.id) as lesson_count,
             t.academy_id, t.title as track_title
      from public.courses c join public.tracks t on t.id = c.track_id
      order by t.sort_order, c.sort_order`;
    return academies.map((a) => ({ ...a, courses: courses.filter((c) => c.academy_id === a.id) }));
  });
}

export async function getCourseBySlug(userId: string | null, slug: string) {
  return withUser(userId, async (tx) => {
    const [course] = await tx<(CourseSummary & { track_title: string; academy_title: string })[]>`
      select c.id, c.slug, c.title, c.summary, c.status, c.estimated_minutes, c.library_tier,
             to_char(c.reviewed_at, 'YYYY-MM-DD') as reviewed_at,
             (select count(*)::int from public.lessons l where l.course_id = c.id) as lesson_count,
             t.title as track_title, a.title as academy_title
      from public.courses c join public.tracks t on t.id = c.track_id join public.academies a on a.id = t.academy_id
      where c.slug = ${slug}`;
    if (!course) return null;
    const lessons = await tx<{ id: string; slug: string; title: string; summary: string; access_tier: "free" | "premium"; estimated_minutes: number; sort_order: number }[]>`
      select id, slug, title, summary, access_tier, estimated_minutes, sort_order from public.lessons where course_id = ${course.id} order by sort_order`;
    const [assessment] = await tx<{ id: string; title: string; question_count: number; pass_score_pct: number; time_limit_minutes: number }[]>`
      select id, title, question_count, pass_score_pct, time_limit_minutes from public.assessments where course_id = ${course.id} and kind = 'final'`;
    return { course, lessons, assessment: assessment ?? null };
  });
}

export type PlanOption = {
  price_id: string;
  price_code: string;
  product_code: string;
  product_kind: string;
  name: string;
  description: string;
  amount_mnt: number;
  billing_interval: "one_time" | "month" | "year";
  access_days: number | null;
  auto_renew: boolean;
  tax_mode: string;
  requires_student_verification: boolean;
  audience: string;
  covers_course: boolean;
};

/** Plans that would unlock the given course (or all B2C plans when no course given). */
export async function listPlans(userId: string | null, courseId?: string): Promise<PlanOption[]> {
  return withUser(userId, async (tx) => tx<PlanOption[]>`
    select pr.id as price_id, pr.code as price_code, p.code as product_code, p.kind as product_kind, p.name, p.description,
           pr.amount_mnt, pr.billing_interval, pr.access_days, pr.auto_renew, pr.tax_mode,
           p.requires_student_verification, p.audience,
           case
             when ${courseId ?? null}::uuid is null then true
             when p.scope_kind = 'library_pro' then true
             when p.scope_kind = 'library_core' then exists (select 1 from public.courses c where c.id = ${courseId ?? null}::uuid and c.library_tier = 'core')
             when p.scope_kind = 'course' then p.scope_course_id = ${courseId ?? null}::uuid
             when p.scope_kind = 'bundle' then exists (select 1 from public.bundle_courses b where b.bundle_product_id = p.id and b.course_id = ${courseId ?? null}::uuid)
           end as covers_course
    from public.prices pr join public.products p on p.id = pr.product_id
    where p.audience = 'b2c'
    order by p.requires_student_verification, pr.billing_interval = 'one_time', pr.amount_mnt`);
}

export async function listBundleCourseTitles(userId: string | null, productCode: string): Promise<string[]> {
  return withUser(userId, async (tx) => {
    const rows = await tx<{ title: string }[]>`
      select c.title from public.bundle_courses b join public.products p on p.id = b.bundle_product_id
      join public.courses c on c.id = b.course_id where p.code = ${productCode} order by c.sort_order`;
    return rows.map((r) => r.title);
  });
}
