import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Loader2, Lock, Unlock, CreditCard, Eye, Scale } from "lucide-react";
import { formatCentsBRL } from "@/lib/money";
import { getJson, postJson, patchJson } from "./api";
import type { PlanOption } from "./types";

export interface TenantRef {
  id: string;
  name: string;
  slug: string;
}

export type DialogAction =
  | { kind: "impersonate"; tenant: TenantRef }
  | { kind: "plan"; tenant: TenantRef }
  | { kind: "payment"; tenant: TenantRef }
  | { kind: "block"; tenant: TenantRef }
  | { kind: "unblock"; tenant: TenantRef }
  | { kind: "approve"; tenant: TenantRef };

interface ActionDialogProps {
  state: DialogAction | null;
  onClose: () => void;
  onDone: (message: string, redirectUrl?: string) => void;
}

export function ActionDialog({ state, onClose, onDone }: ActionDialogProps) {
  return (
    <Dialog open={state !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        {state ? <DialogBody key={state.kind + state.tenant.id} state={state} onClose={onClose} onDone={onDone} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function DialogBody({
  state,
  onClose,
  onDone,
}: {
  state: DialogAction;
  onClose: () => void;
  onDone: (message: string, redirectUrl?: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { tenant } = state;

  async function run(fn: () => Promise<string>) {
    setBusy(true);
    setError(null);
    try {
      const message = await fn();
      onDone(message);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha na operação.");
    } finally {
      setBusy(false);
    }
  }

  if (state.kind === "impersonate") {
    return (
      <ImpersonateBody
        tenant={tenant}
        busy={busy}
        error={error}
        onClose={onClose}
        onRun={(fn) => run(fn)}
      />
    );
  }
  if (state.kind === "payment") {
    return (
      <PaymentBody
        tenant={tenant}
        busy={busy}
        error={error}
        onClose={onClose}
        onRun={(fn) => run(fn)}
      />
    );
  }
  if (state.kind === "block") {
    return (
      <BlockBody
        tenant={tenant}
        mode="block"
        busy={busy}
        error={error}
        onClose={onClose}
        onRun={(fn) => run(fn)}
      />
    );
  }
  if (state.kind === "unblock") {
    return (
      <BlockBody
        tenant={tenant}
        mode="unblock"
        busy={busy}
        error={error}
        onClose={onClose}
        onRun={(fn) => run(fn)}
      />
    );
  }
  if (state.kind === "approve") {
    return <ApproveBody tenant={tenant} busy={busy} error={error} onClose={onClose} onRun={(fn) => run(fn)} />;
  }
  return <PlanBody tenant={tenant} busy={busy} error={error} onClose={onClose} onRun={(fn) => run(fn)} />;
}

const COMMON_FOOTER = ({ bus, onCancel, onConfirm, label }: {
  bus: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  label: string;
}) => (
  <DialogFooter>
    <Button variant="ghost" onClick={onCancel} disabled={bus}>
      Cancelar
    </Button>
    <Button onClick={onConfirm} disabled={bus}>
      {bus ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
      {label}
    </Button>
  </DialogFooter>
);

function ErrorBox({ message }: { message: string | null }) {
  if (!message) return null;
  return <p className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">{message}</p>;
}

function ImpersonateBody({
  tenant,
  busy,
  error,
  onClose,
  onRun,
}: {
  tenant: TenantRef;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onRun: (fn: () => Promise<string>) => void;
}) {
  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <Eye className="h-4 w-4 text-brand-400" />
          Entrar como assinante
        </DialogTitle>
        <DialogDescription>
          Acesse o painel de <strong className="text-ink-200">“{tenant.name}”</strong> com a sessão do
          proprietário. Sua sessão de administrador será substituída nesta aba — para voltar, faça login
          novamente.
        </DialogDescription>
      </DialogHeader>
      <ErrorBox message={error} />
      {COMMON_FOOTER({
        bus: busy,
        onCancel: onClose,
        onConfirm: () =>
          onRun(async () => {
            const res = await postJson<{ redirect: string }>(
              `/api/admin/tenants/${encodeURIComponent(tenant.id)}/impersonate`,
            );
            return res.redirect;
          }),
        label: "Continuar como assinante",
      })}
    </>
  );
}

function PaymentBody({
  tenant,
  busy,
  error,
  onClose,
  onRun,
}: {
  tenant: TenantRef;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onRun: (fn: () => Promise<string>) => void;
}) {
  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <CreditCard className="h-4 w-4 text-brand-400" />
          Enviar link de pagamento
        </DialogTitle>
        <DialogDescription>
          Envia um e-mail ao proprietário de <strong className="text-ink-200">“{tenant.name}”</strong> com o link
          de regularização da fatura mais antiga em aberto.
        </DialogDescription>
      </DialogHeader>
      <ErrorBox message={error} />
      {COMMON_FOOTER({
        bus: busy,
        onCancel: onClose,
        onConfirm: () =>
          onRun(async () => {
            const res = await postJson<{ amountCents: number }>(
              `/api/admin/tenants/${encodeURIComponent(tenant.id)}/payment-link`,
            );
            return `Link de pagamento (${formatCentsBRL(res.amountCents)}) enviado para ${tenant.name}.`;
          }),
        label: "Enviar link",
      })}
    </>
  );
}

function BlockBody({
  tenant,
  mode,
  busy,
  error,
  onClose,
  onRun,
}: {
  tenant: TenantRef;
  mode: "block" | "unblock";
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onRun: (fn: () => Promise<string>) => void;
}) {
  const [reason, setReason] = useState("");
  const verb = mode === "block" ? "Bloquear" : "Desbloquear";
  const Icon = mode === "block" ? Lock : Unlock;
  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <Icon className={`h-4 w-4 ${mode === "block" ? "text-red-400" : "text-emerald-400"}`} />
          {verb} conta
        </DialogTitle>
        <DialogDescription>
          {mode === "block"
            ? `Impede o acesso de “${tenant.name}” à plataforma até o pagamento ser regularizado.`
            : `Restaura o acesso de “${tenant.name}” à plataforma. O motivo fica registrado na trilha de auditoria.`}
        </DialogDescription>
      </DialogHeader>
      <div className="space-y-2">
        <Label>Motivo (opcional)</Label>
        <Input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder={mode === "block" ? "Ex.: fatura de R$ 199 vencida há 10 dias" : "Ex.: pagamento regularizado pelo assinante"}
        />
      </div>
      <ErrorBox message={error} />
      {COMMON_FOOTER({
        bus: busy,
        onCancel: onClose,
        onConfirm: () =>
          onRun(async () => {
            await patchJson(`/api/admin/tenants/${encodeURIComponent(tenant.id)}`, {
              status: mode === "block" ? "BLOCKED" : "ACTIVE",
              reason,
            });
            return mode === "block"
              ? `Conta “${tenant.name}” bloqueada.`
              : `Conta “${tenant.name}” desbloqueada.`;
          }),
        label: verb,
      })}
    </>
  );
}

function PlanBody({
  tenant,
  busy,
  error,
  onClose,
  onRun,
}: {
  tenant: TenantRef;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onRun: (fn: () => Promise<string>) => void;
}) {
  const [plans, setPlans] = useState<PlanOption[]>([]);
  const [planCode, setPlanCode] = useState("");
  const [loadingPlans, setLoadingPlans] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoadingPlans(true);
    getJson<{ plans: PlanOption[] }>("/api/admin/billing/plans")
      .then((d) => {
        if (!active) return;
        setPlans(d.plans.filter((p) => p.isActive));
        if (d.plans.length > 0 && !planCode) setPlanCode(d.plans[0]!.code);
      })
      .catch((e) => setLoadError(e.message))
      .finally(() => active && setLoadingPlans(false));
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <Scale className="h-4 w-4 text-brand-400" />
          Alterar plano de “{tenant.name}”
        </DialogTitle>
        <DialogDescription>
          Re-provisiona a assinatura do tenant no plano escolhido. A cobrança passa a refletir o novo
          valor a partir do próximo ciclo.
        </DialogDescription>
      </DialogHeader>
      <div className="space-y-2">
        <Label>Novo plano</Label>
        {loadingPlans ? (
          <div className="flex h-9 items-center gap-2 text-sm text-ink-400">
            <Loader2 className="h-4 w-4 animate-spin" />
            Carregando planos…
          </div>
        ) : (
          <Select value={planCode} onChange={(e) => setPlanCode(e.target.value)}>
            {plans.map((p) => (
              <option key={p.code} value={p.code}>
                {p.name} — {formatCentsBRL(p.priceCents)}{p.billingCycle === "YEARLY" ? "/ano" : "/mês"}
              </option>
            ))}
          </Select>
        )}
      </div>
      <ErrorBox message={error ?? loadError} />
      {COMMON_FOOTER({
        bus: busy,
        onCancel: onClose,
        onConfirm: () =>
          onRun(async () => {
            if (!planCode) throw new Error("Selecione um plano.");
            await postJson(`/api/admin/billing/tenants/${encodeURIComponent(tenant.id)}/provision`, {
              planCode,
              provider: "CUSTOM",
              force: true,
            });
            return `Plano de “${tenant.name}” atualizado.`;
          }),
        label: "Salvar plano",
      })}
    </>
  );
}

function ApproveBody({
  tenant,
  busy,
  error,
  onClose,
  onRun,
}: {
  tenant: TenantRef;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onRun: (fn: () => Promise<string>) => void;
}) {
  return (
    <>
      <DialogHeader>
        <DialogTitle>Aprovar cadastro</DialogTitle>
        <DialogDescription>
          Aprovar o cadastro de <strong>{tenant.name}</strong> ({tenant.slug})? O assinante
          passará a ter acesso ao painel e a publicar conteúdo.
        </DialogDescription>
      </DialogHeader>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      <DialogFooter>
        <Button variant="ghost" onClick={onClose} disabled={busy}>Cancelar</Button>
        <Button
          onClick={() =>
            onRun(async () => {
              await postJson(`/api/admin/tenants/${encodeURIComponent(tenant.id)}/approve`);
              return `Cadastro de "${tenant.name}" aprovado.`;
            })
          }
          disabled={busy}
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Aprovar
        </Button>
      </DialogFooter>
    </>
  );
}