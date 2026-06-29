import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  getChat,
  getMessagesPage,
  getAllMessages,
  getMediaURL,
  setVaultUser,
  type ChatRow,
  type MessageRow,
} from "@/lib/vault-db";
import { computeAnalytics, type Analytics } from "@/lib/analytics";
import { colorForName, initials } from "@/lib/format";
import { Simulator, type MessageSource } from "@/components/Simulator";
import { AnalyticsView } from "@/components/AnalyticsView";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/chat/$id")({
  component: ChatPage,
});

type Tab = "chat" | "analytics";

function ChatPage() {
  const { id } = Route.useParams();
  const { user, loading } = useAuth();
  const nav = useNavigate();
  const [chat, setChat] = useState<ChatRow | null>(null);
  const [tab, setTab] = useState<Tab>("chat");
  const [missing, setMissing] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      nav({ to: "/auth" });
      return;
    }
    setVaultUser(user.id);
    getChat(id).then((c) => {
      if (!c) setMissing(true);
      else setChat(c);
    });
  }, [id, user, loading, nav]);

  const source: MessageSource = useMemo(
    () => ({
      page: (b, l) => getMessagesPage(id, b, l),
      all: () => getAllMessages(id),
      media: (k) => getMediaURL(k),
    }),
    [id],
  );

  if (missing) {
    return (
      <div className="grid min-h-screen place-items-center bg-[oklch(0.12_0.02_265)] text-slate-100">
        <div className="text-center">
          <p className="text-slate-400">Chat not found.</p>
          <Link to="/" className="mt-3 inline-block rounded-lg bg-white/10 px-4 py-2 text-sm hover:bg-white/20">
            Back to library
          </Link>
        </div>
      </div>
    );
  }
  if (!chat) return <div className="min-h-screen bg-[oklch(0.12_0.02_265)]" />;

  return (
    <div className="min-h-screen bg-[oklch(0.12_0.02_265)] text-slate-100">
      <header className="sticky top-0 z-20 border-b border-white/5 bg-[oklch(0.16_0.03_265)]/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3">
          <Link
            to="/"
            className="rounded-md p-1.5 text-slate-400 hover:bg-white/5 hover:text-slate-200"
            aria-label="Back"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </Link>
          <div
            className="grid h-10 w-10 place-items-center rounded-full text-sm font-semibold text-white shadow"
            style={{ background: colorForName(chat.title) }}
          >
            {initials(chat.title)}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate font-semibold">{chat.title}</div>
            <div className="truncate text-xs text-slate-400">
              {chat.messageCount.toLocaleString()} messages · {chat.participants.length} participants
            </div>
          </div>
          <button
            onClick={() => setShareOpen(true)}
            className="hidden items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-slate-200 hover:bg-white/10 sm:inline-flex"
          >
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8M16 6l-4-4-4 4M12 2v13" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Share
          </button>
          <div className="flex rounded-xl bg-white/5 p-1 text-xs">
            <button
              onClick={() => setTab("chat")}
              className={`rounded-lg px-3 py-1.5 transition ${tab === "chat" ? "bg-white/10 text-white" : "text-slate-400 hover:text-slate-200"}`}
            >
              Chat
            </button>
            <button
              onClick={() => setTab("analytics")}
              className={`rounded-lg px-3 py-1.5 transition ${tab === "analytics" ? "bg-white/10 text-white" : "text-slate-400 hover:text-slate-200"}`}
            >
              Analytics
            </button>
          </div>
        </div>
      </header>

      {tab === "chat" ? <Simulator source={source} /> : <AnalyticsTab chat={chat} />}

      {shareOpen && <ShareDialog chat={chat} onClose={() => setShareOpen(false)} />}
    </div>
  );
}

function AnalyticsTab({ chat }: { chat: ChatRow }) {
  const [data, setData] = useState<Analytics | null>(null);
  useEffect(() => {
    let cancel = false;
    getAllMessages(chat.id).then((m) => {
      if (!cancel) setData(computeAnalytics(m));
    });
    return () => {
      cancel = true;
    };
  }, [chat.id]);
  if (!data) {
    return <div className="grid place-items-center py-20 text-sm text-slate-500">Crunching numbers…</div>;
  }
  return <AnalyticsView data={data} title={chat.title} />;
}

/* ------------------------- Share dialog ------------------------- */

function ShareDialog({ chat, onClose }: { chat: ChatRow; onClose: () => void }) {
  const { user } = useAuth();
  const [busy, setBusy] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function createLink() {
    if (!user) return;
    setBusy(true);
    setErr(null);
    try {
      const msgs = await getAllMessages(chat.id);
      // strip media keys — public link is text-only
      const trimmed = msgs.map((m) => ({
        seq: m.seq,
        ts: m.ts,
        sender: m.sender,
        isMe: m.isMe,
        kind: m.kind,
        body: m.body,
        edited: m.edited,
        mediaName: m.mediaName,
        chatId: m.chatId,
        mediaKey: null,
      }));
      const analytics = computeAnalytics(msgs);
      const token = (crypto.randomUUID() + crypto.randomUUID()).replace(/-/g, "").slice(0, 22);
      const payload = {
        v: 1,
        chat: {
          ...chat,
          mediaCount: 0,
        },
        messages: trimmed,
        analytics,
      };
      const { error } = await supabase.from("shared_chats").insert({
        token,
        user_id: user.id,
        title: chat.title,
        payload,
      });
      if (error) throw error;
      setUrl(`${window.location.origin}/share/${token}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to create link.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 backdrop-blur-sm p-4" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-3xl border border-white/10 bg-[oklch(0.18_0.03_265)] p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-semibold">Share read-only link</h3>
        <p className="mt-1 text-xs text-slate-400">
          Anyone with the link can view this chat and its analytics. Media files are not included
          — links are text-only for privacy.
        </p>
        {!url ? (
          <button
            onClick={createLink}
            disabled={busy}
            className="mt-5 w-full rounded-xl bg-gradient-to-r from-emerald-400 to-cyan-400 px-4 py-2.5 text-sm font-semibold text-slate-900 disabled:opacity-50"
          >
            {busy ? "Creating…" : "Create public link"}
          </button>
        ) : (
          <div className="mt-5">
            <div className="flex items-center gap-2">
              <input
                readOnly
                value={url}
                className="flex-1 rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-xs"
                onFocus={(e) => e.currentTarget.select()}
              />
              <button
                onClick={() => navigator.clipboard.writeText(url)}
                className="rounded-lg bg-emerald-400 px-3 py-2 text-xs font-semibold text-slate-900"
              >
                Copy
              </button>
            </div>
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 inline-block text-xs text-emerald-300 hover:underline"
            >
              Open link →
            </a>
          </div>
        )}
        {err && <p className="mt-3 text-xs text-rose-400">{err}</p>}
        <button
          onClick={onClose}
          className="mt-4 w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-xs text-slate-300 hover:bg-white/10"
        >
          Close
        </button>
      </div>
    </div>
  );
}
