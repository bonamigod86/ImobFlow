"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import { CheckCircle2, ImageIcon, Loader2 } from "lucide-react";

interface TenantProfile {
  id: string;
  name: string;
  type: "AGENCY" | "BROKER";
  legalName: string | null;
  document: string | null;
  creci: string | null;
  responsibleName: string | null;
  phone: string | null;
  whatsapp: string | null;
  contactEmail: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  logoUrl: string | null;
  description: string | null;
  website: string | null;
  socialLinks: { instagram?: string; facebook?: string; linkedin?: string } | null;
}

interface BrokerProfile {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  document: string | null;
  creci: string | null;
  photoUrl: string | null;
  whatsapp: string | null;
}

type FormState = {
  tenant: {
    displayName: string;
    legalName: string;
    document: string;
    creci: string;
    responsibleName: string;
    phone: string;
    whatsapp: string;
    contactEmail: string;
    address: string;
    city: string;
    state: string;
    logoUrl: string;
    description: string;
    website: string;
    instagram: string;
    facebook: string;
    linkedin: string;
  };
  broker: {
    name: string;
    document: string;
    creci: string;
    phone: string;
    whatsapp: string;
    photoUrl: string;
  };
};

const READY: FormState = {
  tenant: {
    displayName: "",
    legalName: "",
    document: "",
    creci: "",
    responsibleName: "",
    phone: "",
    whatsapp: "",
    contactEmail: "",
    address: "",
    city: "",
    state: "",
    logoUrl: "",
    description: "",
    website: "",
    instagram: "",
    facebook: "",
    linkedin: "",
  },
  broker: { name: "", document: "", creci: "", phone: "", whatsapp: "", photoUrl: "" },
};

const input =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-100";
const label = "mb-1 block text-xs font-medium text-slate-600";

