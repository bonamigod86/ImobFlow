"use client";

import type { TenantStatus, UserRole } from "@prisma/client";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { DeveloperDetailsDialog } from "@/components/dashboard/DeveloperDetails";
import SignOutButton from "@/components/SignOutButton";
import { ROLE_LABELS, TENANT_STATUS_LABELS, TENANT_STATUS_VARIANTS } from "@/components/dashboard/format";

interface DashboardHeaderProps {
  user: { name: string; email: string; role: UserRole };
  tenant: { id: string; slug: string; name: string; status: TenantStatus } | null;
  planName: string | null;
  actions: string[];
  clientSlug: string | null;
  clientRole: string | null;
}

export function DashboardHeader({
  user,
  tenant,
  planName,
  actions,
  clientSlug,
  clientRole,
}: DashboardHeaderProps) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-ink-50">Dashboard</h1>
        <p className="mt-1 text-sm text-ink-400">
          {user.name} · {user.email}
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Badge variant="secondary">{ROLE_LABELS[user.role] ?? user.role}</Badge>
          {tenant && (
            <>
              <Badge variant="outline">{tenant.name}</Badge>
              <Badge variant={TENANT_STATUS_VARIANTS[tenant.status]}>
                {TENANT_STATUS_LABELS[tenant.status]}
              </Badge>
            </>
          )}
          {planName && <Badge variant="default">{planName}</Badge>}
        </div>
      <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
          {tenant && (
            <Link href="/dashboard/profile" className="text-ink-400 transition-colors hover:text-brand-600">
              Perfil
            </Link>
          )}
        </div>
      </div>
      <div className="flex items-center gap-1.5">
        <DeveloperDetailsDialog
          user={user}
          tenant={tenant}
          actions={actions}
          clientSlug={clientSlug}
          clientRole={clientRole}
        />
        <SignOutButton />
      </div>
    </div>
  );
}