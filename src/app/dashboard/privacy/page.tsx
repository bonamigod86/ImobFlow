import { getServerSession } from "@/lib/auth/session";
import { redirect } from "next/navigation";
import PrivacyConsole from "@/components/dashboard/PrivacyConsole";

export const metadata = { title: "Privacidade · LGPD | SaaS Imob" };

export default async function PrivacyPage() {
  const session = await getServerSession();
  if (!session) redirect("/login");
  if (!session.tenantId) redirect("/dashboard");

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6">
      <PrivacyConsole />
    </main>
  );
}