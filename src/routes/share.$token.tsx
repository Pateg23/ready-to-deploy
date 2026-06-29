import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Simulator, type MessageSource } from "@/components/Simulator";
import { AnalyticsView } from "@/components/AnalyticsView";
import type { Analytics } from "@/lib/analytics";
import type { MessageRow } from "@/lib/vault-db";
import { colorForName, initials } from "@/lib/format";

export const Route = createFileRoute("/share/$token")({
  head: () => ({
    meta: [{ title: "Shared chat — Chat Vault" }],
  }),
  component: SharePage,
});

interface Payload {
  v: number;
  chat: { id: string; title: string; messageCount: number; participants: { name: string; pct: number }[] };
  messages: MessageRow[];
  analytics: Analytics;
}

type Tab = "chat" | "analytics";

function SharePage() {
  const { token } = Route.useParams();
  const [payload, setPayload] = useState<Payload | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("chat");

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from("shared_chats")
        .select("payload, title")
        .eq("token", token)
        .maybeSingle();
      if (error || !data) {
        setErr("This shared link is missing or has been removed.");
        return;
      }
      setPayload(data.payload as unknown as Payload);
    })();
  }, [token]);

  const source: MessageSource = useMemo(() => {
    const all = payload?.messages || [];
    return {
      page: async (beforeSeq, limit) => {
        const upper = beforeSeq == null ? Number.MAX_SAFE_INTEGER : beforeSeq - 1;
        const slice = all.filter((m) => m.seq <= upper);
        return slice.slice(Math.max(0, slice.length - limit));
      },
      all: async () => all,
    };
  }, [payload]);

  if (err) {
    return (
      <div className="grid min-h-screen place-items-center bg-[oklch(0.12_0.02_265)] text-slate-100">
        <div className="text-center">
          <p className="text-slate-400">{err}</p>
          <Link to="/" className="mt-3 inline-block rounded-lg bg-white/10 px-4 py-2 text-sm">
            Go home
          </Link>
        </div>
      </div>
    );
  }
  if (!payload) return <div className="min-h-screen bg-[oklch(0.12_0.02_265)]" />;

  const chat = payload.chat;
  return (
    <div className="min-h-screen bg-[oklch(0.12_0.02_265)] text-slate-100">
      <header className="sticky top-0 z-20 border-b border-white/5 bg-[oklch(0.16_0.03_265)]/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3">
          <div
            className="grid h-10 w-10 place-items-center rounded-full text-sm font-semibold text-white shadow"
            style={{ background: colorForName(chat.title) }}
          >
            {initials(chat.title)}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate font-semibold">{chat.title}</div>
            <div className="truncate text-xs text-slate-400">
              Shared read-only · {chat.messageCount.toLocaleString()} messages
            </div>
          </div>
          <span className="hidden rounded-full bg-emerald-500/15 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-emerald-300 sm:inline">
            Public link
          </span>
          <div className="flex rounded-xl bg-white/5 p-1 text-xs">
            <button
              onClick={() => setTab("chat")}
              className={`rounded-lg px-3 py-1.5 transition ${tab === "chat" ? "bg-white/10 text-white" : "text-slate-400"}`}
            >
              Chat
            </button>
            <button
              onClick={() => setTab("analytics")}
              className={`rounded-lg px-3 py-1.5 transition ${tab === "analytics" ? "bg-white/10 text-white" : "text-slate-400"}`}
            >
              Analytics
            </button>
          </div>
        </div>
      </header>

      {tab === "chat" ? (
        <Simulator source={source} />
      ) : (
        <AnalyticsView data={payload.analytics} title={chat.title} />
      )}

      <footer className="border-t border-white/5 px-4 py-6 text-center text-[11px] text-slate-500">
        Powered by <Link to="/" className="text-emerald-300 hover:underline">Chat Vault</Link>
      </footer>
    </div>
  );
}
