import type { TenantStatus } from "@prisma/client";
import { getServerSession } from "@/lib/auth/session";
import { redirect } from "next/navigation";
import { TenantResolver } from "@/lib/tenant/resolver";
import { getActionsForRole } from "@/lib/rbac/matrix";
import { isRole } from "@/lib/rbac/guards";
import DashboardView from "@/components/DashboardView";

/**
 * /dashboard — authenticated, tenant-aware landing surface.
 * RBAC: renders feature flags from the role's action set; all real access
 * control still happens in the API layer.
 */
export default async function DashboardPage() {
  const session = await getServerSession();
  if (!session) redirect("/login");

  let tenant: { id: string; slug: string; name: string; status: TenantStatus } | null = null;
  if (session.tenantId) {
    const resolved = await TenantResolver.resolveById(session.tenantId);
    if (!resolved || resolved.status === "BLOCKED" || resolved.status === "CANCELLED") {
      redirect("/login");
    }
    tenant = {
      id: resolved.id,
      slug: resolved.slug,
      name: resolved.name,
      status: resolved.status,
    };
  }

  const role = isRole(session.role) ? session.role : "AGENT";
  const actions = [...getActionsForRole(role)].sort();

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
      <DashboardView
        user={{ name: session.name, email: session.email, role: session.role }}
        tenant={tenant}
        actions={actions}
      />
    </main>
  );
}