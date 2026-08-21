import { getServerSession } from "@/lib/auth/session";
import { redirect } from "next/navigation";
import { TenantProfileForm } from "@/components/dashboard/TenantProfileForm";

export const metadata = { title: "Perfil da conta | imobFlow" };

export default async function ProfilePage() {
  const session = await getServerSession();
  if (!session) redirect("/login");
  if (!session.tenantId) redirect("/dashboard"); // MASTER has no tenant profile

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-ink-50">Perfil da conta</h1>
        <p className="mt-1 text-sm text-ink-400">
          Cadastro da imobiliária/corretor, contatos, logo, foto e redes sociais.
        </p>
      </header>
      <TenantProfileForm />
    </main>
  );
}