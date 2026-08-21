import { getServerSession } from "@/lib/auth/session";
import { redirect } from "next/navigation";
import TeamUsersConsole from "@/components/dashboard/TeamUsersConsole";

export const metadata = { title: "Usuários e permissões | imobFlow" };

export default async function TeamPage() {
  const session = await getServerSession();
  if (!session) redirect("/login");
  if (!session.tenantId) redirect("/dashboard");

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6">
      <TeamUsersConsole />
    </main>
  );
}