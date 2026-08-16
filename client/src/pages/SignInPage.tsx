import { SignIn, SignUp } from "@clerk/react";
import { Wand2 } from "lucide-react";

type AuthScreenProps = {
  mode: "sign-in" | "sign-up";
};

/**
 * Full-screen auth gate. Clerk renders the form; everything around it is the
 * Scriptorium chrome so signing in feels like part of the studio.
 */
export function AuthScreen({ mode }: AuthScreenProps) {
  return (
    <div className="studio-shell flex min-h-screen flex-col items-center justify-center px-4 py-12 text-white">
      <div className="mb-8 flex flex-col items-center text-center">
        <div className="studio-mark mb-4 h-11 w-11">
          <Wand2 className="h-5 w-5" />
        </div>
        <h1 className="text-2xl font-semibold tracking-[-0.04em] sm:text-3xl">
          Scriptorium Design
        </h1>
        <p className="mt-2 max-w-sm text-sm leading-6 text-white/55">
          {mode === "sign-in"
            ? "Sign in to generate print-ready art pages and download your PDFs."
            : "Create an account to start generating print-ready art pages."}
        </p>
      </div>

      <div className="w-full max-w-md [&_.cl-rootBox]:w-full [&_.cl-card]:bg-transparent [&_.cl-card]:shadow-none">
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

      <p className="mt-8 text-[11px] tracking-[0.14em] text-white/30">
        LANE DIGITAL WORKS · SCRIPTORIUM DESIGN
      </p>
    </div>
  );
}

export default function SignInPage() {
  return <AuthScreen mode="sign-in" />;
}
