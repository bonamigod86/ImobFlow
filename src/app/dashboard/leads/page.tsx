import { getServerSession } from "@/lib/auth/session";
import { redirect } from "next/navigation";
import LeadsTable from "@/components/dashboard/LeadsTable";

export const metadata = { title: "Leads recebidos | imobFlow" };

export default async function LeadsPage() {
  const session = await getServerSession();
  if (!session) redirect("/login");
  if (!session.tenantId) redirect("/dashboard");

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
      <LeadsTable defaultMineOnly={session.role === "AGENT"} />
    </main>
  );
}