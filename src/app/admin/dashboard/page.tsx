import { getServerSession } from "@/lib/auth/session";
import { redirect } from "next/navigation";
import { getActionsForRole } from "@/lib/rbac/matrix";
import { isRole } from "@/lib/rbac/guards";
import MasterDashboard from "@/components/admin/master/MasterDashboard";

/**
 * /admin/dashboard — Master executive panel (KPIs, tenants, dunning, queues,
 * audit). Restricted to the MASTER role (holds `billing:admin`); every API
 * call is guarded again on the server.
 */
export default async function AdminDashboardPage() {
  const session = await getServerSession();
  if (!session) redirect("/login");

  const role = isRole(session.role) ? session.role : "AGENT";
  if (!getActionsForRole(role).has("billing:admin")) redirect("/dashboard");

  return (
    <main className="w-full max-w-[1500px] px-4 py-6 sm:px-6">
      <MasterDashboard
        user={{ name: session.name, email: session.email, role: session.role }}
      />
    </main>
  );
}