import { useEffect, useState, type FormEvent } from "react";
import { LockKeyhole, Loader2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import Home from "@/pages/Home";

type OwnerSessionState = "loading" | "signed-out" | "signed-in";

export default function OwnerWorkspacePage() {
  const [sessionState, setSessionState] =
    useState<OwnerSessionState>("loading");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    fetch("/api/owner/session", { credentials: "include", cache: "no-store" })
      .then(async response => {
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error("Unable to check the owner session");
        if (active)
          setSessionState(payload.authenticated ? "signed-in" : "signed-out");
      })
      .catch(() => {
        if (active) setSessionState("signed-out");
      });
    return () => {
      active = false;
    };
  }, []);

  const handleLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy) return;
    const formPassword = new FormData(event.currentTarget).get("password");
    if (typeof formPassword !== "string" || !formPassword) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/owner/login", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: formPassword }),
      });
      if (response.ok) {
        setPassword("");
        setSessionState("signed-in");
      } else if (response.status === 429) {
        setError("Too many attempts. Please wait before trying again.");
      } else if (response.status === 503) {
        setError("Owner login is not configured yet. Please try again later.");
      } else if (response.status === 401) {
        setError("The submitted owner password did not match (HTTP 401).");
      } else if (response.status === 403) {
        setError(
          "The sign-in request was blocked by the app origin check (HTTP 403). Reload this app page and try again."
        );
      } else {
        setError(`Owner sign-in failed (HTTP ${response.status}).`);
      }
    } catch {
      setError("Unable to reach the owner sign-in service. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  if (sessionState === "signed-in") return <Home ownerMode />;

  if (sessionState === "loading") {
    return (
      <div className="studio-shell flex min-h-screen items-center justify-center text-white">
        <Loader2
          className="h-5 w-5 animate-spin text-[#5c92ff]"
          aria-label="Checking owner session"
        />
      </div>
    );
  }

  return (
    <main className="studio-shell flex min-h-screen items-center justify-center px-4 py-10 text-white">
      <section className="studio-card w-full max-w-md rounded-2xl border border-white/10 bg-[#0d0f13]/90 p-7 shadow-2xl shadow-blue-950/20 sm:p-9">
        <div className="mb-7 flex h-11 w-11 items-center justify-center rounded-xl border border-blue-400/20 bg-blue-500/10 text-[#8fb3ff]">
          <LockKeyhole className="h-5 w-5" />
        </div>
        <p className="studio-kicker">SCRIPTORIUM · OWNER ACCESS</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-[-0.04em]">
          Your private workspace
        </h1>
        <p className="mt-2 text-sm leading-6 text-white/55">
          Sign in with your owner password to open the production studio.
        </p>

        <form className="mt-7 space-y-5" onSubmit={handleLogin}>
          <div>
            <label
              htmlFor="owner-password"
              className="text-sm font-medium text-white/80"
            >
              Owner password
            </label>
            <input
              id="owner-password"
              name="password"
              type="password"
              autoComplete="current-password"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              required
              value={password}
              onChange={event => setPassword(event.target.value)}
              disabled={busy}
              className="mt-2 h-11 w-full rounded-lg border border-white/12 bg-black/35 px-3 text-sm text-white outline-none transition placeholder:text-white/30 focus:border-blue-400/60 focus:ring-2 focus:ring-blue-500/20 disabled:opacity-60"
            />
          </div>
          {error && (
            <p className="text-sm text-red-300" role="alert">
              {error}
            </p>
          )}
          <Button type="submit" disabled={busy} size="lg" className="w-full">
            {busy ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <ShieldCheck className="mr-2 h-4 w-4" />
            )}
            {busy ? "Signing in…" : "Open owner workspace"}
          </Button>
        </form>
        <p className="mt-6 text-xs leading-5 text-white/35">
          This is a separate owner-only sign-in. It does not use Google OAuth or
          consume customer free generations.
        </p>
      </section>
    </main>
  );
}
