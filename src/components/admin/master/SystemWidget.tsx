import type { ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { AdminCardHeader } from "./KpiCards";
import { timeAgoBR } from "./shared";
import { CircuitBoard, Inbox, Mail, Zap, Loader2, Network } from "lucide-react";
import { AUDIT_ACTION_LABELS, type AuditRow, type ControlData } from "./types";

interface SystemWidgetProps {
  queues: ControlData["queues"];
  audit: AuditRow[];
  busy: boolean;
}

export function SystemWidget({ queues, audit, busy }: SystemWidgetProps) {
  const email = queues.email.counts;
  const processed = email.completed + email.failed;
  const pct = processed > 0 ? Math.round((email.completed / processed) * 100) : 0;

  return (
    <div className="space-y-6">
      <Card>
        <AdminCardHeader
          title="Filas do sistema"
          description="BullMQ: filas ativas, entregas de e-mail e mensagens na dead-letter."
          icon={<CircuitBoard className="h-4 w-4 text-brand-400" />}
        />
        <CardContent>
          {!queues.available ? (
            <p className="flex items-center gap-2 text-sm text-ink-400">
              <Loader2 className="h-4 w-4 animate-spin" />
              Fila indisponível (Redis fora do ar).
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <MetricChip
                icon={<Zap className="h-4 w-4 text-amber-400" />}
                label="Jobs ativos"
                value={String(queues.totalActive)}
              />
              <MetricChip
                icon={<Network className="h-4 w-4 text-sky-400" />}
                label="Em espera"
                value={String(email.waiting + email.delayed)}
              />
              <MetricChip
                icon={<Inbox className="h-4 w-4 text-red-400" />}
                label="Falhas na DLQ"
                value={String(queues.dlqFailed)}
                tone="danger"
              />
              <MetricChip
                icon={<Mail className="h-4 w-4 text-emerald-400" />}
                label="E-mails entregues"
                value={String(email.completed)}
              />
            </div>
          )}

          {queues.available && processed > 0 ? (
            <div className="mt-4">
              <div className="mb-1 flex items-center justify-between text-xs text-ink-400">
                <span>Fila {queues.email.name}</span>
                <span>
                  {email.completed} entregues · {email.failed} com erro · {pct}% de sucesso
                </span>
              </div>
              <Progress value={pct} className="h-1.5" />
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <AdminCardHeader
          title="Trilha de auditoria"
          description="Últimas ações administrativas registradas na plataforma."
          icon={<Inbox className="h-4 w-4 text-brand-400" />}
        />
        <CardContent>
          {busy && audit.length === 0 ? (
            <p className="flex items-center gap-2 text-sm text-ink-400">
              <Loader2 className="h-4 w-4 animate-spin" />
              Carregando auditoria…
            </p>
          ) : audit.length === 0 ? (
            <p className="text-sm text-ink-400">Nenhuma ação administrativa registrada ainda.</p>
          ) : (
            <ul className="space-y-3">
              {audit.map((a) => (
                <li key={a.id} className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <Badge variant="secondary" className="uppercase">
                        {a.action.replaceAll("_", " ")}
                      </Badge>
                      <span className="truncate text-sm font-medium text-ink-100">
                        {AUDIT_ACTION_LABELS[a.action] ?? a.action}
                      </span>
                    </div>
                    <p className="mt-0.5 truncate text-xs text-ink-400">
                      {a.tenantSlug ? `${a.tenantSlug} · ` : "Plataforma · "}
                      {a.actorName ?? a.actorEmail ?? "Sistema"}
                    </p>
                  </div>
                  <span className="whitespace-nowrap text-xs text-ink-400">
                    {timeAgoBR(a.createdAt)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function MetricChip({
  icon,
  label,
  value,
  tone,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  tone?: "default" | "danger";
}) {
  return (
    <div className="rounded-lg border border-ink-800 bg-ink-950/40 p-3">
      <div className="flex items-center gap-1.5 text-xs text-ink-400">
        {icon}
        {label}
      </div>
      <p
        className={`mt-1 text-xl font-semibold ${
          tone === "danger" && value !== "0" ? "text-red-300" : "text-ink-50"
        }`}
      >
        {value}
      </p>
    </div>
  );
}