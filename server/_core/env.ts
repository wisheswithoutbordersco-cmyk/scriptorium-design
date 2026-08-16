export const ENV = {
  appId: process.env.VITE_APP_ID ?? "",
  databaseUrl: process.env.DATABASE_URL ?? "",
  /** Clerk backend credentials. `CLERK_SECRET_KEY` is required for authenticated requests. */
  clerkSecretKey: process.env.CLERK_SECRET_KEY ?? "",
  clerkPublishableKey:
    process.env.CLERK_PUBLISHABLE_KEY ?? process.env.VITE_CLERK_PUBLISHABLE_KEY ?? "",
  /** Clerk user id that should be promoted to the `admin` role on first sign-in. */
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
  isProduction: process.env.NODE_ENV === "production",
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? "",
};
