import { SignIn } from "@clerk/nextjs";
import AuthShell, { AUTH_APPEARANCE } from "@/components/AuthShell";

export default function SignInPage() {
  return (
    <AuthShell>
      <SignIn fallbackRedirectUrl="/start" signUpFallbackRedirectUrl="/start" appearance={AUTH_APPEARANCE} />
    </AuthShell>
  );
}
