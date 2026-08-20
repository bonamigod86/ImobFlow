import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getServerSession } from "@/lib/auth/session";
import { AuditService } from "@/lib/audit/audit-service";
import { AUDIT_ACTIONS } from "@/lib/audit/actions";

/**
 * POST /api/auth/logout
 * Clears the session cookie and trails the logout event (best-effort).
 */
export async function POST(): Promise<NextResponse> {
  const session = await getServerSession();
  if (session) {
    AuditService.logAsync({
      action: AUDIT_ACTIONS.AUTH_LOGOUT,
      entity: "User",
      entityId: session.userId,
      tenantId: session.tenantId,
      userId: session.userId,
    });
  }

  cookies().delete("saas_session");
  return NextResponse.json({ loggedOut: true });
}