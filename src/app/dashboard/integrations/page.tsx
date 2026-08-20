import { getServerSession } from "@/lib/auth/session";
import { redirect } from "next/navigation";
import { getActionsForRole } from "@/lib/rbac/matrix";
import { isRole } from "@/lib/rbac/guards";
import IntegrationsPanel from "@/components/integrations/IntegrationsPanel";

/**
 * /dashboard/integrations — Lead Engine ops console
 * Endpoints, routing rules, delivery logs and the Dead-Letter Queue with
 * manual replay. Restricted to roles holding `integrations:manage`
 * (OWNER / MANAGER / MASTER); access control is still enforced per API call.
 */
export default async function IntegrationsPage() {
  const session = await getServerSession();
  if (!session) redirect("/login");

  const role = isRole(session.role) ? session.role : "AGENT";
  if (!getActionsForRole(role).has("integrations:manage")) redirect("/dashboard");

  return (
    <main>
      <IntegrationsPanel
        user={{ name: session.name, email: session.email, role: session.role }}
        isMaster={session.tenantId === null}
      />
    </main>
  );
}