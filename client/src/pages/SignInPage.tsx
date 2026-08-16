import { SignIn, SignUp } from "@clerk/react";

type AuthScreenProps = {
  mode: "sign-in" | "sign-up";
};

/**
 * Full-screen auth gate. Clerk renders the form as the sole element.
 * No redundant headers — Clerk's own title handles the branding.
 */
export function AuthScreen({ mode }: AuthScreenProps) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0a0a0a] px-4">
      <div className="w-full max-w-sm">
        {mode === "sign-in" ? (
          <SignIn
            signUpUrl="/sign-up"
            forceRedirectUrl="/"
          />
        ) : (
          <SignUp
            signInUrl="/sign-in"
            forceRedirectUrl="/"
          />
        )}
      </div>
    </div>
  );
}

export default function SignInPage() {
  return <AuthScreen mode="sign-in" />;
}
