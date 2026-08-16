import { clerkClient, clerkMiddleware, getAuth } from "@clerk/express";
import type { Express, NextFunction, Request, Response } from "express";
import type { User } from "../../drizzle/schema";
import * as db from "../db";
import { ENV } from "./env";

/** Result of `resolveClerkUser`: the local mirror row for the signed-in Clerk user. */
export type AuthenticatedUser = User;

/**
 * Installs Clerk on every request. `clerkMiddleware()` reads the session from the
 * `__session` cookie or the `Authorization: Bearer <token>` header and attaches the
 * auth state to the request, without rejecting unauthenticated traffic — route and
 * procedure guards decide what requires a session.
 */
export function registerClerkAuth(app: Express) {
  if (!ENV.clerkSecretKey || !ENV.clerkPublishableKey) {
    console.warn(
      "[Auth] CLERK_SECRET_KEY / CLERK_PUBLISHABLE_KEY are not both set; authenticated requests will be rejected until they are."
    );
  }

  const middleware = clerkMiddleware({
    publishableKey: ENV.clerkPublishableKey || undefined,
    secretKey: ENV.clerkSecretKey || undefined,
  });

  // Clerk throws on malformed or missing keys (e.g. "Publishable key not valid").
  // Swallowing that here keeps the site itself reachable — static assets and
  // public procedures still serve, while protected procedures simply see no
  // session and return UNAUTHORIZED instead of a blanket 500.
  app.use((req: Request, res: Response, next: NextFunction) => {
    try {
      void middleware(req, res, error => {
        if (error) {
          console.error("[Auth] Clerk middleware error:", String(error));
          next();
          return;
        }
        next();
      });
    } catch (error) {
      console.error("[Auth] Clerk middleware threw synchronously:", String(error));
      next();
    }
  });
}

function pickPrimaryEmail(user: {
  primaryEmailAddressId: string | null;
  emailAddresses: { id: string; emailAddress: string }[];
}): string | null {
  const primary = user.emailAddresses.find(
    email => email.id === user.primaryEmailAddressId
  );
  return primary?.emailAddress ?? user.emailAddresses[0]?.emailAddress ?? null;
}

function pickName(user: {
  firstName: string | null;
  lastName: string | null;
  username: string | null;
}): string | null {
  const full = [user.firstName, user.lastName].filter(Boolean).join(" ").trim();
  if (full.length > 0) return full;
  return user.username ?? null;
}

function deriveLoginMethod(
  externalAccounts: { provider: string | null }[] | undefined
): string {
  const provider = externalAccounts?.find(account => Boolean(account.provider))?.provider;
  if (!provider) return "clerk";
  // Clerk reports providers as `oauth_google`, `oauth_apple`, and so on.
  return provider.replace(/^oauth_/, "");
}

/**
 * Resolves the Clerk session on a request into the local `users` row, creating or
 * refreshing that row on first sight. Returns `null` when the request carries no
 * valid Clerk session, so public procedures keep working.
 */
export async function resolveClerkUser(req: Request): Promise<AuthenticatedUser | null> {
  let userId: string | null = null;
  try {
    userId = getAuth(req).userId ?? null;
  } catch (error) {
    // getAuth throws when clerkMiddleware has not run for this request.
    console.warn("[Auth] Clerk middleware missing for request:", String(error));
    return null;
  }

  if (!userId) return null;

  const signedInAt = new Date();
  let user = await db.getUserByOpenId(userId);

  if (!user) {
    // First request from this Clerk user: mirror the profile locally so the rest
    // of the app can keep working with a stable numeric user id.
    let name: string | null = null;
    let email: string | null = null;
    let loginMethod = "clerk";

    try {
      const clerkUser = await clerkClient.users.getUser(userId);
      name = pickName(clerkUser);
      email = pickPrimaryEmail(clerkUser);
      loginMethod = deriveLoginMethod(clerkUser.externalAccounts);
    } catch (error) {
      // A profile lookup failure must not lock a valid session out of the app.
      console.warn("[Auth] Failed to load Clerk profile:", String(error));
    }

    await db.upsertUser({
      openId: userId,
      name,
      email,
      loginMethod,
      lastSignedIn: signedInAt,
    });
    user = await db.getUserByOpenId(userId);
  } else {
    await db.upsertUser({ openId: userId, lastSignedIn: signedInAt });
  }

  if (!user) {
    console.warn("[Auth] Clerk session resolved but no local user row is available");
    return null;
  }

  return user;
}
