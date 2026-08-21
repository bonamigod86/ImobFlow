import { getServerSession } from "@/lib/auth/session";
import { redirect } from "next/navigation";
import { getActionsForRole } from "@/lib/rbac/matrix";
import { isRole } from "@/lib/rbac/guards";
import SaaSDashboard from "@/components/admin/master/SaaSDashboard";

/**
 * /admin/dashboard — Master Admin "Dashboard Global do SaaS" (financeiro,
 * clientes/tenants com ações rápidas, ecossistema). Restricted to MASTER
 * (`billing:admin`); every API call is guarded again on the server.
 */
export default async function AdminDashboardPage() {
  const session = await getServerSession();
  if (!session) redirect("/login");

  const role = isRole(session.role) ? session.role : "AGENT";
  if (!getActionsForRole(role).has("billing:admin")) redirect("/dashboard");

  return (
    <main className="w-full max-w-[1500px] px-4 py-6 sm:px-6">
      <SaaSDashboard
        user={{ name: session.name, email: session.email, role: session.role }}
      />
    </main>
  );
}