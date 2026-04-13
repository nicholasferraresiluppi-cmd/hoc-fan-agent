import { SignUp } from "@clerk/nextjs";

export default function SignUpPage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6">
      <div className="mb-8 text-center">
        <div className="text-5xl mb-4">🎭</div>
        <h1 className="text-2xl font-bold">HOC Fan Agent</h1>
        <p className="text-gray-400 mt-1">Crea il tuo account</p>
      </div>
      <SignUp afterSignUpUrl="/" />
    </div>
  );
}
