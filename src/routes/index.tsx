import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { listChats, createChat, deleteChat, type ChatRow } from "@/lib/vault-db";
import { readUpload } from "@/lib/upload";
import { colorForName, initials, fmtDate } from "@/lib/format";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Chat Vault — your WhatsApp memory museum" },
      {
        name: "description",
        content:
          "Upload WhatsApp chat exports and browse them as a beautiful private archive with analytics.",
      },
      { property: "og:title", content: "Chat Vault" },
      {
        property: "og:description",
        content: "Self-hosted WhatsApp chat archive with a chat simulator and analytics dashboard.",
      },
    ],
  }),
  component: LibraryPage,
});

function LibraryPage() {
  const [chats, setChats] = useState<ChatRow[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  async function refresh() {
    setChats(await listChats());
  }
  useEffect(() => {
    refresh();
  }, []);

  async function handleFile(file: File) {
    setBusy(true);
    setError(null);
    setProgress("Reading file…");
    try {
      const parsed = await readUpload(file);
      if (!parsed.msgs.length) throw new Error("No WhatsApp messages found in this file.");
      setProgress(`Saving ${parsed.msgs.length.toLocaleString()} messages…`);
      const id = await createChat(parsed.title, parsed.msgs, parsed.media);
      setProgress(null);
      setBusy(false);
      router.navigate({ to: "/chat/$id", params: { id } });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to import.");
      setProgress(null);
      setBusy(false);
    }
  }

  async function onDelete(id: string) {
    if (!confirm("Delete this chat permanently?")) return;
    await deleteChat(id);
    refresh();
  }

  return (
    <div className="min-h-screen bg-[oklch(0.16_0.02_265)] text-slate-100">
      <header className="border-b border-white/5 bg-[oklch(0.18_0.03_265)]/80 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-emerald-400 to-cyan-500 text-slate-900 shadow-lg">
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor">
                <path d="M12 2a10 10 0 1 0 5.3 18.5L22 22l-1.5-4.7A10 10 0 0 0 12 2Zm0 4a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3Zm-2 5h2.5v6H10v-6Z" />
              </svg>
            </div>
            <div>
              <h1 className="text-lg font-semibold tracking-tight">Chat Vault</h1>
              <p className="text-xs text-slate-400">Your private WhatsApp museum</p>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-10">
        {/* Upload */}
        <section
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            const f = e.dataTransfer.files?.[0];
            if (f) handleFile(f);
          }}
          className={`relative overflow-hidden rounded-2xl border-2 border-dashed p-10 text-center transition ${
            dragOver
              ? "border-emerald-400 bg-emerald-400/10"
              : "border-white/10 bg-white/[0.03] hover:border-white/20"
          }`}
        >
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-emerald-400/20 to-cyan-500/20 ring-1 ring-white/10">
            <svg viewBox="0 0 24 24" className="h-7 w-7 text-emerald-300" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 16V4m0 0-4 4m4-4 4 4M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <h2 className="mt-4 text-xl font-semibold">Drop a WhatsApp export here</h2>
          <p className="mt-1 text-sm text-slate-400">
            Accepts <code className="rounded bg-white/5 px-1.5 py-0.5">.zip</code> or{" "}
            <code className="rounded bg-white/5 px-1.5 py-0.5">.txt</code> — everything stays in your browser.
          </p>
          <button
            disabled={busy}
            onClick={() => fileRef.current?.click()}
            className="mt-5 inline-flex items-center gap-2 rounded-xl bg-emerald-400 px-5 py-2.5 text-sm font-semibold text-slate-900 shadow-lg shadow-emerald-400/20 transition hover:bg-emerald-300 disabled:opacity-50"
          >
            {busy ? "Importing…" : "Choose file"}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".zip,.txt,text/plain,application/zip"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
              e.target.value = "";
            }}
          />
          {progress && <p className="mt-4 text-sm text-emerald-300">{progress}</p>}
          {error && <p className="mt-4 text-sm text-rose-400">{error}</p>}
        </section>

        {/* Library */}
        <section className="mt-10">
          <div className="mb-4 flex items-baseline justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400">
              Library
            </h2>
            <span className="text-xs text-slate-500">
              {chats ? `${chats.length} chat${chats.length === 1 ? "" : "s"}` : ""}
            </span>
          </div>

          {chats === null ? (
            <div className="text-sm text-slate-500">Loading…</div>
          ) : chats.length === 0 ? (
            <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-10 text-center text-sm text-slate-400">
              No chats yet. Upload your first WhatsApp export above.
            </div>
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2">
              {chats.map((c) => (
                <li
                  key={c.id}
                  className="group relative rounded-2xl border border-white/5 bg-white/[0.03] p-5 transition hover:bg-white/[0.06]"
                >
                  <Link
                    to="/chat/$id"
                    params={{ id: c.id }}
                    className="flex items-start gap-4"
                  >
                    <div
                      className="grid h-12 w-12 shrink-0 place-items-center rounded-full text-base font-semibold text-white shadow"
                      style={{ background: colorForName(c.title) }}
                    >
                      {initials(c.title)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-semibold">{c.title}</div>
                      <div className="mt-0.5 text-xs text-slate-400">
                        {c.messageCount.toLocaleString()} messages · {c.mediaCount} media
                      </div>
                      <div className="mt-2 flex flex-wrap gap-1">
                        {c.participants.slice(0, 3).map((p) => (
                          <span
                            key={p.name}
                            className="rounded-full bg-white/5 px-2 py-0.5 text-[10px] text-slate-300"
                          >
                            {p.name} · {p.pct}%
                          </span>
                        ))}
                        {c.participants.length > 3 && (
                          <span className="rounded-full bg-white/5 px-2 py-0.5 text-[10px] text-slate-400">
                            +{c.participants.length - 3}
                          </span>
                        )}
                      </div>
                      <div className="mt-2 text-[10px] text-slate-500">
                        {fmtDate(c.firstTs)} → {fmtDate(c.lastTs)}
                      </div>
                    </div>
                  </Link>
                  <button
                    onClick={() => onDelete(c.id)}
                    aria-label="Delete chat"
                    className="absolute right-3 top-3 rounded-md p-1.5 text-slate-500 opacity-0 transition hover:bg-rose-500/10 hover:text-rose-400 group-hover:opacity-100"
                  >
                    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <footer className="mt-16 text-center text-xs text-slate-600">
          Stored locally in your browser. Also ships as a Flask app under{" "}
          <code className="text-slate-500">chat-vault/</code> for VPS deployment.
        </footer>
      </main>
    </div>
  );
}
