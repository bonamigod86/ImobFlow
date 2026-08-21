import { getServerSession } from "@/lib/auth/session";
import { redirect } from "next/navigation";
import { getActionsForRole } from "@/lib/rbac/matrix";
import { isRole } from "@/lib/rbac/guards";
import EmailTemplatesAdmin from "@/components/admin/EmailTemplatesAdmin";

/**
 * /admin/email-templates — Master Admin transactional e-mail console.
 * Restricted to the MASTER role (holds `billing:admin`); every mutation is
 * guarded again per API call (Checklist Item 15).
 */
export default async function AdminEmailTemplatesPage() {
  const session = await getServerSession();
  if (!session) redirect("/login");

  const role = isRole(session.role) ? session.role : "AGENT";
  if (!getActionsForRole(role).has("billing:admin")) redirect("/dashboard");

  return (
    <main>
      <EmailTemplatesAdmin user={{ name: session.name, email: session.email, role: session.role }} />
    </main>
  );
}