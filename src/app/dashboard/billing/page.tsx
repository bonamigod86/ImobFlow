import { getServerSession } from "@/lib/auth/session";
import { redirect } from "next/navigation";
import { getActionsForRole } from "@/lib/rbac/matrix";
import { isRole } from "@/lib/rbac/guards";
import TenantBillingPanel from "@/components/billing/TenantBillingPanel";

/**
 * /dashboard/billing — tenant billing & highlight monetization console.
 * Restricted to roles holding `billing:self` (OWNER / MANAGER / MASTER);
 * access control is still enforced per API call.
 */
export default async function TenantBillingPage() {
  const session = await getServerSession();
  if (!session) redirect("/login");

  const role = isRole(session.role) ? session.role : "AGENT";
  if (!getActionsForRole(role).has("billing:self")) redirect("/dashboard");

  return (
    <main>
      <TenantBillingPanel user={{ name: session.name, email: session.email, role: session.role }} />
    </main>
  );
}