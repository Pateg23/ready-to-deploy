import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Chat Vault — Self-hosted WhatsApp archive" },
      {
        name: "description",
        content:
          "A self-hosted Flask + SQLite digital museum for WhatsApp chat exports. Deploy to your own Ubuntu VPS.",
      },
      { property: "og:title", content: "Chat Vault" },
      {
        property: "og:description",
        content:
          "Self-hosted WhatsApp chat archive with chat simulator, analytics dashboard, and zero external services.",
      },
    ],
  }),
  component: Index,
});

function Index() {
  return (
    <main className="min-h-screen bg-[#0b0d12] text-slate-100">
      <div className="mx-auto max-w-3xl px-6 py-16">
        <span className="inline-flex items-center rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1 text-xs font-medium text-emerald-300">
          Build complete · ready for your VPS
        </span>

        <h1 className="mt-6 text-4xl font-semibold tracking-tight sm:text-5xl">
          Chat Vault
        </h1>
        <p className="mt-4 text-lg text-slate-400">
          A self-hosted digital museum for your WhatsApp chat exports.
          Flask + SQLite backend, vanilla-JS SPA frontend. No external services.
        </p>

        <section className="mt-10 rounded-2xl border border-white/10 bg-white/[0.03] p-6">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-300">
            Project location
          </h2>
          <code className="mt-2 block rounded-md bg-black/40 px-3 py-2 font-mono text-sm text-emerald-300">
            chat-vault/
          </code>
          <p className="mt-3 text-sm text-slate-400">
            Everything you need — <code>app.py</code>, <code>models.py</code>,
            templates, static assets, <code>requirements.txt</code> and a
            deployment README — is inside that folder. Copy it to your Ubuntu
            VPS as-is.
          </p>
        </section>

        <section className="mt-6 rounded-2xl border border-white/10 bg-white/[0.03] p-6">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-300">
            Run it
          </h2>
          <pre className="mt-3 overflow-x-auto rounded-md bg-black/50 p-4 font-mono text-xs leading-relaxed text-slate-200">
{`cd chat-vault
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
export SECRET_KEY="$(openssl rand -hex 32)"
python app.py            # dev
# or for production:
pip install gunicorn
gunicorn -w 2 -b 127.0.0.1:8080 app:app`}
          </pre>
          <p className="mt-3 text-sm text-slate-400">
            Then open <span className="text-slate-200">http://your-server:8080</span>.
            Put nginx in front for TLS. Full systemd + nginx notes are in{" "}
            <code>chat-vault/README.md</code>.
          </p>
        </section>

        <section className="mt-6 grid gap-3 sm:grid-cols-2">
          {[
            ["Auth", "Register, login, or one-click Guest mode"],
            ["Upload", "Drag-and-drop .txt or .zip WhatsApp exports"],
            ["Simulator", "WhatsApp-style viewer with infinite scroll + search"],
            ["Analytics", "Heatmap, per-day chart, top words, top emojis"],
            ["Storage", "Local SQLite (WAL) — no external DB"],
            ["Media", "Images & stickers extracted from the .zip export"],
          ].map(([title, body]) => (
            <div
              key={title}
              className="rounded-xl border border-white/10 bg-white/[0.02] p-4"
            >
              <h3 className="text-sm font-semibold text-slate-200">{title}</h3>
              <p className="mt-1 text-sm text-slate-400">{body}</p>
            </div>
          ))}
        </section>

        <p className="mt-10 text-xs text-slate-500">
          This Lovable preview only renders this landing page. The actual app
          is a Python server — it runs wherever you deploy the{" "}
          <code>chat-vault/</code> folder.
        </p>
      </div>
    </main>
  );
}