function FileUpload({
  labelText,
  value,
  onChange,
  previewFor,
}: {
  labelText: string;
  value: string;
  onChange: (dataUrl: string) => void;
  previewFor: "logo" | "photo";
}) {
  const [reading, setReading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const onFile = useCallback(
    (f: File | undefined) => {
      if (!f) return;
      setErr(null);
      if (!f.type.startsWith("image/")) {
        setErr("Envie um arquivo de imagem.");
        return;
      }
      if (f.size > 1024 * 1024) {
        setErr("Imagem deve ter até 1 MB.");
        return;
      }
      setReading(true);
      const reader = new FileReader();
      reader.onload = () => onChange(String(reader.result));
      reader.onerror = () => setErr("Não foi possível ler o arquivo.");
      reader.onloadend = () => setReading(false);
      reader.readAsDataURL(f);
    },
    [onChange],
  );

  return (
    <div>
      <label className={label}>{labelText}</label>
      <div className="flex items-center gap-3">
        <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
          {value ? (
            <Image src={value} alt={labelText} width={64} height={64} unoptimized className="h-full w-full object-cover" />
          ) : (
            <ImageIcon className="h-6 w-6 text-slate-300" />
          )}
        </div>
        <div className="flex-1">
          <input
            type="file"
            accept="image/*"
            onChange={(e) => onFile(e.target.files?.[0])}
            className="block w-full text-xs text-slate-500 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-xs file:font-medium file:text-slate-700"
          />
          {reading && <p className="mt-1 text-xs text-slate-400">Lendo imagem…</p>}
          {err && <p className="mt-1 text-xs text-red-600">{err}</p>}
          {value && (
            <button type="button" onClick={() => onChange("")} className="mt-1 text-xs text-slate-400 hover:text-red-600">
              Remover imagem
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/** Loads the tenant + broker profile and PATCHes it back via /api/tenant/profile. */
export function TenantProfileForm() {
  const [form, setForm] = useState<FormState | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/tenant/profile")
      .then((r) => {
        if (!r.ok) throw new Error("Não foi possível carregar o perfil.");
        return r.json();
      })
      .then((d) => {
        const t: TenantProfile = d.tenant;
        const b: BrokerProfile = d.owner;
        const social = (t.socialLinks ?? {}) as { instagram?: string; facebook?: string; linkedin?: string };
        setForm({
          tenant: {
            displayName: t.name,
            legalName: t.legalName ?? "",
            document: t.document ?? "",
            creci: t.creci ?? "",
            responsibleName: t.responsibleName ?? "",
            phone: t.phone ?? "",
            whatsapp: t.whatsapp ?? "",
            contactEmail: t.contactEmail ?? "",
            address: t.address ?? "",
            city: t.city ?? "",
            state: t.state ?? "",
            logoUrl: t.logoUrl ?? "",
            description: t.description ?? "",
            website: t.website ?? "",
            instagram: social.instagram ?? "",
            facebook: social.facebook ?? "",
            linkedin: social.linkedin ?? "",
          },
          broker: {
            name: b.name,
            document: b.document ?? "",
            creci: b.creci ?? "",
            phone: b.phone ?? "",
            whatsapp: b.whatsapp ?? "",
            photoUrl: b.photoUrl ?? "",
          },
        });
      })
      .catch((e) => setLoadError((e as Error).message));
  }, []);

  function setTenant<K extends keyof FormState["tenant"]>(key: K, value: string) {
    setForm((f) => (f ? { ...f, tenant: { ...f.tenant, [key]: value } } : f));
  }
  function setBroker<K extends keyof FormState["broker"]>(key: K, value: string) {
    setForm((f) => (f ? { ...f, broker: { ...f.broker, [key]: value } } : f));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form) return;
    setSaving(true);
    setSaved(false);
    setSaveError(null);
    const t = form.tenant;
    const b = form.broker;
    try {
      const res = await fetch("/api/tenant/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenant: {
            displayName: t.displayName,
            legalName: t.legalName || null,
            document: t.document.replace(/\D/g, ""),
            creci: t.creci || null,
            responsibleName: t.responsibleName,
            phone: t.phone,
            whatsapp: t.whatsapp || null,
            contactEmail: t.contactEmail || null,
            address: t.address || null,
            city: t.city || null,
            state: t.state.toUpperCase() || null,
            logoUrl: t.logoUrl || null,
            description: t.description || null,
            website: t.website || null,
            socialLinks: {
              instagram: t.instagram || null,
              facebook: t.facebook || null,
              linkedin: t.linkedin || null,
            },
          },
          broker: {
            name: b.name,
            document: b.document.replace(/\D/g, ""),
            creci: b.creci || null,
            phone: b.phone || null,
            whatsapp: b.whatsapp || null,
            photoUrl: b.photoUrl || null,
          },
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.message ?? "Não foi possível salvar.");
      }
      setSaved(true);
    } catch (err) {
      setSaveError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  if (loadError) return <p className="text-sm text-red-600">{loadError}</p>;
  if (!form) return <p className="text-sm text-slate-400">Carregando perfil…</p>;

  return (
    <form onSubmit={submit} className="space-y-6">
      <section className="rounded-2xl border border-slate-200 bg-white p-6">
        <h2 className="text-base font-semibold text-slate-900">Dados cadastrais</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <label className={label}>Nome / Nome fantasia *</label>
            <input value={form.tenant.displayName} onChange={(e) => setTenant("displayName", e.target.value)} required className={input} />
          </div>
          <div>
            <label className={label}>Razão social</label>
            <input value={form.tenant.legalName} onChange={(e) => setTenant("legalName", e.target.value)} className={input} />
          </div>
          <div>
            <label className={label}>CPF / CNPJ</label>
            <input value={form.tenant.document} onChange={(e) => setTenant("document", e.target.value)} inputMode="numeric" className={input} />
          </div>
          <div>
            <label className={label}>CRECI</label>
            <input value={form.tenant.creci} onChange={(e) => setTenant("creci", e.target.value)} className={input} />
          </div>
          <div>
            <label className={label}>Responsável *</label>
            <input value={form.tenant.responsibleName} onChange={(e) => setTenant("responsibleName", e.target.value)} required className={input} />
          </div>
          <div>
            <label className={label}>Telefone *</label>
            <input value={form.tenant.phone} onChange={(e) => setTenant("phone", e.target.value)} type="tel" required className={input} />
          </div>
          <div>
            <label className={label}>WhatsApp</label>
            <input value={form.tenant.whatsapp} onChange={(e) => setTenant("whatsapp", e.target.value)} type="tel" className={input} />
          </div>
          <div>
            <label className={label}>E-mail de contato</label>
            <input value={form.tenant.contactEmail} onChange={(e) => setTenant("contactEmail", e.target.value)} type="email" className={input} />
          </div>
          <div>
            <label className={label}>Endereço</label>
            <input value={form.tenant.address} onChange={(e) => setTenant("address", e.target.value)} className={input} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={label}>Cidade</label>
              <input value={form.tenant.city} onChange={(e) => setTenant("city", e.target.value)} className={input} />
            </div>
            <div>
              <label className={label}>UF</label>
              <input value={form.tenant.state} onChange={(e) => setTenant("state", e.target.value)} maxLength={2} className={input} />
            </div>
          </div>
          <div className="sm:col-span-2">
            <label className={label}>Descrição</label>
            <textarea value={form.tenant.description} onChange={(e) => setTenant("description", e.target.value)} rows={2} className={`${input} resize-none`} />
          </div>
          <div>
            <label className={label}>Site</label>
            <input value={form.tenant.website} onChange={(e) => setTenant("website", e.target.value)} className={input} />
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6">
        <h2 className="text-base font-semibold text-slate-900">Logo e redes sociais</h2>
        <div className="mt-4">
          <FileUpload labelText="Logo" value={form.tenant.logoUrl} onChange={(v) => setTenant("logoUrl", v)} previewFor="logo" />
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <div>
            <label className={label}>Instagram</label>
            <input value={form.tenant.instagram} onChange={(e) => setTenant("instagram", e.target.value)} className={input} />
          </div>
          <div>
            <label className={label}>Facebook</label>
            <input value={form.tenant.facebook} onChange={(e) => setTenant("facebook", e.target.value)} className={input} />
          </div>
          <div>
            <label className={label}>LinkedIn</label>
            <input value={form.tenant.linkedin} onChange={(e) => setTenant("linkedin", e.target.value)} className={input} />
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6">
        <h2 className="text-base font-semibold text-slate-900">Corretor responsável</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <label className={label}>Nome *</label>
            <input value={form.broker.name} onChange={(e) => setBroker("name", e.target.value)} required className={input} />
          </div>
          <div>
            <label className={label}>CPF</label>
            <input value={form.broker.document} onChange={(e) => setBroker("document", e.target.value)} inputMode="numeric" className={input} />
          </div>
          <div>
            <label className={label}>CRECI</label>
            <input value={form.broker.creci} onChange={(e) => setBroker("creci", e.target.value)} className={input} />
          </div>
          <div>
            <label className={label}>Telefone</label>
            <input value={form.broker.phone} onChange={(e) => setBroker("phone", e.target.value)} type="tel" className={input} />
          </div>
          <div>
            <label className={label}>WhatsApp</label>
            <input value={form.broker.whatsapp} onChange={(e) => setBroker("whatsapp", e.target.value)} type="tel" className={input} />
          </div>
        </div>
        <div className="mt-4">
          <FileUpload labelText="Foto do corretor" value={form.broker.photoUrl} onChange={(v) => setBroker("photoUrl", v)} previewFor="photo" />
        </div>
      </section>

      {saveError && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{saveError}</p>}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={saving}
          className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-700 disabled:opacity-60"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
          {saving ? "Salvando…" : "Salvar alterações"}
        </button>
        {saved && <span className="text-sm font-medium text-emerald-600">Perfil atualizado!</span>}
      </div>
    </form>
  );
}