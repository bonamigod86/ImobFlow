import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AdminCardHeader } from "./KpiCards";
import { dateBR } from "./shared";
import { formatCentsBRL } from "@/lib/money";
import { TriangleAlert, Clock3, Send, Lock } from "lucide-react";
import type { DunningRow } from "./types";
import type { DialogAction } from "./ActionDialog";

interface DunningWidgetProps {
  rows: DunningRow[];
  onAction: (action: DialogAction) => void;
}

export function DunningWidget({ rows, onAction }: DunningWidgetProps) {
  return (
    <Card>
      <AdminCardHeader
        title="Cobrança & avisos de inadimplência"
        description="Contas PAST_DUE com dias de atraso e valor em aberto."
        icon={<TriangleAlert className="h-4 w-4 text-amber-400" />}
      />
      <CardContent>
        {rows.length === 0 ? (
          <div className="flex items-center gap-2 rounded-lg border border-dashed border-ink-700 p-4 text-sm text-ink-400">
            <Clock3 className="h-4 w-4 shrink-0 text-emerald-400" />
            Nenhuma conta em atraso no momento.
          </div>
        ) : (
          <ul className="space-y-3">
            {rows.map((r) => (
              <li
                key={r.id}
                className="rounded-lg border border-ink-800 bg-ink-950/40 p-3.5"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-medium text-ink-50">{r.name}</p>
                      <Badge variant="warning">{r.daysOverdue} d atraso</Badge>
                    </div>
                    <p className="mt-0.5 truncate text-xs text-ink-400">
                      {r.slug} · {r.planName ?? "Plano"}
                    </p>
                  </div>
                  <p className="whitespace-nowrap text-sm font-semibold text-amber-300">
                    {formatCentsBRL(r.pendingCents || 0)}
                  </p>
                </div>
                <p className="mt-1.5 text-xs text-ink-400">
                  Vencimento: {dateBR(r.graceEndsAt?.slice(0, 10) ?? null)} · suspensão após o grace period
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      onAction({
                        kind: "payment",
                        tenant: { id: r.id, name: r.name, slug: r.slug },
                      })
                    }
                  >
                    <Send className="h-3.5 w-3.5" />
                    Enviar aviso
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-red-500/40 text-red-300 hover:bg-red-500/10 hover:text-red-200"
                    onClick={() =>
                      onAction({
                        kind: "block",
                        tenant: { id: r.id, name: r.name, slug: r.slug },
                      })
                    }
                  >
                    <Lock className="h-3.5 w-3.5" />
                    Bloquear conta
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}