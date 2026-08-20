import { Suspense } from "react";
import LoginForm from "@/components/LoginForm";

export default function LoginPage() {
  return (
    <main>
      <div className="card">
        <h1>Sign in</h1>
        <p className="muted">
          Use the seeded demo accounts — e.g. <code>owner@acme.com</code> /
          <code> agent@acme.com</code>. Append ?tenant=acme to scope the login.
        </p>
        <Suspense fallback={null}>
          <LoginForm />
        </Suspense>
      </div>
    </main>
  );
}