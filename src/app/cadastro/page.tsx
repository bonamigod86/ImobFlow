import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, BadgeCheck, Building2, LineChart, MessagesSquare, ShieldCheck, Sparkles, Users } from "lucide-react";
import { SiteHeader } from "@/components/portal/SiteHeader";
import { SiteFooter } from "@/components/portal/SiteFooter";
import { prismaUnscoped } from "@/lib/prisma/client";
import { formatCentsBRL } from "@/lib/money";

export const metadata: Metadata = {
  title: "Cadastro de imobiliárias e corretores | imobFlow",
  description:
    "Crie a conta da sua imobiliária ou corretor autônomo na imobFlow: anuncie imóveis, receba e qualifique leads, capture interessados em crédito imobiliário e integre com seus sistemas — com planos que cabem no seu negócio.",
  alternates: { canonical: "/cadastro" },
  openGraph: {
    title: "Cadastro de imobiliárias e corretores | imobFlow",
    description: "Portal público, SaaS por assinatura e geração de leads para imobiliárias e corretores autônomos.",
    type: "website",
  },
};

const VANTAGENS = [
  { icon: Building2, title: "Anuncie seus imóveis", desc: "Portal público com busca avançada, destaque, galeria e SEO — seus anúncios alcançam quem procura." },
  { icon: MessagesSquare, title: "Receba e qualifique leads", desc: "Formulários de interesse, WhatsApp e agendamento de visitas com funil de qualificação." },
  { icon: LineChart, title: "Crédito imobiliário", desc: "Capture interessados em financiamento e encaminhe a sistemas externos quando autorizado (LGPD)." },
  { icon: Users, title: "Equipe e permissões", desc: "Proprietário, gerente, corretores e atendentes com controle de acesso por papel." },
  { icon: ShieldCheck, title: "Seguro e LGPD", desc: "Consentimento registrado, isolamento entre contas e rastreio dos dados enviados a sistemas externos." },
  { icon: Sparkles, title: "Destaques e monetização", desc: "Destaque imóveis com créditos do plano ou compra avulsa e acompanhe o resultado." },
];

