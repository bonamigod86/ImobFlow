import { Suspense } from "react";
import { SiteHeader } from "@/components/portal/SiteHeader";
import { SiteFooter } from "@/components/portal/SiteFooter";
import { RegisterForm } from "@/components/portal/RegisterForm";

export const metadata = {
  title: "Criar conta | imobFlow",
  description: "Cadastre sua imobiliária ou perfil de corretor autônomo.",
};

export default function RegisterPage() {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
        <header className="mb-8 text-center">
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">Crie sua conta</h1>
          <p className="mt-2 text-slate-500">
            Imobiliária ou corretor autônomo — ambiente próprio, separado e seguro por assinante.
          </p>
        </header>
        <Suspense fallback={null}>
          <RegisterForm />
        </Suspense>
      </main>
      <SiteFooter />
    </div>
  );
}