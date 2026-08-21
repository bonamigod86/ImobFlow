import Link from "next/link";
import Image from "next/image";
import { Heart, Search } from "lucide-react";
import { SITE_NAME } from "@/lib/public/seo";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-slate-100 bg-white/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2 text-slate-900">
          <span className="flex h-9 w-9 items-center justify-center overflow-hidden">
            <Image
              src="/images/imobFlow_logo.png"
              alt={SITE_NAME}
              width={36}
              height={36}
              className="h-9 w-9 object-contain"
            />
          </span>
          <span className="text-lg font-semibold tracking-tight">{SITE_NAME}</span>
        </Link>

        <nav className="hidden items-center gap-6 text-sm font-medium text-slate-600 md:flex">
          <Link href="/imoveis/venda" className="transition-colors hover:text-navy-700">
            Comprar
          </Link>
          <Link href="/imoveis/aluguel" className="transition-colors hover:text-navy-700">
            Alugar
          </Link>
        </nav>

        <div className="flex items-center gap-2">
          <Link
            href="/favoritos"
            className="inline-flex items-center gap-2 rounded-lg bg-slate-100 px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-200"
            aria-label="Meus favoritos"
          >
            <Heart className="h-4 w-4" />
            <span className="hidden sm:inline">Favoritos</span>
          </Link>
          <Link
            href="/imoveis"
            className="inline-flex items-center gap-2 rounded-lg bg-slate-100 px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-200"
            aria-label="Buscar imóveis"
          >
            <Search className="h-4 w-4" />
            <span className="hidden sm:inline">Buscar</span>
          </Link>
          <Link
            href="/register"
            className="inline-flex items-center rounded-lg px-3.5 py-2 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-800"
          >
            Criar conta
          </Link>
          <Link
            href="/login"
            className="inline-flex items-center rounded-lg bg-brand-600 px-3.5 py-2 text-sm font-semibold text-white shadow-sm transition-all hover:-translate-y-0.5 hover:bg-brand-700 hover:shadow-md"
          >
            Entrar
          </Link>
        </div>
      </div>
    </header>
  );
}