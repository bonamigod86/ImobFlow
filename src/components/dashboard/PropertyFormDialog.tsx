"use client";

import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { Images, Loader2, Plus, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import type { PropertyRow } from "@/components/dashboard/types";
import { CATEGORY_LABELS } from "@/lib/public/types";
import { MediaManagerDialog } from "@/components/dashboard/MediaManagerDialog";
import { STATUS_LABELS, TARGET_LABELS } from "@/components/dashboard/format";
import type { PropertyAction } from "@/components/dashboard/PropertyDialogs";

const TARGET_OPTIONS = ["SALE", "RENT", "BOTH"] as const;
const STATUS_OPTIONS = ["ACTIVE", "INACTIVE", "SOLD", "RENTED"] as const;
const CATEGORY_OPTIONS = Object.keys(CATEGORY_LABELS) as Array<keyof typeof CATEGORY_LABELS>;

type FormState = {
  code: string;
  externalCode: string;
  title: string;
  description: string;
  address: string;
  number: string;
  city: string;
  state: string;
  neighborhood: string;
  zipCode: string;
  latitude: string;
  longitude: string;
  target: (typeof TARGET_OPTIONS)[number];
  category: keyof typeof CATEGORY_LABELS;
  status: (typeof STATUS_OPTIONS)[number];
  salePrice: string;
  rentPrice: string;
  condoFee: string;
  propertyTax: string;
  area: string;
  bedrooms: string;
  suites: string;
  bathrooms: string;
  parkingSpots: string;
  isActive: boolean;
  isFeatured: boolean;
  isFurnished: boolean;
};

const EMPTY_FORM: FormState = {
  code: "",
  externalCode: "",
  title: "",
  description: "",
  address: "",
  number: "",
  city: "",
  state: "",
  neighborhood: "",
  zipCode: "",
  latitude: "",
  longitude: "",
  target: "SALE",
  category: "APARTMENT",
  status: "ACTIVE",
  salePrice: "",
  rentPrice: "",
  condoFee: "",
  propertyTax: "",
  area: "",
  bedrooms: "",
  suites: "",
  bathrooms: "",
  parkingSpots: "",
  isActive: true,
  isFeatured: false,
  isFurnished: false,
};

function toNumberOrNull(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === "") return null;
  const parsed = Number(trimmed.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

function toIntOrNull(value: string): number | null {
  const parsed = toNumberOrNull(value);
  if (parsed === null) return null;
  return Number.isInteger(parsed) ? parsed : Math.trunc(parsed);
}

export function FormDialog({
  action,
  onClose,
  onSaved,
}: {
  action: PropertyAction | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const editing = action?.kind === "edit" ? action.property : null;
  const creating = action?.kind === "new";
  const open = !!editing || creating;

  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Target for the gallery (set on create success or via the edit shortcut).
  const [mediaFor, setMediaFor] = useState<{ id: string; title: string } | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setBusy(false);
    setMediaFor(null);
    if (editing) {
      setForm({
        code: editing.code,
        externalCode: editing.externalCode ?? "",
        title: editing.title,
        description: editing.description ?? "",
        address: editing.address ?? "",
        number: editing.number ?? "",
        city: editing.city,
        state: editing.state,
        neighborhood: editing.neighborhood ?? "",
        zipCode: editing.zipCode ?? "",
        latitude: editing.latitude != null ? String(editing.latitude) : "",
        longitude: editing.longitude != null ? String(editing.longitude) : "",
        target: editing.target,
        category: (editing.category as keyof typeof CATEGORY_LABELS) ?? "APARTMENT",
        status: editing.status,
        salePrice: editing.salePrice ?? "",
        rentPrice: editing.rentPrice ?? "",
        condoFee: editing.condoFee ?? "",
        propertyTax: editing.propertyTax ?? "",
        area: editing.area ?? "",
        bedrooms: editing.bedrooms != null ? String(editing.bedrooms) : "",
        suites: editing.suites != null ? String(editing.suites) : "",
        bathrooms: editing.bathrooms != null ? String(editing.bathrooms) : "",
        parkingSpots: editing.parkingSpots != null ? String(editing.parkingSpots) : "",
        isActive: editing.isActive,
        isFeatured: editing.isFeatured,
        isFurnished: editing.isFurnished ?? false,
      });
    } else {
      setForm(EMPTY_FORM);
    }
  }, [open, editing]);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit() {
    setError(null);
    if (form.code.trim() === "" || form.title.trim() === "" || form.city.trim() === "" || form.state.trim() === "") {
      setError("Preencha código, título, cidade e UF (ex.: SP).");
      return;
    }
    if (!/^[a-zA-Z]{2}$/.test(form.state.trim())) {
      setError("A UF deve ter duas letras (ex.: SP, RJ).");
      return;
    }
    const salePrice = toNumberOrNull(form.salePrice);
    const rentPrice = toNumberOrNull(form.rentPrice);
    if (salePrice === null && rentPrice === null) {
      setError("Informe ao menos um preço (venda ou aluguel).");
      return;
    }

    const payload = {
      code: form.code.trim(),
      externalCode: form.externalCode.trim() || null,
      title: form.title.trim(),
      description: form.description.trim() || null,
      address: form.address.trim() || null,
      number: form.number.trim() || null,
      city: form.city.trim(),
      state: form.state.trim().toUpperCase(),
      neighborhood: form.neighborhood.trim() || null,
      zipCode: form.zipCode.trim() || null,
      latitude: toNumberOrNull(form.latitude),
      longitude: toNumberOrNull(form.longitude),
      target: form.target,
      category: form.category,
      status: form.status,
      salePrice,
      rentPrice,
      condoFee: toNumberOrNull(form.condoFee),
      propertyTax: toNumberOrNull(form.propertyTax),
      area: toNumberOrNull(form.area),
      bedrooms: toIntOrNull(form.bedrooms),
      suites: toIntOrNull(form.suites),
      bathrooms: toIntOrNull(form.bathrooms),
      parkingSpots: toIntOrNull(form.parkingSpots),
      isActive: form.isActive,
      isFeatured: form.isFeatured,
      isFurnished: form.isFurnished,
    };

    setBusy(true);
    try {
      const res = await fetch(editing ? `/api/properties/${editing.id}` : `/api/properties`, {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.message ?? (editing ? "Falha ao salvar o imóvel." : "Falha ao criar o imóvel."));
      onSaved();
      onClose();

      // Cadastro: logo após criar, abre o gerenciador de fotos para subir a
      // imagem principal e as demais fotos do imóvel recém-criado.
      if (!editing && body.property?.id) {
        setMediaFor({ id: body.property.id as string, title: (body.property.title as string) ?? form.title });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao salvar o imóvel.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !busy) onClose();
      }}
    >
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {creating ? <Plus className="h-4 w-4 text-brand-400" /> : <Save className="h-4 w-4 text-brand-400" />}
            {creating ? "Novo imóvel" : "Editar imóvel"}
          </DialogTitle>
          <DialogDescription>
            {creating
              ? "Cadastre um novo imóvel no portfólio deste tenant."
              : `Atualize os dados de ${editing?.title ?? ""}.`}
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Código" hint="referência interna">
            <Input
              value={form.code}
              onChange={(e) => update("code", e.target.value)}
              placeholder="APT-001"
              maxLength={40}
            />
          </Field>
          <Field label="Código externo" hint="opcional">
            <Input
              value={form.externalCode}
              onChange={(e) => update("externalCode", e.target.value)}
              placeholder="Ref. portais/construtora"
              maxLength={120}
            />
          </Field>
          <Field label="Título">
            <Input
              value={form.title}
              onChange={(e) => update("title", e.target.value)}
              placeholder="Apartamento no Jardins"
              maxLength={255}
            />
          </Field>
          <Field label="Situação">
            <Select value={form.status} onChange={(e) => update("status", e.target.value as FormState["status"])}>
              {STATUS_OPTIONS.map((key) => (
                <option key={key} value={key}>
                  {STATUS_LABELS[key]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Endereço">
            <Input
              value={form.address}
              onChange={(e) => update("address", e.target.value)}
              placeholder="Av. Paulista"
              maxLength={255}
            />
          </Field>
          <Field label="Número">
            <Input
              value={form.number}
              onChange={(e) => update("number", e.target.value)}
              placeholder="1200"
              maxLength={20}
            />
          </Field>
          <Field label="CEP">
            <Input
              value={form.zipCode}
              onChange={(e) => update("zipCode", e.target.value)}
              placeholder="01310-100"
              maxLength={12}
            />
          </Field>
          <Field label="Bairro">
            <Input
              value={form.neighborhood}
              onChange={(e) => update("neighborhood", e.target.value)}
              placeholder="Jardins"
            />
          </Field>
          <Field label="Cidade">
            <Input value={form.city} onChange={(e) => update("city", e.target.value)} placeholder="São Paulo" />
          </Field>
          <Field label="UF (ex.: SP)">
            <Input
              value={form.state}
              onChange={(e) => update("state", e.target.value.toUpperCase())}
              placeholder="SP"
              maxLength={2}
            />
          </Field>
          <Field label="Latitude" hint="opcional">
            <Input
              inputMode="decimal"
              value={form.latitude}
              onChange={(e) => update("latitude", e.target.value)}
              placeholder="-23.5614"
            />
          </Field>
          <Field label="Longitude" hint="opcional">
            <Input
              inputMode="decimal"
              value={form.longitude}
              onChange={(e) => update("longitude", e.target.value)}
              placeholder="-46.6559"
            />
          </Field>
          <Field label="Área (m²)">
            <Input
              inputMode="decimal"
              value={form.area}
              onChange={(e) => update("area", e.target.value)}
              placeholder="120"
            />
          </Field>
          <Field label="Dormitórios">
            <Input
              inputMode="numeric"
              value={form.bedrooms}
              onChange={(e) => update("bedrooms", e.target.value)}
              placeholder="3"
            />
          </Field>
          <Field label="Suítes">
            <Input
              inputMode="numeric"
              value={form.suites}
              onChange={(e) => update("suites", e.target.value)}
              placeholder="2"
            />
          </Field>
          <Field label="Banheiros">
            <Input
              inputMode="numeric"
              value={form.bathrooms}
              onChange={(e) => update("bathrooms", e.target.value)}
              placeholder="2"
            />
          </Field>
          <Field label="Vagas de garagem">
            <Input
              inputMode="numeric"
              value={form.parkingSpots}
              onChange={(e) => update("parkingSpots", e.target.value)}
              placeholder="2"
            />
          </Field>
          <Field label="Finalidade">
            <Select value={form.target} onChange={(e) => update("target", e.target.value as FormState["target"])}>
              {TARGET_OPTIONS.map((key) => (
                <option key={key} value={key}>
                  {TARGET_LABELS[key]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Categoria">
            <Select value={form.category} onChange={(e) => update("category", e.target.value as FormState["category"])}>
              {CATEGORY_OPTIONS.map((key) => (
                <option key={key} value={key}>
                  {CATEGORY_LABELS[key]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Preço de venda (R$)">
            <Input
              inputMode="decimal"
              value={form.salePrice}
              onChange={(e) => update("salePrice", e.target.value)}
              placeholder="750000"
            />
          </Field>
          <Field label="Preço de aluguel (R$/mês)">
            <Input
              inputMode="decimal"
              value={form.rentPrice}
              onChange={(e) => update("rentPrice", e.target.value)}
              placeholder="4500"
            />
          </Field>
          <Field label="Condomínio (R$/mês)">
            <Input
              inputMode="decimal"
              value={form.condoFee}
              onChange={(e) => update("condoFee", e.target.value)}
              placeholder="900"
            />
          </Field>
          <Field label="IPTU (R$/ano)">
            <Input
              inputMode="decimal"
              value={form.propertyTax}
              onChange={(e) => update("propertyTax", e.target.value)}
              placeholder="3600"
            />
          </Field>
          <Field label="Descrição" className="sm:col-span-2">
            <textarea
              value={form.description}
              onChange={(e) => update("description", e.target.value)}
              rows={3}
              className="flex w-full rounded-md border border-ink-700 bg-ink-950/60 px-3 py-2 text-sm text-ink-100 placeholder:text-ink-500 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand-500/60"
              maxLength={5000}
            />
          </Field>
          <div className="flex flex-wrap items-center gap-4 sm:col-span-2">
            <label className="flex cursor-pointer items-center gap-2 text-sm text-ink-200">
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={(e) => update("isActive", e.target.checked)}
                className="h-4 w-4 rounded border-ink-700 bg-ink-950 accent-brand-500"
              />
              Publicado no portal
            </label>
            <label className="flex cursor-pointer items-center gap-2 text-sm text-ink-200">
              <input
                type="checkbox"
                checked={form.isFeatured}
                onChange={(e) => update("isFeatured", e.target.checked)}
                className="h-4 w-4 rounded border-ink-700 bg-ink-950 accent-brand-500"
              />
              Destaque
            </label>
            <label className="flex cursor-pointer items-center gap-2 text-sm text-ink-200">
              <input
                type="checkbox"
                checked={form.isFurnished}
                onChange={(e) => update("isFurnished", e.target.checked)}
                className="h-4 w-4 rounded border-ink-700 bg-ink-950 accent-brand-500"
              />
              Mobiliado
            </label>
          </div>
        </div>

        {error && (
          <p className="flex items-center gap-2 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
            {error}
          </p>
        )}

        <DialogFooter className="gap-2">
          {editing && (
            <Button
              variant="outline"
              size="sm"
              className="mr-auto"
              onClick={() => setMediaFor({ id: editing.id, title: editing.title })}
            >
              <Images className="h-4 w-4" />
              Fotos do imóvel
            </Button>
          )}
          <Button variant="secondary" size="sm" onClick={onClose} disabled={busy}>
            Cancelar
          </Button>
          <Button size="sm" onClick={() => void handleSubmit()} disabled={busy} className="min-w-28">
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {editing ? "Salvar alterações" : "Criar imóvel"}
          </Button>
        </DialogFooter>
        </DialogContent>
    </Dialog>

      <MediaManagerDialog
        property={mediaFor ? (mediaFor as unknown as PropertyRow) : null}
        onClose={() => setMediaFor(null)}
        onChanged={onSaved}
      />
    </>
  );
}

function Field({
  label,
  hint,
  className,
  children,
}: {
  label: string;
  hint?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={className}>
      <Label className="mb-1.5 flex items-baseline justify-between">
        {label}
        {hint && <Badge variant="outline" className="ml-2 text-[0.65rem] normal-case">{hint}</Badge>}
      </Label>
      {children}
    </div>
  );
}