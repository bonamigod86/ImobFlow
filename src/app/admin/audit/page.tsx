import { getServerSession } from "@/lib/auth/session";
import { redirect } from "next/navigation";
import { getActionsForRole } from "@/lib/rbac/matrix";
import { isRole } from "@/lib/rbac/guards";
import AuditAdminConsole from "@/components/admin/AuditAdminConsole";

/**
 * /admin/audit — Master Admin audit log console (Checklist Item 24).
 * Restricted to MASTER (`billing:admin`).
 */
export default async function AdminAuditPage() {
  const session = await getServerSession();
  if (!session) redirect("/login");

  const role = isRole(session.role) ? session.role : "AGENT";
  if (!getActionsForRole(role).has("billing:admin")) redirect("/dashboard");

  return (
    <main>
      <AuditAdminConsole user={{ name: session.name, email: session.email, role: session.role }} />
    </main>
  );
}