import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, BadgeCheck, Building, Building2, Home, Key, ShieldCheck, Zap } from "lucide-react";
import { listCities, listFeatured, listLatest } from "@/lib/public/repository";
import { SITE_NAME } from "@/lib/public/seo";
import { SiteHeader } from "@/components/portal/SiteHeader";
import { SiteFooter } from "@/components/portal/SiteFooter";
import { PropertyCard } from "@/components/portal/PropertyCard";
import { HeroSearchForm } from "@/components/portal/HeroSearchForm";

import { CATEGORY_SLUGS } from "@/lib/public/types";

export const revalidate = 300;

export const metadata: Metadata = {
  title: `${SITE_NAME} — Imóveis à venda e para aluguel`,
  description:
    "Encontre apartamentos, casas, terrenos e salas comerciais à venda e para aluguel em todo o Brasil. Imóveis anunciados por imobiliárias parceiras e corretores credenciados.",
};

async function getData() {
  const [featured, latest, cities] = await Promise.all([listFeatured(6), listLatest(6), listCities()]);
  return { featured, latest, cities };
}

export default async function LandingPage() {
  const { featured, latest, cities } = await getData();

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <SiteHeader />

      {/* Hero */}
      <section className="relative overflow-hidden border-b border-slate-100">
        {/* Semi-transparent backdrop — the portal bg image, dimmed for contrast. */}
        <div className="absolute inset-0">
          <Image
            src="/images/bg.jpg"
            alt=""
            fill
            priority
            sizes="100vw"
            className="object-cover"
          />
          <div className="absolute inset-0 bg-white/70" aria-hidden="true" />
        </div>

        <div className="relative mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:py-24">
          <div className="mx-auto max-w-3xl text-center">
            <Image
              src="/images/imobFlow_logo.png"
              alt="ImobFlow"
              width={160}
              height={160}
              priority
              className="mx-auto mb-6 h-36 w-36 object-contain drop-shadow-sm"
            />

            <span className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50/70 px-4 py-1.5 text-sm font-semibold text-emerald-700">
              ✨ Portal de Imóveis
            </span>

            <h1 className="mt-4 text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl">
              Encontre o imóvel dos seus sonhos
            </h1>
            <p className="mx-auto mt-4 max-w-2xl text-lg text-slate-600">
              {featured.length > 0
                ? `${featured.length} imóveis em destaque, anunciados por imobiliárias parceiras e corretores credenciados.`
                : "Apartamentos, casas, terrenos e salas comerciais à venda e para aluguel."}
            </p>

            <HeroSearchForm />

            <Link
              href="/imoveis"
              className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-brand-600 transition-colors hover:text-brand-700"
            >
              Explorar todos os imóveis
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>

          {/* Category shortcut cards */}
          <div className="mx-auto mt-12 grid max-w-4xl gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { icon: Building, label: "Apartamentos à venda", href: `/imoveis/venda/${CATEGORY_SLUGS.APARTMENT}` },
              { icon: Home, label: "Casas à venda", href: `/imoveis/venda/${CATEGORY_SLUGS.HOUSE}` },
              { icon: Key, label: "Apartamentos para alugar", href: `/imoveis/aluguel/${CATEGORY_SLUGS.APARTMENT}` },
              { icon: Key, label: "Casas para alugar", href: `/imoveis/aluguel/${CATEGORY_SLUGS.HOUSE}` },
            ].map((l) => (
              <Link
                key={l.label}
                href={l.href}
                className="group flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700 transition-all hover:-translate-y-0.5 hover:border-brand-300 hover:bg-brand-50 hover:shadow-md hover:text-brand-700"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600 transition-colors group-hover:bg-brand-100">
                  <l.icon className="h-5 w-5" />
                </span>
                {l.label}
                <ArrowRight className="ml-auto h-4 w-4 shrink-0 text-slate-400 transition-transform group-hover:translate-x-0.5" />
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Featured */}
      {featured.length > 0 && (
        <section className="mx-auto max-w-7xl px-4 py-14 sm:px-6">
          <div className="mb-6 flex items-end justify-between">
            <div>
              <h2 className="text-2xl font-bold tracking-tight text-navy-900">Imóveis em destaque</h2>
              <p className="mt-1 text-sm text-slate-500">Selecionados pelas imobiliárias parceiras.</p>
            </div>
            <Link href="/imoveis?featured=true" className="inline-flex items-center gap-1 text-sm font-semibold text-brand-600 hover:text-brand-700">
              Ver todos <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {featured.map((p, i) => (
              <PropertyCard key={p.id} property={p} priority={i < 3} />
            ))}
          </div>
        </section>
      )}

      {/* Cities */}
      {cities.length > 0 && (
        <section className="border-y border-slate-200 bg-white">
          <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6">
            <h2 className="mb-6 text-2xl font-bold tracking-tight text-navy-900">Explore por cidade</h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {cities.map((c) => (
                <Link
                  key={c.slug}
                  href={`/imoveis/${c.slug}`}
                  className="group flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-4 py-3.5 transition-colors hover:border-brand-300 hover:bg-brand-50"
                >
                  <div>
                    <span className="font-semibold text-slate-800 group-hover:text-brand-700">{c.city}</span>
                    <span className="ml-2 text-sm text-slate-500">· {c.state}</span>
                  </div>
                  <span className="text-sm text-slate-400">{c.listingCount} imóveis</span>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Latest */}
      {latest.length > 0 && (
        <section className="mx-auto max-w-7xl px-4 py-14 sm:px-6">
          <div className="mb-6 flex items-end justify-between">
            <div>
              <h2 className="text-2xl font-bold tracking-tight text-navy-900">Recém-chegados</h2>
              <p className="mt-1 text-sm text-slate-500">Os últimos imóveis publicados no portal.</p>
            </div>
            <Link href="/imoveis?sort=newest" className="inline-flex items-center gap-1 text-sm font-semibold text-brand-600 hover:text-brand-700">
              Ver todos <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {latest.map((p, i) => (
              <PropertyCard key={p.id} property={p} priority={i < 3} />
            ))}
          </div>
        </section>
      )}

      {/* Trust */}
      <section className="border-t border-slate-200 bg-white">
        <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6">
          <div className="grid gap-8 sm:grid-cols-3">
            {[
              { icon: ShieldCheck, title: "Imóveis verificados", desc: "Anúncios ativos de imobiliárias parceiras e corretores credenciados." },
              { icon: BadgeCheck, title: "Contato direto", desc: "Fale direto com o corretor responsável pelo anúncio." },
              { icon: Zap, title: "Agende sua visita", desc: "Envie sua solicitação e receba o retorno rapidamente." },
            ].map((f) => (
              <div key={f.title} className="text-center sm:text-left">
                <f.icon className="mx-auto h-8 w-8 text-brand-600 sm:mx-0" />
                <h3 className="mt-3 font-semibold text-slate-900">{f.title}</h3>
                <p className="mt-1 text-sm text-slate-500">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}