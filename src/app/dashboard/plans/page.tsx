import { getServerSession } from "@/lib/auth/session";
import { redirect } from "next/navigation";
import PlanCards from "@/components/billing/PlanCards";

export const metadata = { title: "Planos e assinatura | imobFlow" };

export default async function PlansPage() {
  const session = await getServerSession();
  if (!session) redirect("/login");
  if (!session.tenantId) redirect("/dashboard");

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
      <PlanCards />
    </main>
  );
}