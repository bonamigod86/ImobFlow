import { getServerSession } from "@/lib/auth/session";
import { redirect } from "next/navigation";
import { getActionsForRole } from "@/lib/rbac/matrix";
import { isRole } from "@/lib/rbac/guards";
import FinancialAdminConsole from "@/components/admin/FinancialAdminConsole";

/**
 * /admin/financial — Master Admin subscription financial management
 * (Checklist Item 17). Restricted to MASTER (`billing:admin`).
 */
export default async function AdminFinancialPage() {
  const session = await getServerSession();
  if (!session) redirect("/login");

  const role = isRole(session.role) ? session.role : "AGENT";
  if (!getActionsForRole(role).has("billing:admin")) redirect("/dashboard");

  return (
    <main>
      <FinancialAdminConsole user={{ name: session.name, email: session.email, role: session.role }} />
    </main>
  );
}