export default async function CadastroPage() {
  const plans = await prismaUnscoped.plan.findMany({
    where: { isActive: true },
    orderBy: { priceCents: "asc" },
    select: { name: true, description: true, priceCents: true, billingCycle: true, maxProperties: true, maxUsers: true, maxLeads: true, highlightCredits: true, trialDays: true },
  });

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <SiteHeader />

      {/* Hero */}
      <section className="relative overflow-hidden bg-gradient-to-br from-emerald-600 via-teal-700 to-slate-900 text-white">
        <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:py-28">
          <div className="mx-auto max-w-3xl text-center">
            <span className="inline-flex items-center rounded-full border border-emerald-300/30 bg-white/10 px-3.5 py-1.5 text-xs font-semibold text-emerald-100 backdrop-blur-sm">
              Para imobiliárias e corretores autônomos
            </span>
            <h1 className="mt-5 text-4xl font-bold tracking-tight sm:text-5xl">
              Sua imobiliária ou corretoria digital em um só lugar
            </h1>
            <p className="mx-auto mt-5 max-w-2xl text-lg text-emerald-50/90">
              Anuncie imóveis, receba e qualifique leads — inclusive de crédito
              imobiliário — e integre com seus sistemas. Portal público, SaaS por
              assinatura e geração de leads em uma única plataforma.
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <Link
                href="/register"
                className="inline-flex items-center gap-2 rounded-xl bg-white px-7 py-3.5 text-base font-semibold text-emerald-700 shadow-lg transition-colors hover:bg-emerald-50"
              >
                Criar minha conta grátis
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href="/imoveis"
                className="inline-flex items-center gap-2 rounded-xl border border-white/30 bg-white/10 px-7 py-3.5 text-base font-semibold text-white backdrop-blur-sm transition-colors hover:bg-white/20"
              >
                Ver anúncios
              </Link>
            </div>
            <p className="mt-4 text-sm text-emerald-100/80">
              Comece com trial e sem cartão de crédito. Planos a partir de {plans.length > 0 && plans[0]?.priceCents === 0 ? "grátis" : ""}.
            </p>
          </div>
        </div>
      </section>

      {/* Planos */}
      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight text-slate-900">Planos que crescem com você</h2>
          <p className="mt-3 text-slate-600">
            Escolha o plano ideal e troque quando quiser — definidos pela plataforma e sem burocracia.
          </p>
        </div>
        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {plans.map((plan) => (
            <div key={plan.name} className="flex flex-col rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm">
              <h3 className="text-lg font-bold text-slate-900">{plan.name}</h3>
              {plan.description && <p className="mt-1 text-sm text-slate-500">{plan.description}</p>}
              <div className="mt-4 flex items-baseline gap-1">
                <span className="text-3xl font-extrabold text-slate-900">
                  {plan.priceCents > 0 ? formatCentsBRL(plan.priceCents) : "Grátis"}
                </span>
                {plan.priceCents > 0 && (
                  <span className="text-sm text-slate-500">/{plan.billingCycle === "YEARLY" ? "ano" : "mês"}</span>
                )}
              </div>
              <ul className="mt-5 space-y-2 text-sm text-slate-600">
                <Benefit text={plan.maxProperties === null ? "Imóveis ilimitados" : `Até ${plan.maxProperties} imóveis`} />
                <Benefit text={plan.maxUsers === null ? "Usuários ilimitados" : `Até ${plan.maxUsers} usuários`} />
                <Benefit text={plan.maxLeads === null ? "Leads ilimitados" : `Até ${plan.maxLeads} leads/mês`} />
                <Benefit text={`${plan.highlightCredits} créditos de destaque/mês`} />
                <Benefit text={`${plan.trialDays} dias de trial`} />
              </ul>
              <Link
                href="/register"
                className="mt-6 inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-emerald-700"
              >
                Começar com {plan.name}
              </Link>
            </div>
          ))}
        </div>
      </section>

      {/* Vantagens */}
      <section className="border-y border-slate-200 bg-white">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-bold tracking-tight text-slate-900">Tudo para crescer suas vendas</h2>
            <p className="mt-3 text-slate-600">Ferramentas que imobiliárias e corretores usam todos os dias.</p>
          </div>
          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {VANTAGENS.map((v) => (
              <div key={v.title} className="rounded-2xl border border-slate-200/80 bg-slate-50 p-6">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700">
                  <v.icon className="h-5 w-5" />
                </span>
                <h3 className="mt-4 text-lg font-bold text-slate-900">{v.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-slate-600">{v.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Como funciona + CTA */}
      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight text-slate-900">Como funciona</h2>
          <p className="mt-3 text-slate-600">
            Em poucos passos sua imobiliária ou corretoria está no ar com anúncios e captação de leads.
          </p>
        </div>
        <div className="mt-10 grid gap-5 sm:grid-cols-3">
          {[
            { n: "1", t: "Crie sua conta", d: "Cadastre sua imobiliária ou perfil de corretor autônomo em menos de 2 minutos." },
            { n: "2", t: "Cadastre imóveis", d: "Adicione ou importe seus imóveis com fotos, preços e localização." },
            { n: "3", t: "Receba e qualifique", d: "Leads, WhatsApp, visitas e crédito imobiliário chegando no seu painel." },
          ].map((s) => (
            <div key={s.n} className="rounded-2xl border border-slate-200/80 bg-white p-6 text-center">
              <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-600 text-lg font-bold text-white">
                {s.n}
              </span>
              <h3 className="mt-4 text-lg font-bold text-slate-900">{s.t}</h3>
              <p className="mt-1.5 text-sm text-slate-600">{s.d}</p>
            </div>
          ))}
        </div>

        <div className="mt-14 rounded-2xl bg-gradient-to-br from-emerald-600 via-teal-700 to-slate-900 p-10 text-center text-white">
          <BadgeCheck className="mx-auto h-10 w-10 text-emerald-200" />
          <h2 className="mt-4 text-2xl font-bold tracking-tight">Pronto para anunciar e vender mais?</h2>
          <p className="mx-auto mt-2 max-w-xl text-emerald-50/90">
            Junte-se às imobiliárias e corretores que já usam a imobFlow para crescer com leads qualificados.
          </p>
          <Link
            href="/register"
            className="mt-6 inline-flex items-center gap-2 rounded-xl bg-white px-8 py-3.5 text-base font-semibold text-emerald-700 shadow-lg transition-colors hover:bg-emerald-50"
          >
            Criar conta agora
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}

function Benefit({ text }: { text: string }) {
  return (
    <li className="flex items-center gap-2">
      <BadgeCheck className="h-4 w-4 shrink-0 text-emerald-600" />
      {text}
    </li>
  );
}
