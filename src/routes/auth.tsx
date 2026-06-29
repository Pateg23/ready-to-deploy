import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [{ title: "Sign in — Chat Vault" }],
  }),
  component: AuthPage,
});

function AuthPage() {
  const { user, loading, signIn, signUp } = useAuth();
  const nav = useNavigate();
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && user) nav({ to: "/" });
  }, [user, loading, nav]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    const res = mode === "in" ? await signIn(email, password) : await signUp(email, password);
    setBusy(false);
    if (res.error) setErr(res.error);
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(ellipse_at_top,oklch(0.22_0.06_265)_0%,oklch(0.12_0.02_265)_60%)] text-slate-100">
      <div className="grid min-h-screen place-items-center px-4">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center justify-center gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-2xl bg-gradient-to-br from-emerald-400 to-cyan-500 text-slate-900 shadow-lg shadow-emerald-500/30">
              <svg viewBox="0 0 24 24" className="h-6 w-6" fill="currentColor">
                <path d="M12 2a10 10 0 1 0 5.3 18.5L22 22l-1.5-4.7A10 10 0 0 0 12 2Z" />
              </svg>
            </div>
            <div>
              <div className="text-xl font-semibold tracking-tight">Chat Vault</div>
              <div className="text-xs text-slate-400">Your private WhatsApp museum</div>
            </div>
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-6 shadow-2xl backdrop-blur">
            <div className="mb-5 flex rounded-xl bg-white/5 p-1 text-sm">
              <button
                onClick={() => setMode("in")}
                className={`flex-1 rounded-lg py-1.5 transition ${mode === "in" ? "bg-white/10 text-white" : "text-slate-400"}`}
              >
                Sign in
              </button>
              <button
                onClick={() => setMode("up")}
                className={`flex-1 rounded-lg py-1.5 transition ${mode === "up" ? "bg-white/10 text-white" : "text-slate-400"}`}
              >
                Create account
              </button>
            </div>
            <form onSubmit={submit} className="space-y-3">
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-sm outline-none focus:border-emerald-400/60"
              />
              <input
                type="password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password (min 8 chars)"
                className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-sm outline-none focus:border-emerald-400/60"
              />
              {err && <p className="text-xs text-rose-400">{err}</p>}
              <button
                disabled={busy}
                className="w-full rounded-xl bg-gradient-to-r from-emerald-400 to-cyan-400 px-4 py-2.5 text-sm font-semibold text-slate-900 shadow-lg shadow-emerald-500/20 transition hover:brightness-110 disabled:opacity-50"
              >
                {busy ? "…" : mode === "in" ? "Sign in" : "Create account"}
              </button>
            </form>
            <p className="mt-4 text-center text-[11px] text-slate-500">
              Your chats stay private — each account has its own isolated vault stored locally
              in your browser.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
