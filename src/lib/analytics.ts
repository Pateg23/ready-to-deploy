import type { MessageRow } from "./vault-db";

const EMOJI_RE =
  /[\u{1F1E0}-\u{1F1FF}\u{1F300}-\u{1F5FF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{1F700}-\u{1F77F}\u{1F780}-\u{1F7FF}\u{1F800}-\u{1F8FF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu;

const STOP = new Set(
  "the a an and or but if then so to of in on at by for from with is are was were be been being have has had do does did i you he she it we they me him her them my your our their this that these those not no yes ok okay just like get got go going gonna im ive yeah ya u r ur".split(
    " ",
  ),
);

export interface Analytics {
  totals: { messages: number; words: number; media: number; avgResponseSec: number };
  perDay: { date: string; count: number }[];
  heatmap: number[][]; // [7][24]
  heatmapMax: number;
  participants: { name: string; count: number; pct: number }[];
  topWords: { word: string; count: number }[];
  topEmojis: { emoji: string; count: number }[];
}

export function computeAnalytics(msgs: MessageRow[]): Analytics {
  let totalWords = 0;
  let media = 0;
  const perDay = new Map<string, number>();
  const heat: number[][] = Array.from({ length: 7 }, () => Array(24).fill(0));
  const words = new Map<string, number>();
  const emojis = new Map<string, number>();
  const parts = new Map<string, number>();
  const deltas: number[] = [];
  let lastSender: string | null = null;
  let lastTs = 0;

  for (const m of msgs) {
    if (m.mediaKey || m.kind === "image" || m.kind === "video" || m.kind === "sticker" || m.kind === "audio")
      media++;
    if (m.body) {
      const ws = m.body.split(/\s+/);
      totalWords += ws.length;
      for (const w of ws) {
        const cw = w.replace(/^[\W_]+|[\W_]+$/gu, "").toLowerCase();
        if (cw.length > 2 && !cw.startsWith("http") && !STOP.has(cw)) {
          words.set(cw, (words.get(cw) || 0) + 1);
        }
      }
      const em = m.body.match(EMOJI_RE);
      if (em) for (const e of em) emojis.set(e, (emojis.get(e) || 0) + 1);
    }
    const d = new Date(m.ts);
    if (!isNaN(d.getTime())) {
      const ds = d.toISOString().slice(0, 10);
      perDay.set(ds, (perDay.get(ds) || 0) + 1);
      heat[d.getDay()][d.getHours()]++;
    }
    if (m.sender && m.sender !== "__system__") {
      parts.set(m.sender, (parts.get(m.sender) || 0) + 1);
      if (lastSender && m.sender !== lastSender) {
        const dt = (m.ts - lastTs) / 1000;
        if (dt > 0 && dt < 24 * 3600) deltas.push(dt);
      }
      lastSender = m.sender;
      lastTs = m.ts;
    }
  }
  const pTotal = [...parts.values()].reduce((a, b) => a + b, 0) || 1;
  const participants = [...parts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([name, count]) => ({ name, count, pct: Math.round((count * 1000) / pTotal) / 10 }));
  const avg = deltas.length ? deltas.reduce((a, b) => a + b, 0) / deltas.length : 0;
  const heatmapMax = Math.max(...heat.flat(), 0);
  return {
    totals: {
      messages: msgs.length,
      words: totalWords,
      media,
      avgResponseSec: avg,
    },
    perDay: [...perDay.entries()].sort().map(([date, count]) => ({ date, count })),
    heatmap: heat,
    heatmapMax,
    participants,
    topWords: [...words.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 60)
      .map(([word, count]) => ({ word, count })),
    topEmojis: [...emojis.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 30)
      .map(([emoji, count]) => ({ emoji, count })),
  };
}
