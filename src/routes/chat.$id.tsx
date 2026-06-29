import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  getChat,
  getMessagesPage,
  getAllMessages,
  getMediaURL,
  type ChatRow,
  type MessageRow,
} from "@/lib/vault-db";
import { computeAnalytics, type Analytics } from "@/lib/analytics";
import { colorForName, initials, fmtDate, fmtTime, fmtDuration } from "@/lib/format";

export const Route = createFileRoute("/chat/$id")({
  component: ChatPage,
});

type Tab = "chat" | "analytics";

function ChatPage() {
  const { id } = Route.useParams();
  const router = useRouter();
  const [chat, setChat] = useState<ChatRow | null>(null);
  const [tab, setTab] = useState<Tab>("chat");
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    getChat(id).then((c) => {
      if (!c) setMissing(true);
      else setChat(c);
    });
  }, [id]);

  if (missing) {
    return (
      <div className="grid min-h-screen place-items-center bg-[oklch(0.16_0.02_265)] text-slate-100">
        <div className="text-center">
          <p className="text-slate-400">Chat not found.</p>
          <button
            onClick={() => router.navigate({ to: "/" })}
            className="mt-3 rounded-lg bg-white/10 px-4 py-2 text-sm hover:bg-white/20"
          >
            Back to library
          </button>
        </div>
      </div>
    );
  }
  if (!chat) return <div className="min-h-screen bg-[oklch(0.16_0.02_265)]" />;

  return (
    <div className="min-h-screen bg-[oklch(0.16_0.02_265)] text-slate-100">
      <header className="sticky top-0 z-20 border-b border-white/5 bg-[oklch(0.18_0.03_265)]/90 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-3">
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
            className="grid h-10 w-10 place-items-center rounded-full text-sm font-semibold text-white"
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
          <div className="flex rounded-xl bg-white/5 p-1 text-xs">
            <button
              onClick={() => setTab("chat")}
              className={`rounded-lg px-3 py-1.5 transition ${
                tab === "chat" ? "bg-white/10 text-white" : "text-slate-400 hover:text-slate-200"
              }`}
            >
              Chat
            </button>
            <button
              onClick={() => setTab("analytics")}
              className={`rounded-lg px-3 py-1.5 transition ${
                tab === "analytics" ? "bg-white/10 text-white" : "text-slate-400 hover:text-slate-200"
              }`}
            >
              Analytics
            </button>
          </div>
        </div>
      </header>

      {tab === "chat" ? <Simulator chat={chat} /> : <AnalyticsView chat={chat} />}
    </div>
  );
}

/* ------------------------- Simulator ------------------------- */

const PAGE = 60;

