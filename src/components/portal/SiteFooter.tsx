import Link from "next/link";
import { Building2 } from "lucide-react";
import { SITE_NAME } from "@/lib/public/seo";

export function SiteFooter() {
  return (
    <footer className="border-t border-slate-200 bg-white">
      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-12 sm:px-6 md:grid-cols-3">
        <div>
          <div className="flex items-center gap-2 text-slate-900">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-600 text-white">
              <Building2 className="h-4 w-4" />
            </span>
            <span className="font-semibold">{SITE_NAME}</span>
          </div>
          <p className="mt-3 max-w-xs text-sm text-slate-500">
            Imóveis à venda e para alugar anunciados por imobiliárias parceiras e corretores credenciados.
          </p>
        </div>

        <nav aria-label="Navegação" className="text-sm">
          <h3 className="mb-3 font-semibold text-slate-900">Explorar</h3>
          <ul className="space-y-2 text-slate-600">
            <li>
              <Link href="/imoveis" className="hover:text-emerald-600">Todos os imóveis</Link>
            </li>
            <li>
              <Link href="/imoveis/venda" className="hover:text-emerald-600">À venda</Link>
            </li>
            <li>
              <Link href="/imoveis/aluguel" className="hover:text-emerald-600">Para alugar</Link>
            </li>
          </ul>
        </nav>

        <nav aria-label="Legal" className="text-sm">
          <h3 className="mb-3 font-semibold text-slate-900">Institucional</h3>
          <ul className="space-y-2 text-slate-600">
            <li>
              <Link href="/login" className="hover:text-emerald-600">Portal do corretor</Link>
            </li>
            <li>
              <Link href="/cadastro" className="hover:text-emerald-600">Cadastre sua imobiliária ou corretor</Link>
            </li>
          </ul>
        </nav>
      </div>

      <div className="border-t border-slate-100 py-4 text-center text-xs text-slate-400">
        © {new Date().getFullYear()} {SITE_NAME}. Todos os direitos reservados.
      </div>
    </footer>
  );
}