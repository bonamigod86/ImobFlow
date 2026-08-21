import type { Metadata } from "next";
import { headers } from "next/headers";
import { TenantProvider, type TenantMeta } from "@/lib/tenant/tenant-client-context";
import "./globals.css";

export const metadata: Metadata = {
  title: "imobFlow",
  description: "Plataforma imobiliária multi-tenant — portal público, SaaS por assinatura e geração de leads.",
  icons: {
    icon: "/images/imobFlow_logo.png",
    apple: "/images/imobFlow_logo.png",
  },
};

/**
 * Root layout — injects the server-resolved tenant meta (slug, role) into the
 * client side so UI components can branch on tenant context without API calls.
 */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  const h = headers();
  const tenantMeta: TenantMeta = {
    slug: h.get("x-tenant-slug") ?? null,
    role: h.get("x-user-role") ?? null,
  };

  return (
    <html lang="en">
      <body>
        <TenantProvider meta={tenantMeta}>{children}</TenantProvider>
      </body>
    </html>
  );
}