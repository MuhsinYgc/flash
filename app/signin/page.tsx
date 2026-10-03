import { Suspense } from "react";
import { SignInForm } from "./sign-in-form";

export default function SignInPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-full flex-1 items-center justify-center text-sm text-foreground/70">
          Loading…
        </main>
      }
    >
      <SignInForm />
    </Suspense>
  );
}
