import type { MessageRow } from "./vault-db";

const EMOJI_RE =
  /[\u{1F1E0}-\u{1F1FF}\u{1F300}-\u{1F5FF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{1F700}-\u{1F77F}\u{1F780}-\u{1F7FF}\u{1F800}-\u{1F8FF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu;

const STOP = new Set(
  "the a an and or but if then so to of in on at by for from with is are was were be been being have has had do does did i you he she it we they me him her them my your our their this that these those not no yes ok okay just like get got go going gonna im ive yeah ya u r ur".split(
    " ",
  ),
);

export interface Analytics {
  totals: {
    messages: number;
    words: number;
    media: number;
    avgResponseSec: number;
    avgMsgLen: number;
    daysActive: number;
    longestStreak: number;
    questions: number;
    laughs: number;
    links: number;
  };
  perDay: { date: string; count: number }[];
  perMonth: { month: string; count: number }[];
  perWeekday: number[]; // [7] starting Mon
  perHour: number[]; // [24]
  heatmap: number[][]; // [7][24] Mon-Sun
  heatmapMax: number;
  participants: {
    name: string;
    count: number;
    pct: number;
    words: number;
    avgLen: number;
    media: number;
  }[];
  topWords: { word: string; count: number }[];
  topEmojis: { emoji: string; count: number }[];
  busiestDay: { date: string; count: number } | null;
  busiestHour: number;
  firstTs: number;
  lastTs: number;
  responseTimes: { name: string; avgSec: number; medianSec: number }[];
}

function median(arr: number[]) {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export function computeAnalytics(msgs: MessageRow[]): Analytics {
  let totalWords = 0;
  let media = 0;
  let questions = 0;
  let laughs = 0;
  let links = 0;
  let lenSum = 0;
  let lenCount = 0;
  const perDay = new Map<string, number>();
  const perMonth = new Map<string, number>();
  const perWeekday = Array(7).fill(0);
  const perHour = Array(24).fill(0);
  // Heatmap: Mon..Sun
  const heat: number[][] = Array.from({ length: 7 }, () => Array(24).fill(0));
  const words = new Map<string, number>();
  const emojis = new Map<string, number>();
  interface P {
    count: number;
    words: number;
    lenSum: number;
    media: number;
    deltas: number[];
  }
  const parts = new Map<string, P>();
  let lastSender: string | null = null;
  let lastTs = 0;
  const URL_RE = /\bhttps?:\/\/\S+/gi;
  const LAUGH_RE = /\b(lol|lmao|haha+|hehe+|rofl|xd|jaja+)\b/gi;

  for (const m of msgs) {
    if (m.mediaKey || m.kind === "image" || m.kind === "video" || m.kind === "sticker" || m.kind === "audio")
      media++;
    if (m.body) {
      const ws = m.body.split(/\s+/).filter(Boolean);
      totalWords += ws.length;
      lenSum += m.body.length;
      lenCount++;
      if (/\?/.test(m.body)) questions++;
      const lm = m.body.match(LAUGH_RE);
      if (lm) laughs += lm.length;
      const um = m.body.match(URL_RE);
      if (um) links += um.length;
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
      const ms = ds.slice(0, 7);
      perMonth.set(ms, (perMonth.get(ms) || 0) + 1);
      // JS getDay: 0=Sun..6=Sat. Convert to Mon..Sun (0..6)
      const wd = (d.getDay() + 6) % 7;
      perWeekday[wd]++;
      perHour[d.getHours()]++;
      heat[wd][d.getHours()]++;
    }
    if (m.sender && m.sender !== "__system__") {
      const p =
        parts.get(m.sender) ||
        { count: 0, words: 0, lenSum: 0, media: 0, deltas: [] as number[] };
      p.count++;
      if (m.body) {
        p.words += m.body.split(/\s+/).filter(Boolean).length;
        p.lenSum += m.body.length;
      }
      if (m.mediaKey || ["image", "video", "audio", "sticker"].includes(m.kind)) p.media++;
      parts.set(m.sender, p);

      if (lastSender && m.sender !== lastSender) {
        const dt = (m.ts - lastTs) / 1000;
        if (dt > 0 && dt < 24 * 3600) {
          p.deltas.push(dt);
        }
      }
      lastSender = m.sender;
      lastTs = m.ts;
    }
  }

  const pTotal = [...parts.values()].reduce((a, b) => a + b.count, 0) || 1;
  const participants = [...parts.entries()]
    .sort((a, b) => b[1].count - a[1].count)
    .map(([name, p]) => ({
      name,
      count: p.count,
      pct: Math.round((p.count * 1000) / pTotal) / 10,
      words: p.words,
      avgLen: p.count ? Math.round(p.lenSum / p.count) : 0,
      media: p.media,
    }));

  const responseTimes = [...parts.entries()]
    .map(([name, p]) => ({
      name,
      avgSec: p.deltas.length ? p.deltas.reduce((a, b) => a + b, 0) / p.deltas.length : 0,
      medianSec: median(p.deltas),
    }))
    .sort((a, b) => a.medianSec - b.medianSec);

  const allDeltas: number[] = [];
  for (const p of parts.values()) for (const d of p.deltas) allDeltas.push(d);
  const avg = allDeltas.length ? allDeltas.reduce((a, b) => a + b, 0) / allDeltas.length : 0;

  const perDayArr = [...perDay.entries()].sort().map(([date, count]) => ({ date, count }));
  const perMonthArr = [...perMonth.entries()].sort().map(([month, count]) => ({ month, count }));

  // longest consecutive day streak
  let longestStreak = 0;
  let cur = 0;
  let prev: number | null = null;
  for (const { date } of perDayArr) {
    const t = Date.parse(date);
    if (prev !== null && t - prev === 86400000) cur++;
    else cur = 1;
    if (cur > longestStreak) longestStreak = cur;
    prev = t;
  }

  let busiestDay = perDayArr[0] || null;
  for (const d of perDayArr) if (!busiestDay || d.count > busiestDay.count) busiestDay = d;

  let busiestHour = 0;
  for (let h = 1; h < 24; h++) if (perHour[h] > perHour[busiestHour]) busiestHour = h;

  return {
    totals: {
      messages: msgs.length,
      words: totalWords,
      media,
      avgResponseSec: avg,
      avgMsgLen: lenCount ? Math.round(lenSum / lenCount) : 0,
      daysActive: perDay.size,
      longestStreak,
      questions,
      laughs,
      links,
    },
    perDay: perDayArr,
    perMonth: perMonthArr,
    perWeekday,
    perHour,
    heatmap: heat,
    heatmapMax: Math.max(...heat.flat(), 0),
    participants,
    topWords: [...words.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 60)
      .map(([word, count]) => ({ word, count })),
    topEmojis: [...emojis.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 30)
      .map(([emoji, count]) => ({ emoji, count })),
    busiestDay,
    busiestHour,
    firstTs: msgs[0]?.ts || 0,
    lastTs: msgs[msgs.length - 1]?.ts || 0,
    responseTimes,
  };
}
