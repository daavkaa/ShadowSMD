import "server-only";
import { withUser } from "@/lib/db/client";

export type MyEntitlement = {
  id: string;
  scope_kind: string;
  scope_label: string;
  source_kind: string;
  valid_from: Date;
  valid_until: Date | null;
  status: string;
  is_demo: boolean;
  organization_name: string | null;
  state: "active" | "scheduled" | "expired" | "revoked";
};

export async function listMyEntitlements(userId: string): Promise<MyEntitlement[]> {
  return withUser(userId, async (tx) => tx<MyEntitlement[]>`
    select e.id, e.scope_kind,
           case e.scope_kind when 'library_pro' then 'Professional сан' when 'library_core' then 'Үндсэн сан'
             when 'course' then coalesce((select title from public.courses c where c.id = e.scope_course_id), 'Сургалт')
             else coalesce((select name from public.products p where p.id = e.scope_bundle_product_id), 'Багц') end as scope_label,
           e.source_kind, e.valid_from, e.valid_until, e.status, e.is_demo,
           (select name from public.organizations o where o.id = e.organization_id) as organization_name,
           case when e.status = 'revoked' then 'revoked'
                when e.valid_from > now() then 'scheduled'
                when e.valid_until is not null and e.valid_until <= now() then 'expired'
                else 'active' end as state
    from public.entitlements e order by e.created_at desc`);
}