function Simulator({ chat }: { chat: ChatRow }) {
  const [msgs, setMsgs] = useState<MessageRow[]>([]);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<MessageRow[] | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const targetSeqRef = useRef<number | null>(null);

  // Initial load — latest page
  useEffect(() => {
    let cancel = false;
    (async () => {
      setLoading(true);
      const page = await getMessagesPage(chat.id, null, PAGE);
      if (cancel) return;
      setMsgs(page);
      setHasMore(page.length === PAGE);
      setLoading(false);
      requestAnimationFrame(() => {
        const el = scrollerRef.current;
        if (el) el.scrollTop = el.scrollHeight;
      });
    })();
    return () => {
      cancel = true;
    };
  }, [chat.id]);

  const loadOlder = useCallback(async () => {
    if (loading || !hasMore || msgs.length === 0) return;
    setLoading(true);
    const el = scrollerRef.current!;
    const prevH = el.scrollHeight;
    const page = await getMessagesPage(chat.id, msgs[0].seq, PAGE);
    setMsgs((m) => [...page, ...m]);
    setHasMore(page.length === PAGE);
    setLoading(false);
    requestAnimationFrame(() => {
      el.scrollTop = el.scrollHeight - prevH;
    });
  }, [chat.id, hasMore, loading, msgs]);

  function onScroll(e: React.UIEvent<HTMLDivElement>) {
    if (e.currentTarget.scrollTop < 200) loadOlder();
  }

  // Search across whole chat
  useEffect(() => {
    if (!query.trim()) {
      setResults(null);
      return;
    }
    let cancel = false;
    const handle = setTimeout(async () => {
      const all = await getAllMessages(chat.id);
      if (cancel) return;
      const q = query.toLowerCase();
      setResults(all.filter((m) => m.body && m.body.toLowerCase().includes(q)).slice(0, 200));
    }, 200);
    return () => {
      cancel = true;
      clearTimeout(handle);
    };
  }, [query, chat.id]);

  // Jump to a target seq from search
  async function jumpTo(seq: number) {
    setSearchOpen(false);
    setQuery("");
    setResults(null);
    targetSeqRef.current = seq;
    // Load enough messages around the seq
    const window = 40;
    const page = await getMessagesPage(chat.id, seq + window + 1, PAGE * 2);
    setMsgs(page);
    setHasMore(true);
    requestAnimationFrame(() => {
      const el = document.querySelector(`[data-seq="${seq}"]`) as HTMLElement | null;
      el?.scrollIntoView({ block: "center" });
      el?.classList.add("ring-2", "ring-amber-400");
      setTimeout(() => el?.classList.remove("ring-2", "ring-amber-400"), 1600);
    });
  }

  const grouped = useMemo(() => groupByDay(msgs), [msgs]);

  return (
    <div className="relative mx-auto flex h-[calc(100vh-64px)] max-w-3xl flex-col">
      {/* Search toolbar */}
      <div className="border-b border-white/5 bg-[oklch(0.18_0.03_265)]/60 px-4 py-2">
        <div className="flex items-center gap-2">
          <input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSearchOpen(true);
            }}
            onFocus={() => setSearchOpen(true)}
            placeholder="Search this chat…"
            className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm placeholder-slate-500 outline-none focus:border-emerald-400/60"
          />
          {query && (
            <button
              onClick={() => {
                setQuery("");
                setResults(null);
              }}
              className="text-xs text-slate-400 hover:text-slate-200"
            >
              Clear
            </button>
          )}
        </div>
        {searchOpen && results && (
          <div className="mt-2 max-h-64 overflow-auto rounded-lg border border-white/10 bg-[oklch(0.2_0.03_265)] shadow-xl">
            {results.length === 0 ? (
              <div className="px-3 py-2 text-xs text-slate-500">No matches.</div>
            ) : (
              results.map((r) => (
                <button
                  key={r.seq}
                  onClick={() => jumpTo(r.seq)}
                  className="block w-full border-b border-white/5 px-3 py-2 text-left text-xs hover:bg-white/5"
                >
                  <div className="text-slate-400">
                    {r.sender} · {fmtDate(r.ts)} {fmtTime(r.ts)}
                  </div>
                  <div className="line-clamp-2 text-slate-200">{highlight(r.body, query)}</div>
                </button>
              ))
            )}
          </div>
        )}
      </div>

      {/* Messages */}
      <div
        ref={scrollerRef}
        onScroll={onScroll}
        className="flex-1 overflow-y-auto px-2 py-4"
        style={{
          background:
            "linear-gradient(135deg, oklch(0.18 0.03 265), oklch(0.2 0.04 265))",
        }}
      >
        {loading && msgs.length === 0 && (
          <div className="grid place-items-center py-20 text-sm text-slate-500">Loading…</div>
        )}
        {hasMore && msgs.length > 0 && (
          <div className="py-2 text-center text-[10px] uppercase tracking-wider text-slate-500">
            {loading ? "Loading older…" : "Scroll up for older"}
          </div>
        )}
        {grouped.map((g) => (
          <div key={g.date}>
            <div className="my-3 flex items-center justify-center">
              <span className="rounded-full bg-black/30 px-3 py-1 text-[10px] uppercase tracking-wider text-slate-300 ring-1 ring-white/5">
                {g.date}
              </span>
            </div>
            {g.items.map((m, i) => (
              <Bubble
                key={m.seq}
                m={m}
                showName={
                  !m.isMe &&
                  m.sender !== "__system__" &&
                  (i === 0 || g.items[i - 1].sender !== m.sender)
                }
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function highlight(text: string, q: string) {
  if (!q) return text;
  const i = text.toLowerCase().indexOf(q.toLowerCase());
  if (i < 0) return text;
  return (
    <>
      {text.slice(0, i)}
      <mark className="rounded bg-amber-300/40 text-amber-100">{text.slice(i, i + q.length)}</mark>
      {text.slice(i + q.length)}
    </>
  );
}

function groupByDay(msgs: MessageRow[]) {
  const out: { date: string; items: MessageRow[] }[] = [];
  for (const m of msgs) {
    const date = fmtDate(m.ts);
    const last = out[out.length - 1];
    if (last && last.date === date) last.items.push(m);
    else out.push({ date, items: [m] });
  }
  return out;
}

function Bubble({ m, showName }: { m: MessageRow; showName: boolean }) {
  const [mediaUrl, setMediaUrl] = useState<string | null>(null);
  useEffect(() => {
    let url: string | null = null;
    let cancel = false;
    if (m.mediaKey) {
      getMediaURL(m.mediaKey).then((u) => {
        if (cancel) return;
        url = u;
        setMediaUrl(u);
      });
    }
    return () => {
      cancel = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [m.mediaKey]);

  if (m.sender === "__system__" || m.kind === "system") {
    return (
      <div data-seq={m.seq} className="my-2 flex justify-center">
        <span className="rounded-md bg-black/30 px-3 py-1 text-[11px] text-slate-400 ring-1 ring-white/5">
          {m.body || "—"}
        </span>
      </div>
    );
  }

  const mine = m.isMe;
  return (
    <div data-seq={m.seq} className={`my-0.5 flex ${mine ? "justify-end" : "justify-start"}`}>
      <div
        className={`relative max-w-[78%] rounded-2xl px-3 py-2 text-sm shadow-sm ${
          mine
            ? "rounded-br-sm bg-emerald-500/90 text-slate-900"
            : "rounded-bl-sm bg-white/10 text-slate-100"
        }`}
      >
        {showName && (
          <div
            className="mb-0.5 text-[11px] font-semibold"
            style={{ color: mine ? "rgba(0,0,0,0.6)" : colorForName(m.sender) }}
          >
            {m.sender}
          </div>
        )}
        {m.kind === "image" && mediaUrl && (
          <img
            src={mediaUrl}
            alt="attachment"
            className="mb-1 max-h-80 rounded-lg object-cover"
            loading="lazy"
          />
        )}
        {m.kind === "sticker" && mediaUrl && (
          <img src={mediaUrl} alt="sticker" className="mb-1 max-h-40" loading="lazy" />
        )}
        {m.kind === "video" && mediaUrl && (
          <video src={mediaUrl} controls className="mb-1 max-h-80 rounded-lg" />
        )}
        {m.kind === "audio" && mediaUrl && <audio src={mediaUrl} controls className="mb-1 w-full" />}
        {!mediaUrl && (m.kind === "image" || m.kind === "video" || m.kind === "audio" || m.kind === "sticker") && (
          <div
            className={`mb-1 rounded-md px-2 py-1 text-xs italic ${
              mine ? "bg-black/10 text-slate-800/70" : "bg-white/5 text-slate-400"
            }`}
          >
            {m.kind} (media omitted)
          </div>
        )}
        {m.kind === "deleted" ? (
          <span className="italic opacity-70">🚫 message deleted</span>
        ) : (
          m.body && <span className="whitespace-pre-wrap break-words">{m.body}</span>
        )}
        <div
          className={`mt-0.5 flex items-center justify-end gap-1 text-[10px] ${
            mine ? "text-slate-700/70" : "text-slate-400"
          }`}
        >
          {m.edited && <span className="italic">edited</span>}
          <span>{fmtTime(m.ts)}</span>
        </div>
      </div>
    </div>
  );
}

/* ------------------------- Analytics ------------------------- */

function AnalyticsView({ chat }: { chat: ChatRow }) {
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
    return (
      <div className="grid place-items-center py-20 text-sm text-slate-500">
        Crunching numbers…
      </div>
    );
  }
  const t = data.totals;
  const maxDay = Math.max(...data.perDay.map((d) => d.count), 1);
  const maxWord = data.topWords[0]?.count || 1;

  return (
    <main className="mx-auto max-w-5xl px-6 py-8">
      {/* Totals */}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ["Messages", t.messages.toLocaleString()],
          ["Words", t.words.toLocaleString()],
          ["Media", t.media.toLocaleString()],
          ["Avg reply", fmtDuration(t.avgResponseSec)],
        ].map(([label, value]) => (
          <div key={label} className="rounded-2xl border border-white/5 bg-white/[0.03] p-4">
            <div className="text-[11px] uppercase tracking-wider text-slate-500">{label}</div>
            <div className="mt-1 text-2xl font-semibold">{value}</div>
          </div>
        ))}
      </section>

      {/* Participants */}
      <section className="mt-6 rounded-2xl border border-white/5 bg-white/[0.03] p-5">
        <h3 className="mb-3 text-sm font-semibold text-slate-300">Participants</h3>
        <ul className="space-y-2">
          {data.participants.map((p) => (
            <li key={p.name} className="flex items-center gap-3">
              <div
                className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-xs font-semibold text-white"
                style={{ background: colorForName(p.name) }}
              >
                {initials(p.name)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex justify-between text-xs">
                  <span className="truncate font-medium text-slate-200">{p.name}</span>
                  <span className="text-slate-400">
                    {p.count.toLocaleString()} · {p.pct}%
                  </span>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/5">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${p.pct}%`,
                      background: colorForName(p.name),
                    }}
                  />
                </div>
              </div>
            </li>
          ))}
        </ul>
      </section>

      {/* Heatmap */}
      <section className="mt-6 rounded-2xl border border-white/5 bg-white/[0.03] p-5">
        <h3 className="mb-3 text-sm font-semibold text-slate-300">Activity heatmap</h3>
        <div className="overflow-x-auto">
          <div className="inline-grid gap-[2px]" style={{ gridTemplateColumns: "auto repeat(24, 14px)" }}>
            <div />
            {Array.from({ length: 24 }, (_, h) => (
              <div key={h} className="text-center text-[8px] text-slate-500">
                {h % 6 === 0 ? h : ""}
              </div>
            ))}
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d, di) => (
              <FragmentRow
                key={d}
                label={d}
                row={data.heatmap[di]}
                max={data.heatmapMax}
              />
            ))}
          </div>
        </div>
      </section>

      {/* Per-day chart */}
      <section className="mt-6 rounded-2xl border border-white/5 bg-white/[0.03] p-5">
        <h3 className="mb-3 text-sm font-semibold text-slate-300">Messages per day</h3>
        <div className="flex h-32 items-end gap-[2px] overflow-x-auto">
          {data.perDay.map((d) => (
            <div
              key={d.date}
              title={`${d.date} — ${d.count}`}
              className="w-1 shrink-0 rounded-sm bg-emerald-400/70"
              style={{ height: `${(d.count / maxDay) * 100}%` }}
            />
          ))}
        </div>
        <div className="mt-2 flex justify-between text-[10px] text-slate-500">
          <span>{data.perDay[0]?.date}</span>
          <span>{data.perDay[data.perDay.length - 1]?.date}</span>
        </div>
      </section>

      {/* Words + emojis */}
      <section className="mt-6 grid gap-4 sm:grid-cols-2">
        <div className="rounded-2xl border border-white/5 bg-white/[0.03] p-5">
          <h3 className="mb-3 text-sm font-semibold text-slate-300">Top words</h3>
          {data.topWords.length === 0 ? (
            <p className="text-xs text-slate-500">Nothing notable.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {data.topWords.slice(0, 40).map((w) => {
                const size = 0.75 + (w.count / maxWord) * 1.1;
                return (
                  <span
                    key={w.word}
                    style={{ fontSize: `${size}rem` }}
                    className="text-slate-200"
                    title={`${w.count}`}
                  >
                    {w.word}
                  </span>
                );
              })}
            </div>
          )}
        </div>
        <div className="rounded-2xl border border-white/5 bg-white/[0.03] p-5">
          <h3 className="mb-3 text-sm font-semibold text-slate-300">Top emojis</h3>
          {data.topEmojis.length === 0 ? (
            <p className="text-xs text-slate-500">No emojis yet.</p>
          ) : (
            <ul className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
              {data.topEmojis.map((e) => (
                <li
                  key={e.emoji}
                  className="flex items-center justify-between rounded-lg bg-white/5 px-3 py-1.5"
                >
                  <span className="text-2xl">{e.emoji}</span>
                  <span className="text-xs text-slate-400">{e.count.toLocaleString()}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </main>
  );
}

function FragmentRow({ label, row, max }: { label: string; row: number[]; max: number }) {
  return (
    <>
      <div className="pr-2 text-[10px] text-slate-500">{label}</div>
      {row.map((v, hi) => {
        const a = max ? v / max : 0;
        return (
          <div
            key={hi}
            title={`${label} ${hi}:00 — ${v} messages`}
            className="h-[14px] w-[14px] rounded-[3px]"
            style={{ background: `rgba(52, 211, 153, ${0.06 + a * 0.94})` }}
          />
        );
      })}
    </>
  );
}
