"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Building2, CheckCircle2, Headset, Loader2 } from "lucide-react";

/**
 * Self-service signup (Item 3): imobiliária (AGENCY) ou corretor autônomo
 * (BROKER). Posts to /api/register; on success the API sets the session cookie
 * and the user lands on their own /dashboard.
 */
export function RegisterForm() {
  const router = useRouter();
  const [type, setType] = useState<"AGENCY" | "BROKER">("AGENCY");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(form: FormData) {
    setSending(true);
    setError(null);
    const social = {
      instagram: form.get("instagram") || null,
      facebook: form.get("facebook") || null,
      linkedin: form.get("linkedin") || null,
    };
    const payload = {
      type,
      displayName: form.get("displayName"),
      legalName: form.get("legalName") || null,
      document: form.get("document")?.toString().replace(/\D/g, ""),
      creci: form.get("creci") || null,
      responsibleName: form.get("responsibleName"),
      phone: form.get("phone"),
      whatsapp: form.get("whatsapp") || null,
      email: form.get("email"),
      password: form.get("password"),
      address: form.get("address") || null,
      city: form.get("city") || null,
      state: form.get("state") || null,
      description: form.get("description") || null,
      website: form.get("website") || null,
      socialLinks: social,
    };
    try {
      const res = await fetch("/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        const message = Array.isArray(data?.details)
          ? data.details.map((d: { message: string }) => d.message).join(" · ")
          : data?.message ?? "Não foi possível criar a conta. Tente novamente.";
        throw new Error(message);
      }
      router.push("/dashboard");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSending(false);
    }
  }

  const input =
    "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-100";
  const label = "mb-1 block text-xs font-medium text-slate-600";

  const selectCard = (value: "AGENCY" | "BROKER", title: string, desc: string, icon: React.ReactNode) => (
    <button
      type="button"
      onClick={() => setType(value)}
      className={`flex flex-col items-start gap-1 rounded-xl border p-4 text-left transition-colors ${
        type === value ? "border-brand-600 bg-brand-50 ring-2 ring-brand-100" : "border-slate-200 bg-white hover:border-slate-300"
      }`}
    >
      <span className="text-brand-600">{icon}</span>
      <span className="text-sm font-semibold text-slate-900">{title}</span>
      <span className="text-xs text-slate-500">{desc}</span>
    </button>
  );

  return (
    <form action={submit} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div>
        <p className={label}>Tipo de conta *</p>
        <div className="grid gap-3 sm:grid-cols-2">
          {selectCard("AGENCY", "Imobiliária", "Empresa com CNPJ e equipe de corretores.", <Building2 className="h-5 w-5" />)}
          {selectCard("BROKER", "Corretor autônomo", "Profissional individual com CPF.", <Headset className="h-5 w-5" />)}
        </div>
      </div>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className={label}>Nome / Nome fantasia *</label>
          <input name="displayName" required placeholder={type === "AGENCY" ? "Ex.: ACME Imóveis" : "Seu nome"} className={input} />
        </div>

        {type === "AGENCY" && (
          <div>
            <label className={label}>Razão social</label>
            <input name="legalName" placeholder="Ex.: ACME Imóveis Ltda" className={input} />
          </div>
        )}

        <div>
          <label className={label}>{type === "AGENCY" ? "CNPJ *" : "CPF *"}</label>
          <input name="document" required inputMode="numeric" placeholder={type === "AGENCY" ? "00.000.000/0000-00" : "000.000.000-00"} className={input} />
        </div>

        <div>
          <label className={label}>CRECI</label>
          <input name="creci" placeholder="Ex.: CRECI-SP 12345-F" className={input} />
        </div>

        <div>
          <label className={label}>Responsável *</label>
          <input name="responsibleName" required placeholder="Nome do responsável legal" className={input} />
        </div>

        <div>
          <label className={label}>Telefone *</label>
          <input name="phone" required type="tel" placeholder="(11) 99999-9999" className={input} />
        </div>

        <div>
          <label className={label}>WhatsApp</label>
          <input name="whatsapp" type="tel" placeholder="(11) 99999-9999" className={input} />
        </div>

        <div>
          <label className={label}>E-mail de acesso *</label>
          <input name="email" required type="email" placeholder="voce@empresa.com.br" className={input} />
        </div>

        <div>
          <label className={label}>Senha *</label>
          <input name="password" required type="password" minLength={8} placeholder="Mínimo 8 caracteres" className={input} />
        </div>

        <div>
          <label className={label}>CEP / Endereço</label>
          <input name="address" placeholder="Rua, número, complemento…" className={input} />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={label}>Cidade</label>
            <input name="city" placeholder="São Paulo" className={input} />
          </div>
          <div>
            <label className={label}>UF</label>
            <input name="state" placeholder="SP" maxLength={2} className={input} />
          </div>
        </div>

        <div className="sm:col-span-2">
          <label className={label}>Descrição da empresa</label>
          <textarea name="description" rows={2} placeholder="Sobre a imobiliária / corretor…" className={`${input} resize-none`} />
        </div>

        <div>
          <label className={label}>Site</label>
          <input name="website" type="url" placeholder="https://suaempresa.com.br" className={input} />
        </div>

        <div>
          <label className={label}>Instagram</label>
          <input name="instagram" placeholder="@suaempresa" className={input} />
        </div>

        <div>
          <label className={label}>Facebook</label>
          <input name="facebook" placeholder="facebook.com/suaempresa" className={input} />
        </div>

        <div>
          <label className={label}>LinkedIn</label>
          <input name="linkedin" placeholder="linkedin.com/company/suaempresa" className={input} />
        </div>
      </div>

      {error && <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

      <button
        type="submit"
        disabled={sending}
        className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-brand-700 disabled:opacity-60"
      >
        {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
        {sending ? "Criando conta…" : "Criar conta e entrar"}
      </button>
      <p className="mt-3 text-center text-xs text-slate-400">
        Seus dados são usados apenas para gestão da sua conta. Cada assinante tem ambiente isolado.
      </p>
    </form>
  );
}