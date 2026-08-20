import { Card, CardContent } from "@/components/ui/card";
import { StatusPill } from "./KpiCards";
import { Database, Mail, Server, CircuitBoard } from "lucide-react";
import type { ControlData } from "./types";

export function HealthStrip({
  health,
  queues,
}: Pick<ControlData, "health" | "queues">) {
  const providerLabel =
    health.emailProvider === "console"
      ? "console (log)"
      : health.emailProvider || "não configurado";

  return (
    <Card>
      <CardContent className="flex flex-wrap items-center gap-x-6 gap-y-3 pt-5">
        <div className="flex items-center gap-2 text-sm font-medium text-ink-100">
          <Server className="h-4 w-4 text-brand-400" />
          Saúde da plataforma
        </div>
        <div className="flex items-center gap-2 text-sm text-ink-300">
          <Database className="h-4 w-4 text-ink-400" />
          Postgres
          <StatusPill tone={health.db === "up" ? "up" : "down"} label={health.db === "up" ? "OK" : "Fora"} />
        </div>
        <div className="flex items-center gap-2 text-sm text-ink-300">
          <Database className="h-4 w-4 text-ink-400" />
          Redis
          <StatusPill tone={health.redis === "up" ? "up" : "down"} label={health.redis === "up" ? "OK" : "Fora"} />
        </div>
        <div className="flex items-center gap-2 text-sm text-ink-300">
          <Mail className="h-4 w-4 text-ink-400" />
          Dispatcher de e-mail
          <StatusPill
            tone={health.email === "up" ? "up" : health.email === "diagnostic" ? "diagnostic" : "down"}
            label={health.email === "diagnostic" ? providerLabel : health.email === "up" ? "Ativo" : "Fora"}
          />
        </div>
        <div className="flex items-center gap-2 text-sm text-ink-300">
          <CircuitBoard className="h-4 w-4 text-ink-400" />
          Filas
          <StatusPill
            tone={queues.available ? "up" : "down"}
            label={queues.available ? `${queues.totalActive} ativas` : "Indisponível"}
          />
        </div>
      </CardContent>
    </Card>
  );
}