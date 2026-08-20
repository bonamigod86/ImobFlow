import { getServerSession } from "@/lib/auth/session";
import { redirect } from "next/navigation";
import { getActionsForRole } from "@/lib/rbac/matrix";
import { isRole } from "@/lib/rbac/guards";
import BillingAdminConsole from "@/components/admin/BillingAdminConsole";

/**
 * /admin/billing — Master Admin SaaS billing console.
 * Restricted to the MASTER role (holds `billing:admin`); every mutation is
 * guarded again per API call.
 */
export default async function AdminBillingPage() {
  const session = await getServerSession();
  if (!session) redirect("/login");

  const role = isRole(session.role) ? session.role : "AGENT";
  if (!getActionsForRole(role).has("billing:admin")) redirect("/dashboard");

  return (
    <main>
      <BillingAdminConsole user={{ name: session.name, email: session.email, role: session.role }} />
    </main>
  );
}