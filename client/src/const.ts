export { ONE_YEAR_MS } from "@shared/const";

/**
 * Clerk publishable key, injected at build time by Vite.
 * Set `VITE_CLERK_PUBLISHABLE_KEY` in the environment that runs `vite build`.
 */
export const CLERK_PUBLISHABLE_KEY = import.meta.env
  .VITE_CLERK_PUBLISHABLE_KEY as string | undefined;

/** In-app routes served by Clerk's hosted-in-page components. */
export const SIGN_IN_PATH = "/sign-in";
export const SIGN_UP_PATH = "/sign-up";
