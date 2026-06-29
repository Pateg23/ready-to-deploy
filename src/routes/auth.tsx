import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/auth")({
  head: () => ({ meta: [{ title: "Sign in — Chat Vault" }] }),
  component: AuthPage,
});

function AuthPage() {
  const { user, loading, signIn, signUp } = useAuth();
  const nav = useNavigate();
  const [mode, setMode] = useState<"in" | "up">("in");
  const [username, setUsername] = useState("");
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
    const res = mode === "in" ? await signIn(username, password) : await signUp(username, password);
    setBusy(false);
    if (res.error) setErr(res.error);
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#0b141a] text-[#e9edef]">
      {/* aurora background */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-40 -left-40 h-[520px] w-[520px] rounded-full bg-[#00a884]/25 blur-[140px]" />
        <div className="absolute -bottom-40 -right-32 h-[520px] w-[520px] rounded-full bg-[#0091ea]/20 blur-[140px]" />
        <div
          className="absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage:
              "radial-gradient(circle at 1px 1px, #ffffff 1px, transparent 0)",
            backgroundSize: "22px 22px",
          }}
        />
      </div>

      <div className="relative grid min-h-screen place-items-center px-4 py-10">
        <div className="w-full max-w-[380px]">
          <div className="mb-7 flex flex-col items-center text-center">
            <div className="grid h-14 w-14 place-items-center rounded-[20px] bg-gradient-to-br from-[#25d366] to-[#128c7e] shadow-[0_18px_50px_-12px_rgba(37,211,102,0.6)]">
              <svg viewBox="0 0 32 32" className="h-7 w-7 text-white" fill="currentColor">
                <path d="M16 3C9.4 3 4 8.3 4 14.9c0 2.4.7 4.6 2 6.5L4 29l7.9-2c1.8.9 3.9 1.4 6.1 1.4 6.6 0 12-5.3 12-11.9C30 8.3 24.6 3 18 3h-2zm0 2h2c5.5 0 10 4.5 10 9.9 0 5.5-4.5 9.9-10 9.9-2 0-3.9-.6-5.5-1.6l-.5-.3-4.7 1.2 1.3-4.6-.3-.5C7.5 18.4 7 16.7 7 14.9 7 9.5 11.5 5 16 5z" />
              </svg>
            </div>
            <h1 className="mt-4 text-2xl font-semibold tracking-tight">Chat Vault</h1>
            <p className="mt-1 text-[13px] text-[#8696a0]">
              Your private archive for WhatsApp conversations.
            </p>
          </div>

          <div className="rounded-3xl border border-white/[0.06] bg-[#111b21]/80 p-6 shadow-[0_30px_80px_-30px_rgba(0,0,0,0.8)] backdrop-blur-xl">
            <div className="mb-5 flex rounded-full bg-[#0b141a] p-1 text-[13px]">
              <button
                onClick={() => setMode("in")}
                className={`flex-1 rounded-full py-1.5 transition ${mode === "in" ? "bg-[#00a884] text-[#0b141a] font-semibold" : "text-[#8696a0]"}`}
              >
                Sign in
              </button>
              <button
                onClick={() => setMode("up")}
                className={`flex-1 rounded-full py-1.5 transition ${mode === "up" ? "bg-[#00a884] text-[#0b141a] font-semibold" : "text-[#8696a0]"}`}
              >
                Create account
              </button>
            </div>

            <form onSubmit={submit} className="space-y-3">
              <label className="block">
                <span className="mb-1 block text-[11px] uppercase tracking-wider text-[#8696a0]">
                  Username
                </span>
                <div className="flex items-center rounded-xl border border-white/5 bg-[#0b141a] px-3 focus-within:border-[#00a884]/70">
                  <span className="mr-2 text-[#54656f]">@</span>
                  <input
                    autoComplete="username"
                    required
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="your_name"
                    className="w-full bg-transparent py-2.5 text-sm outline-none placeholder:text-[#54656f]"
                  />
                </div>
              </label>
              <label className="block">
                <span className="mb-1 block text-[11px] uppercase tracking-wider text-[#8696a0]">
                  Password
                </span>
                <input
                  type="password"
                  autoComplete={mode === "in" ? "current-password" : "new-password"}
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full rounded-xl border border-white/5 bg-[#0b141a] px-3 py-2.5 text-sm outline-none placeholder:text-[#54656f] focus:border-[#00a884]/70"
                />
              </label>
              {err && (
                <p className="rounded-lg bg-rose-500/10 px-3 py-2 text-xs text-rose-300">{err}</p>
              )}
              <button
                disabled={busy}
                className="mt-1 w-full rounded-xl bg-[#00a884] px-4 py-3 text-sm font-semibold text-[#0b141a] shadow-lg shadow-[#00a884]/30 transition hover:bg-[#06cf9c] disabled:opacity-60"
              >
                {busy ? "Please wait…" : mode === "in" ? "Sign in" : "Create account"}
              </button>
            </form>

            <p className="mt-5 text-center text-[11px] leading-relaxed text-[#54656f]">
              No email required. Each account gets its own isolated vault.
              Your chats never leave your device unless you create a public link.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
