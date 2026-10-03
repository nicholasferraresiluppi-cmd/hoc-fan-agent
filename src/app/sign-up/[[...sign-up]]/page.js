import { SignUp } from "@clerk/nextjs";
import AuthShell, { AUTH_APPEARANCE } from "@/components/AuthShell";

export default function SignUpPage() {
  return (
    <AuthShell>
      <SignUp fallbackRedirectUrl="/start" signInFallbackRedirectUrl="/start" appearance={AUTH_APPEARANCE} />
    </AuthShell>
  );
}
