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
    <div className="min-h-screen bg-[#0b141a] text-[#e9edef]">
      <header className="sticky top-0 z-20 border-b border-black/40 bg-[#202c33]">
        <div className="mx-auto grid max-w-6xl grid-cols-[auto_auto_minmax(0,1fr)_auto] items-center gap-2 px-2 py-2 sm:gap-3 sm:px-4 sm:py-2.5">
          <Link
            to="/"
            className="grid h-9 w-9 place-items-center rounded-full text-[#aebac1] hover:bg-white/5"
            aria-label="Back"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </Link>
          <div
            className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-sm font-semibold text-white shadow"
            style={{ background: colorForName(chat.title) }}
          >
            {initials(chat.title)}
          </div>
          <div className="min-w-0">
            <div className="truncate font-semibold leading-tight">{chat.title}</div>
            <div className="truncate text-[11px] text-[#8696a0]">
              {chat.participants
                .slice(0, 4)
                .map((p) => p.name)
                .join(", ")}
              {chat.participants.length > 4 ? ` +${chat.participants.length - 4}` : ""}
            </div>
          </div>
          <div className="flex items-center gap-1.5 sm:gap-2">
            <button
              onClick={() => setShareOpen(true)}
              className="grid h-9 w-9 place-items-center rounded-full text-[#aebac1] hover:bg-white/5"
              aria-label="Share"
              title="Create public link"
            >
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8M16 6l-4-4-4 4M12 2v13" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            <div className="flex rounded-full bg-[#0b141a] p-0.5 text-[11px] sm:text-xs">
              <button
                onClick={() => setTab("chat")}
                className={`rounded-full px-3 py-1.5 transition ${tab === "chat" ? "bg-[#00a884] font-semibold text-[#0b141a]" : "text-[#8696a0] hover:text-[#e9edef]"}`}
              >
                Chat
              </button>
              <button
                onClick={() => setTab("analytics")}
                className={`rounded-full px-3 py-1.5 transition ${tab === "analytics" ? "bg-[#00a884] font-semibold text-[#0b141a]" : "text-[#8696a0] hover:text-[#e9edef]"}`}
              >
                Stats
              </button>
            </div>
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
        payload: payload as unknown as never,
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
