import { SignIn } from "@clerk/nextjs";
import BrandLockup from "@/components/BrandLockup";

export default function SignInPage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6">
      <div className="mb-8 text-center">
        <div className="mb-5 flex justify-center"><BrandLockup size="lg" /></div>
        <p className="text-gray-400 mt-1">Accedi per iniziare</p>
      </div>
      <SignIn afterSignInUrl="/" />
    </div>
  );
}
