import { Suspense } from "react";
import LoginForm from "@/components/LoginForm";

export const metadata = { title: "Entrar | imobFlow" };

/**
 * Split B2B login: clean form (logo, "Acesse sua conta", inputs com ícones,
 * botão full-width + atalhos de demonstração) à esquerda; painel visual com
 * gradiente emerald/slate e frase de valor à direita (oculto em mobile).
 */
export default function LoginPage() {
  return (
    <div className="grid min-h-screen bg-slate-50 text-slate-900 lg:grid-cols-2">
      {/* Lado esquerdo — formulário */}
      <div className="flex flex-col justify-center px-6 py-12 sm:px-12 lg:px-16">
        <div className="mx-auto w-full max-w-md">
          <div className="mb-10 flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/images/imobFlow_logo.png" alt="imobFlow" className="h-10 w-10 object-contain" />
            <span className="text-xl font-bold tracking-tight text-slate-900">imobFlow</span>
          </div>

          <h1 className="text-3xl font-bold tracking-tight text-slate-900">Acesse sua conta</h1>
          <p className="mt-2 text-sm text-slate-500">
            Entre para gerenciar seus imóveis, leads, finanças e métricas.
          </p>

          <div className="mt-8">
            <Suspense fallback={null}>
              <LoginForm />
            </Suspense>
          </div>
        </div>
      </div>

      {/* Lado direito — painel visual */}
      <div className="relative hidden overflow-hidden bg-gradient-to-br from-emerald-600 via-teal-700 to-slate-900 text-white lg:block">
        {/* Estampa sutil da marca */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/images/imobFlow_logo.png"
          alt=""
          aria-hidden="true"
          className="pointer-events-none absolute -right-24 -top-24 h-[26rem] w-[26rem] object-contain opacity-[0.12]"
        />

        <div className="relative z-10 flex h-full flex-col justify-between p-12">
          <div className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/images/imobFlow_logo.png" alt="" aria-hidden="true" className="h-8 w-8 object-contain" />
            <span className="text-lg font-bold tracking-tight">imobFlow</span>
          </div>

          <div>
            <p className="max-w-md text-2xl font-semibold leading-snug">
              “A plataforma que conecta imobiliárias e corretores a novos negócios.”
            </p>
            <p className="mt-5 text-sm leading-relaxed text-emerald-100/90">
              Portal público de imóveis · SaaS por assinatura · geração e
              qualificação de leads, inclusive crédito imobiliário.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
