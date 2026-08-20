"use client";

import type { TenantStatus, UserRole } from "@prisma/client";
import { Braces } from "lucide-react";
import { useState } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { ROLE_LABELS, TENANT_STATUS_LABELS } from "@/components/dashboard/format";

interface DeveloperDetailsProps {
  user: { name: string; email: string; role: UserRole };
  tenant: { id: string; slug: string; name: string; status: TenantStatus } | null;
  actions: string[];
  clientSlug: string | null;
  clientRole: string | null;
}

/** Debug/identity surface, hidden behind the header icon — never on the main grid. */
export function DeveloperDetailsDialog({
  user,
  tenant,
  actions,
  clientSlug,
  clientRole,
}: DeveloperDetailsProps) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Detalhes de desenvolvimento"
          title="Detalhes de desenvolvimento"
        >
          <Braces className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Detalhes de desenvolvimento</DialogTitle>
          <DialogDescription>
            Identidade da sessão, permissões e contratos consumidos por esta tela.
          </DialogDescription>
        </DialogHeader>

        <section className="space-y-3">
          <h4 className="text-xs font-medium uppercase tracking-wide text-ink-400">Sessão autenticada</h4>
          <dl className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
            <Detail label="Usuário" value={user.name} />
            <Detail label="E-mail" value={user.email} />
            <Detail label="Papel" value={ROLE_LABELS[user.role] ?? user.role} />
            <Detail label="Tenant (header)" value={(tenant?.slug ?? clientSlug) || "—"} />
            <Detail label="Papel no cliente" value={clientRole || "—"} />
            <Detail
              label="Status do tenant"
              value={tenant ? TENANT_STATUS_LABELS[tenant.status] : "Plataforma"}
            />
            <Detail label="ID do tenant" value={tenant?.id ?? "—"} mono />
            <Detail label="Eventos" value={`${actions.length} permissões concedidas`} />
          </dl>
          <p className="text-xs text-ink-400">
            O token de acesso carrega apenas claims públicos (papel e tenant) — nunca segredos ou
            senhas. As decisões de acesso acontecem sempre no servidor.
          </p>
        </section>

        <section className="space-y-2.5">
          <h4 className="text-xs font-medium uppercase tracking-wide text-ink-400">
            Permissões da função ({actions.length})
          </h4>
          <div className="flex max-h-44 flex-wrap gap-1.5 overflow-y-auto">
            {actions.map((action) => (
              <Badge key={action} variant="outline" className="font-mono">
                {action}
              </Badge>
            ))}
          </div>
        </section>

        <section className="space-y-2.5">
          <h4 className="text-xs font-medium uppercase tracking-wide text-ink-400">Contratos consumidos</h4>
          <div className="flex flex-wrap gap-2">
            {["GET /api/analytics/dashboard", "GET /api/properties", "PATCH /api/properties/:id", "DELETE /api/properties/:id", "POST /api/properties"].map(
              (endpoint) => (
                <code
                  key={endpoint}
                  className="rounded-md border border-ink-700 bg-ink-950/60 px-2 py-1 text-xs text-ink-300"
                >
                  {endpoint}
                </code>
              ),
            )}
          </div>
        </section>

        <div className="mt-2 flex justify-end">
          <a
            href="#"
            onClick={(e) => {
              e.preventDefault();
              setOpen(false);
            }}
            className={cn(buttonVariants({ variant: "secondary" }))}
          >
            Fechar
          </a>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Detail({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs text-ink-400">{label}</dt>
      <dd className={cn("text-sm text-ink-100", mono && "truncate font-mono text-xs")}>{value}</dd>
    </div>
  );
}