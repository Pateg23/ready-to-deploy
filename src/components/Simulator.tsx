import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MessageRow } from "@/lib/vault-db";
import { colorForName, fmtDate, fmtTime } from "@/lib/format";

const PAGE = 60;

export interface MessageSource {
  page: (beforeSeq: number | null, limit: number) => Promise<MessageRow[]>;
  all: () => Promise<MessageRow[]>;
  media?: (key: string) => Promise<string | null>;
}

export function Simulator({ source }: { source: MessageSource }) {
  const [msgs, setMsgs] = useState<MessageRow[]>([]);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<MessageRow[] | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const scrollerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancel = false;
    (async () => {
      setLoading(true);
      const page = await source.page(null, PAGE);
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
  }, [source]);

  const loadOlder = useCallback(async () => {
    if (loading || !hasMore || msgs.length === 0) return;
    setLoading(true);
    const el = scrollerRef.current!;
    const prevH = el.scrollHeight;
    const page = await source.page(msgs[0].seq, PAGE);
    setMsgs((m) => [...page, ...m]);
    setHasMore(page.length === PAGE);
    setLoading(false);
    requestAnimationFrame(() => {
      el.scrollTop = el.scrollHeight - prevH;
    });
  }, [hasMore, loading, msgs, source]);

  function onScroll(e: React.UIEvent<HTMLDivElement>) {
    if (e.currentTarget.scrollTop < 200) loadOlder();
  }

  useEffect(() => {
    if (!query.trim()) {
      setResults(null);
      return;
    }
    let cancel = false;
    const handle = setTimeout(async () => {
      const all = await source.all();
      if (cancel) return;
      const q = query.toLowerCase();
      setResults(all.filter((m) => m.body && m.body.toLowerCase().includes(q)).slice(0, 200));
    }, 200);
    return () => {
      cancel = true;
      clearTimeout(handle);
    };
  }, [query, source]);

  async function jumpTo(seq: number) {
    setSearchOpen(false);
    setQuery("");
    setResults(null);
    const window = 40;
    const page = await source.page(seq + window + 1, PAGE * 2);
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
      <div className="border-b border-white/5 bg-white/[0.02] px-4 py-2 backdrop-blur">
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
              <span className="rounded-full bg-black/40 px-3 py-1 text-[10px] uppercase tracking-wider text-slate-300 ring-1 ring-white/5">
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
                getMedia={source.media}
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

function Bubble({
  m,
  showName,
  getMedia,
}: {
  m: MessageRow;
  showName: boolean;
  getMedia?: (key: string) => Promise<string | null>;
}) {
  const [mediaUrl, setMediaUrl] = useState<string | null>(null);
  useEffect(() => {
    let url: string | null = null;
    let cancel = false;
    if (m.mediaKey && getMedia) {
      getMedia(m.mediaKey).then((u) => {
        if (cancel) return;
        url = u;
        setMediaUrl(u);
      });
    }
    return () => {
      cancel = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [m.mediaKey, getMedia]);

  if (m.sender === "__system__" || m.kind === "system") {
    return (
      <div data-seq={m.seq} className="my-2 flex justify-center">
        <span className="rounded-md bg-black/40 px-3 py-1 text-[11px] text-slate-400 ring-1 ring-white/5">
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
          <img src={mediaUrl} alt="" className="mb-1 max-h-80 rounded-lg object-cover" loading="lazy" />
        )}
        {m.kind === "sticker" && mediaUrl && (
          <img src={mediaUrl} alt="" className="mb-1 max-h-40" loading="lazy" />
        )}
        {m.kind === "video" && mediaUrl && (
          <video src={mediaUrl} controls className="mb-1 max-h-80 rounded-lg" />
        )}
        {m.kind === "audio" && mediaUrl && <audio src={mediaUrl} controls className="mb-1 w-full" />}
        {!mediaUrl &&
          (m.kind === "image" || m.kind === "video" || m.kind === "audio" || m.kind === "sticker") && (
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
