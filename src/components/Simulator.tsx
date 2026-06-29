import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MessageRow } from "@/lib/vault-db";
import { colorForName, fmtDate, fmtTime } from "@/lib/format";

const PAGE = 60;

export interface MessageSource {
  page: (beforeSeq: number | null, limit: number) => Promise<MessageRow[]>;
  all: () => Promise<MessageRow[]>;
  media?: (key: string) => Promise<string | null>;
}

interface LightboxImage {
  url: string;
  name: string;
  sender: string;
  ts: number;
}

export function Simulator({ source }: { source: MessageSource }) {
  const [msgs, setMsgs] = useState<MessageRow[]>([]);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<MessageRow[] | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [lightbox, setLightbox] = useState<LightboxImage | null>(null);
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
    const win = 40;
    const page = await source.page(seq + win + 1, PAGE * 2);
    setMsgs(page);
    setHasMore(true);
    requestAnimationFrame(() => {
      const el = document.querySelector(`[data-seq="${seq}"]`) as HTMLElement | null;
      el?.scrollIntoView({ block: "center" });
      el?.classList.add("ring-2", "ring-amber-300");
      setTimeout(() => el?.classList.remove("ring-2", "ring-amber-300"), 1600);
    });
  }

  const grouped = useMemo(() => groupByDay(msgs), [msgs]);

  return (
    <div className="relative flex h-[calc(100dvh-64px)] flex-col bg-[#0b141a]">
      {/* search bar */}
      <div className="border-b border-black/40 bg-[#1f2c33] px-3 py-2 md:px-5">
        <div className="mx-auto flex max-w-3xl items-center gap-2">
          <div className="flex w-full items-center gap-2 rounded-lg bg-[#2a3942] px-3 py-1.5">
            <svg viewBox="0 0 24 24" className="h-4 w-4 text-[#8696a0]" fill="none" stroke="currentColor" strokeWidth="2.2">
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.5-3.5" strokeLinecap="round" />
            </svg>
            <input
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setSearchOpen(true);
              }}
              onFocus={() => setSearchOpen(true)}
              placeholder="Search messages…"
              className="w-full bg-transparent text-sm text-[#e9edef] placeholder:text-[#8696a0] outline-none"
            />
            {query && (
              <button
                onClick={() => {
                  setQuery("");
                  setResults(null);
                }}
                className="text-xs text-[#8696a0] hover:text-[#e9edef]"
              >
                ✕
              </button>
            )}
          </div>
        </div>
        {searchOpen && results && (
          <div className="mx-auto mt-2 max-h-72 max-w-3xl overflow-auto rounded-xl border border-black/40 bg-[#111b21] shadow-2xl">
            {results.length === 0 ? (
              <div className="px-3 py-3 text-xs text-[#8696a0]">No matches.</div>
            ) : (
              results.map((r) => (
                <button
                  key={r.seq}
                  onClick={() => jumpTo(r.seq)}
                  className="block w-full border-b border-white/5 px-3 py-2 text-left text-xs hover:bg-white/[0.04]"
                >
                  <div className="text-[#8696a0]">
                    {r.sender} · {fmtDate(r.ts)} {fmtTime(r.ts)}
                  </div>
                  <div className="line-clamp-2 text-[#e9edef]">{highlight(r.body, query)}</div>
                </button>
              ))
            )}
          </div>
        )}
      </div>

      {/* chat doodle area */}
      <div
        ref={scrollerRef}
        onScroll={onScroll}
        className="wa-chat-bg flex-1 overflow-y-auto px-2 py-3 md:px-6"
      >
        <div className="mx-auto max-w-3xl">
          {loading && msgs.length === 0 && (
            <div className="grid place-items-center py-20 text-sm text-[#8696a0]">Loading…</div>
          )}
          {hasMore && msgs.length > 0 && (
            <div className="py-2 text-center text-[10px] uppercase tracking-wider text-[#8696a0]/60">
              {loading ? "Loading older…" : "Scroll up for older"}
            </div>
          )}
          {grouped.map((g) => (
            <div key={g.date}>
              <div className="my-3 flex items-center justify-center">
                <span className="rounded-md bg-[#1d282f] px-3 py-1 text-[11px] font-medium text-[#8696a0] shadow-sm">
                  {g.date}
                </span>
              </div>
              {g.items.map((m, i) => {
                const prev = g.items[i - 1];
                const next = g.items[i + 1];
                const groupStart = !prev || prev.sender !== m.sender || prev.kind === "system";
                const groupEnd = !next || next.sender !== m.sender || next.kind === "system";
                return (
                  <Bubble
                    key={m.seq}
                    m={m}
                    showName={!m.isMe && m.sender !== "__system__" && groupStart}
                    showTail={groupEnd}
                    tight={!groupStart}
                    getMedia={source.media}
                    onOpenImage={setLightbox}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* fake composer — read-only museum, but it looks the part */}
      <div className="border-t border-black/40 bg-[#1f2c33] px-3 py-2.5 md:px-5">
        <div className="mx-auto flex max-w-3xl items-center gap-2">
          <button className="grid h-9 w-9 place-items-center rounded-full text-[#8696a0] hover:bg-white/5" aria-label="emoji">
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor"><path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm-3.5 7a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3Zm7 0a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3ZM12 18a6 6 0 0 1-5.2-3h10.4A6 6 0 0 1 12 18Z"/></svg>
          </button>
          <div
            className="flex-1 cursor-not-allowed rounded-full bg-[#2a3942] px-4 py-2 text-sm text-[#8696a0]"
            title="This is a read-only archive"
          >
            Archive view · this chat is read-only
          </div>
          <button className="grid h-10 w-10 place-items-center rounded-full bg-[#00a884] text-white shadow-md" aria-label="send">
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor"><path d="M3 11.5 21 3l-8.5 18-2-7.5L3 11.5Z"/></svg>
          </button>
        </div>
      </div>

      {lightbox && <Lightbox img={lightbox} onClose={() => setLightbox(null)} />}
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

/* ---------------- emoji helpers ---------------- */
// Match Unicode emoji clusters (incl. ZWJ, skin tones, variation selectors).
const EMOJI_RE =
  /(\p{Extended_Pictographic}(?:\uFE0F|\u200D\p{Extended_Pictographic})*(?:[\u{1F3FB}-\u{1F3FF}])?)+/gu;

function isEmojiOnly(text: string): boolean {
  if (!text) return false;
  const stripped = text.replace(/\s+/g, "").replace(EMOJI_RE, "");
  return stripped.length === 0 && text.replace(/\s+/g, "").length > 0;
}

function emojiCount(text: string): number {
  const m = text.match(EMOJI_RE);
  if (!m) return 0;
  // Count clusters (rough — each match might be multiple)
  return m.reduce(
    (n, chunk) => n + Array.from(chunk.matchAll(/\p{Extended_Pictographic}/gu)).length,
    0,
  );
}

function renderWithEmoji(text: string) {
  // Wrap each emoji run in a span so it picks up the emoji font stack
  const parts: React.ReactNode[] = [];
  let i = 0;
  let k = 0;
  for (const m of text.matchAll(EMOJI_RE)) {
    const start = m.index ?? 0;
    if (start > i) parts.push(text.slice(i, start));
    parts.push(
      <span key={`e${k++}`} className="wa-emoji">
        {m[0]}
      </span>,
    );
    i = start + m[0].length;
  }
  if (i < text.length) parts.push(text.slice(i));
  return parts;
}

/* ---------------- bubble ---------------- */

function Bubble({
  m,
  showName,
  showTail,
  tight,
  getMedia,
  onOpenImage,
}: {
  m: MessageRow;
  showName: boolean;
  showTail: boolean;
  tight: boolean;
  getMedia?: (key: string) => Promise<string | null>;
  onOpenImage: (img: LightboxImage) => void;
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
        <span className="rounded-md bg-[#182229] px-3 py-1 text-[11px] text-[#8696a0] shadow-sm">
          {m.body || "—"}
        </span>
      </div>
    );
  }

  const mine = m.isMe;

  // Stickers float without a bubble (WhatsApp behavior)
  if (m.kind === "sticker") {
    return (
      <div
        data-seq={m.seq}
        className={`my-1 flex ${mine ? "justify-end" : "justify-start"} ${tight ? "mt-0.5" : ""}`}
      >
        <div className="flex flex-col items-end gap-0.5">
          {mediaUrl ? (
            <img
              src={mediaUrl}
              alt="sticker"
              className="h-auto w-[120px] cursor-pointer select-none transition hover:scale-[1.03] sm:w-[140px]"
              loading="lazy"
              onClick={() =>
                onOpenImage({
                  url: mediaUrl,
                  name: m.mediaName || "sticker.webp",
                  sender: m.sender,
                  ts: m.ts,
                })
              }
            />
          ) : (
            <div className="grid h-[120px] w-[120px] place-items-center rounded-xl bg-[#1f2c33] text-[10px] text-[#8696a0]">
              sticker
            </div>
          )}
          <span className="px-1 text-[10px] text-[#8696a0]">{fmtTime(m.ts)}</span>
        </div>
      </div>
    );
  }

  const bodyEmojiOnly = m.body && isEmojiOnly(m.body) && emojiCount(m.body) <= 3;

  // "Jumbomoji" — large emoji-only messages without a bubble background
  if (bodyEmojiOnly && !mediaUrl && m.kind === "text") {
    return (
      <div
        data-seq={m.seq}
        className={`my-1 flex ${mine ? "justify-end" : "justify-start"} ${tight ? "mt-0.5" : ""}`}
      >
        <div className="flex flex-col items-end">
          <span className="wa-emoji text-[40px] leading-none sm:text-[52px]">{m.body}</span>
          <span className="mt-1 px-1 text-[10px] text-[#8696a0]">{fmtTime(m.ts)}</span>
        </div>
      </div>
    );
  }

  const bubbleBg = mine ? "bg-[#005c4b]" : "bg-[#202c33]";
  const radii = `${mine ? "rounded-l-2xl rounded-tr-2xl" : "rounded-r-2xl rounded-tl-2xl"} ${
    showTail ? (mine ? "rounded-br-md" : "rounded-bl-md") : mine ? "rounded-br-2xl" : "rounded-bl-2xl"
  }`;

  return (
    <div
      data-seq={m.seq}
      className={`flex ${mine ? "justify-end" : "justify-start"} ${tight ? "mt-0.5" : "mt-1.5"}`}
    >
      <div className={`relative max-w-[85%] sm:max-w-[70%] ${bubbleBg} ${radii} px-[7px] pt-[6px] pb-[4px] text-[14.2px] text-[#e9edef] shadow-[0_1px_0.5px_rgba(0,0,0,0.13)]`}>
        {showTail && (
          <span
            className={`absolute top-0 ${mine ? "-right-[7px]" : "-left-[7px]"} h-[13px] w-[8px]`}
            style={{
              background: mine ? "#005c4b" : "#202c33",
              clipPath: mine
                ? "polygon(0 0, 0% 100%, 100% 0)"
                : "polygon(0 0, 100% 100%, 100% 0)",
            }}
          />
        )}

        {showName && (
          <div
            className="mb-0.5 px-1 text-[13px] font-medium leading-tight"
            style={{ color: colorForName(m.sender) }}
          >
            {m.sender}
          </div>
        )}

        {m.kind === "image" && (
          mediaUrl ? (
            <button
              type="button"
              onClick={() =>
                onOpenImage({
                  url: mediaUrl,
                  name: m.mediaName || "image.jpg",
                  sender: m.sender,
                  ts: m.ts,
                })
              }
              className="mb-1 block overflow-hidden rounded-lg"
            >
              <img
                src={mediaUrl}
                alt=""
                className="max-h-[320px] w-full max-w-[280px] cursor-zoom-in object-cover transition hover:brightness-95"
                loading="lazy"
              />
            </button>
          ) : (
            <MediaPlaceholder kind="📷 Photo" name={m.mediaName} mine={mine} />
          )
        )}

        {m.kind === "video" && (mediaUrl ? (
          <video src={mediaUrl} controls className="mb-1 max-h-[320px] max-w-[280px] rounded-lg" />
        ) : (
          <MediaPlaceholder kind="🎬 Video" name={m.mediaName} mine={mine} />
        ))}

        {m.kind === "audio" && (mediaUrl ? (
          <audio src={mediaUrl} controls className="mb-1 w-full min-w-[220px]" />
        ) : (
          <MediaPlaceholder kind="🎙 Voice message" name={m.mediaName} mine={mine} />
        ))}

        {m.kind === "deleted" ? (
          <span className="flex items-center gap-1 px-1 italic text-[#8696a0]">
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="currentColor"><path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2Zm5 11H7v-2h10Z"/></svg>
            This message was deleted
          </span>
        ) : (
          m.body && (
            <span className="block whitespace-pre-wrap break-words px-1 pr-12">
              {renderWithEmoji(m.body)}
            </span>
          )
        )}

        <div className="float-right -mt-1 ml-2 flex translate-y-1 items-center gap-1 pr-0.5 text-[11px] text-[#8696a0]">
          {m.edited && <span className="italic">edited</span>}
          <span>{fmtTime(m.ts)}</span>
          {mine && (
            <svg viewBox="0 0 16 11" className="h-[11px] w-[16px] text-[#53bdeb]" fill="currentColor">
              <path d="M11.071.653a.483.483 0 0 0-.71 0l-5.428 5.45-2.29-2.299a.483.483 0 0 0-.71 0l-.71.713a.5.5 0 0 0 0 .714l3.354 3.367a.483.483 0 0 0 .71 0l6.494-6.518a.5.5 0 0 0 0-.714l-.71-.713Zm4.236 0a.483.483 0 0 0-.71 0L9.169 6.103 8.46 5.39a.483.483 0 0 0-.71 0l-.71.713a.5.5 0 0 0 0 .714l1.773 1.78a.483.483 0 0 0 .71 0l6.494-6.517a.5.5 0 0 0 0-.714l-.71-.713Z"/>
            </svg>
          )}
        </div>
        <div className="clear-both" />
      </div>
    </div>
  );
}

function MediaPlaceholder({ kind, name, mine }: { kind: string; name: string | null; mine: boolean }) {
  return (
    <div
      className={`mb-1 flex items-center gap-2 rounded-lg px-2.5 py-2 text-[12px] ${
        mine ? "bg-black/15 text-[#cfe9d8]" : "bg-black/25 text-[#cfd5d9]"
      }`}
    >
      <span className="font-medium">{kind}</span>
      {name && <span className="truncate opacity-70">· {name}</span>}
      <span className="ml-auto opacity-60">not in archive</span>
    </div>
  );
}

/* ---------------- lightbox ---------------- */

function Lightbox({ img, onClose }: { img: LightboxImage; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  async function save() {
    try {
      const res = await fetch(img.url);
      const blob = await res.blob();
      const a = document.createElement("a");
      const u = URL.createObjectURL(blob);
      a.href = u;
      a.download = img.name || "image";
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(u), 1000);
    } catch {
      window.open(img.url, "_blank");
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-black/95" onClick={onClose}>
      <div
        className="flex items-center justify-between px-4 py-3 text-[#e9edef]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="min-w-0">
          <div className="truncate text-sm font-medium" style={{ color: colorForName(img.sender) }}>
            {img.sender}
          </div>
          <div className="text-[11px] text-[#8696a0]">
            {fmtDate(img.ts)} · {fmtTime(img.ts)}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={save}
            className="flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-xs font-medium hover:bg-white/20"
            aria-label="Save"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 4v12m0 0-4-4m4 4 4-4M4 20h16" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Save
          </button>
          <button
            onClick={onClose}
            className="grid h-9 w-9 place-items-center rounded-full bg-white/10 hover:bg-white/20"
            aria-label="Close"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M6 6l12 12M6 18 18 6" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      </div>
      <div className="grid flex-1 place-items-center px-4 pb-6" onClick={onClose}>
        <img
          src={img.url}
          alt=""
          className="max-h-full max-w-full rounded-lg object-contain"
          onClick={(e) => e.stopPropagation()}
        />
      </div>
    </div>
  );
}
