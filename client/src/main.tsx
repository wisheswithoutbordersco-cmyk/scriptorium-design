import { trpc } from "@/lib/trpc";
import { ClerkProvider, getToken } from "@clerk/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink } from "@trpc/client";
import { createRoot } from "react-dom/client";
import superjson from "superjson";
import App from "./App";
import { CLERK_PUBLISHABLE_KEY } from "./const";
import { clerkAppearance } from "./lib/clerkAppearance";
import "./index.css";

const queryClient = new QueryClient();

queryClient.getQueryCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    console.error("[API Query Error]", event.query.state.error);
  }
});

queryClient.getMutationCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    console.error("[API Mutation Error]", event.mutation.state.error);
  }
});

/**
 * Clerk stores its session in a first-party cookie, which `credentials: "include"`
 * already sends. The bearer token is added as well so the API keeps working in
 * contexts where cookies are blocked (Safari ITP, private windows, WebViews).
 */
async function getClerkToken(): Promise<string | null> {
  try {
    return await getToken();
  } catch {
    // No session, offline, or Clerk still loading: fall back to cookie auth.
    return null;
  }
}

const trpcClient = trpc.createClient({
  links: [
    httpBatchLink({
      url: "/api/trpc",
      transformer: superjson,
      async headers() {
        const token = await getClerkToken();
        return token ? { Authorization: `Bearer ${token}` } : {};
      },
      fetch(input, init) {
        return globalThis.fetch(input, {
          ...(init ?? {}),
          credentials: "include",
        });
      },
    }),
  ],
});

if (!CLERK_PUBLISHABLE_KEY) {
  // Fail loudly rather than rendering an app that can never sign anyone in.
  console.error(
    "[Clerk] VITE_CLERK_PUBLISHABLE_KEY is missing. Set it in the build environment."
  );
}

createRoot(document.getElementById("root")!).render(
  <ClerkProvider
    publishableKey={CLERK_PUBLISHABLE_KEY ?? ""}
    afterSignOutUrl="/sign-in"
    appearance={clerkAppearance}
  >
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </trpc.Provider>
  </ClerkProvider>
);
