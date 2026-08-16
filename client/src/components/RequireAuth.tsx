import { ClerkLoaded, ClerkLoading, Show } from "@clerk/react";
import { Loader2 } from "lucide-react";
import type { ReactNode } from "react";
import { AuthScreen } from "@/pages/SignInPage";

/**
 * Gate for authenticated areas of the studio.
 *
 * Anonymous visitors get the in-page sign-in screen instead of a redirect, so a
 * deep link keeps its URL and lands on the intended page right after sign-in.
 */
export default function RequireAuth({ children }: { children: ReactNode }) {
  return (
    <>
      <ClerkLoading>
        <div className="studio-shell flex min-h-screen items-center justify-center text-white">
          <Loader2 className="h-5 w-5 animate-spin text-[#5c92ff]" />
        </div>
      </ClerkLoading>
      <ClerkLoaded>
        <Show when="signed-in" fallback={<AuthScreen mode="sign-in" />}>
          {children}
        </Show>
      </ClerkLoaded>
    </>
  );
}
