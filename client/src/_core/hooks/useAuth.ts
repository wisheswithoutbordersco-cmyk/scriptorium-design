import { useAuth as useClerkAuth, useClerk, useUser } from "@clerk/react";
import { trpc } from "@/lib/trpc";
import { useCallback, useEffect, useMemo } from "react";

type UseAuthOptions = {
  /** Send anonymous visitors to the sign-in screen instead of rendering children. */
  redirectOnUnauthenticated?: boolean;
  /** Where to send anonymous visitors. Defaults to Clerk's in-app sign-in route. */
  redirectPath?: string;
};

/**
 * Single source of truth for auth state in the client.
 *
 * Clerk owns the session; `auth.me` returns this app's mirrored user row (with
 * `id` and `role`), which is what the rest of the app and the backend rely on.
 */
export function useAuth(options?: UseAuthOptions) {
  const { redirectOnUnauthenticated = false, redirectPath = "/sign-in" } =
    options ?? {};
  const { isLoaded: clerkLoaded, isSignedIn } = useClerkAuth();
  const { user: clerkUser } = useUser();
  const clerk = useClerk();
  const utils = trpc.useUtils();

  const meQuery = trpc.auth.me.useQuery(undefined, {
    // Only ask the backend who we are once Clerk has a session to present.
    enabled: clerkLoaded && Boolean(isSignedIn),
    retry: false,
    refetchOnWindowFocus: false,
  });

  const logout = useCallback(async () => {
    try {
      await clerk.signOut();
    } finally {
      utils.auth.me.setData(undefined, null);
      await utils.auth.me.invalidate();
    }
  }, [clerk, utils]);

  const state = useMemo(() => {
    const user = isSignedIn ? (meQuery.data ?? null) : null;
    return {
      user,
      clerkUser: clerkUser ?? null,
      loading: !clerkLoaded || (Boolean(isSignedIn) && meQuery.isLoading),
      error: meQuery.error ?? null,
      isAuthenticated: Boolean(isSignedIn),
    };
  }, [
    clerkLoaded,
    clerkUser,
    isSignedIn,
    meQuery.data,
    meQuery.error,
    meQuery.isLoading,
  ]);

  useEffect(() => {
    if (!redirectOnUnauthenticated) return;
    if (!clerkLoaded) return;
    if (isSignedIn) return;
    if (typeof window === "undefined") return;
    if (window.location.pathname === redirectPath) return;
    window.location.href = redirectPath;
  }, [clerkLoaded, isSignedIn, redirectOnUnauthenticated, redirectPath]);

  return {
    ...state,
    refresh: () => meQuery.refetch(),
    logout,
  };
}
