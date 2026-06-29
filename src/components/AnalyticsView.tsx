import type { Analytics } from "@/lib/analytics";
import { colorForName, initials, fmtDate, fmtDuration } from "@/lib/format";

export function AnalyticsView({ data, title }: { data: Analytics; title: string }) {
  const t = data.totals;
  const maxDay = Math.max(...data.perDay.map((d) => d.count), 1);
  const maxMonth = Math.max(...data.perMonth.map((d) => d.count), 1);
  const maxWeekday = Math.max(...data.perWeekday, 1);
  const maxHour = Math.max(...data.perHour, 1);
  const maxWord = data.topWords[0]?.count || 1;
  const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const span =
    data.firstTs && data.lastTs
      ? Math.max(1, Math.round((data.lastTs - data.firstTs) / 86400000))
      : 0;

  function heatColor(v: number) {
    if (!v) return "rgba(255,255,255,0.04)";
    const a = Math.min(1, v / (data.heatmapMax || 1));
    const l = 0.45 + a * 0.35;
    const c = 0.08 + a * 0.15;
    return `oklch(${l} ${c} 165)`;
  }

  // donut math
  const C = 2 * Math.PI * 56;
  let donutOff = 0;
  const donutSegs = data.participants.slice(0, 8).map((p) => {
    const len = (p.count / Math.max(1, t.messages)) * C;
    const seg = { len, off: donutOff, color: colorForName(p.name), name: p.name };
    donutOff += len;
    return seg;
  });

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      {/* HERO */}
      <section className="overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-emerald-500/10 via-cyan-500/5 to-transparent p-6 sm:p-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="text-[11px] uppercase tracking-[0.2em] text-emerald-300/80">
              Analytics report
            </div>
            <h2 className="mt-1 text-3xl font-semibold tracking-tight">{title}</h2>
            <p className="mt-1 text-sm text-slate-400">
              {t.messages.toLocaleString()} messages · {data.participants.length}{" "}
              {data.participants.length === 1 ? "person" : "people"} · {span} day span
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
            <HeroPill label="Days active" value={t.daysActive.toLocaleString()} />
            <HeroPill label="Longest streak" value={`${t.longestStreak}d`} />
            <HeroPill label="Avg reply" value={fmtDuration(t.avgResponseSec)} />
            <HeroPill label="Avg length" value={`${t.avgMsgLen} ch`} />
          </div>
        </div>
      </section>

      {/* KPIs */}
      <section className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi label="Messages" value={t.messages.toLocaleString()} from="from-emerald-400" to="to-cyan-500" />
        <Kpi label="Words" value={t.words.toLocaleString()} from="from-violet-400" to="to-fuchsia-500" />
        <Kpi label="Media" value={t.media.toLocaleString()} from="from-amber-400" to="to-orange-500" />
        <Kpi label="Links shared" value={t.links.toLocaleString()} from="from-sky-400" to="to-blue-500" />
      </section>

      <section className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi label="Questions asked" value={t.questions.toLocaleString()} from="from-pink-400" to="to-rose-500" subtle />
        <Kpi label="Laughs (lol/haha)" value={t.laughs.toLocaleString()} from="from-yellow-300" to="to-amber-500" subtle />
        <Kpi
          label="Busiest hour"
          value={`${String(data.busiestHour).padStart(2, "0")}:00`}
          from="from-teal-400"
          to="to-emerald-500"
          subtle
        />
        <Kpi
          label="Busiest day"
          value={data.busiestDay ? `${data.busiestDay.count}` : "—"}
          sub={data.busiestDay ? fmtDate(Date.parse(data.busiestDay.date)) : ""}
          from="from-indigo-400"
          to="to-violet-500"
          subtle
        />
      </section>

      {/* Heatmap + Donut */}
      <section className="mt-5 grid gap-4 lg:grid-cols-3">
        <Card title="Activity heatmap" subtitle="Day of week × hour of day" className="lg:col-span-2">
          <div className="overflow-x-auto">
            <div
              className="inline-grid items-center gap-[3px]"
              style={{ gridTemplateColumns: "auto repeat(24, minmax(14px, 1fr))" }}
            >
              <div />
              {Array.from({ length: 24 }, (_, h) => (
                <div key={h} className="text-center text-[9px] text-slate-500">
                  {h % 3 === 0 ? h : ""}
                </div>
              ))}
              {DAYS.map((d, di) => (
                <FragmentRow key={d} label={d} row={data.heatmap[di]} heatColor={heatColor} />
              ))}
            </div>
          </div>
          <div className="mt-3 flex items-center gap-2 text-[10px] text-slate-400">
            Less
            {[0.15, 0.35, 0.55, 0.8, 1].map((a, i) => (
              <span
                key={i}
                className="h-3 w-3 rounded-[3px]"
                style={{ background: heatColor((data.heatmapMax || 1) * a) }}
              />
            ))}
            More · peak {data.heatmapMax} msgs
          </div>
        </Card>

        <Card title="Who talks the most" subtitle={`${data.participants.length} participants`}>
          <div className="grid place-items-center py-2">
            <div className="relative">
              <svg width="160" height="160" viewBox="0 0 140 140" style={{ transform: "rotate(-90deg)" }}>
                <circle r="56" cx="70" cy="70" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="18" />
                {donutSegs.map((s, i) => (
                  <circle
                    key={i}
                    r="56"
                    cx="70"
                    cy="70"
                    fill="none"
                    stroke={s.color}
                    strokeWidth="18"
                    strokeDasharray={`${s.len} ${C - s.len}`}
                    strokeDashoffset={-s.off}
                  />
                ))}
              </svg>
              <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
                <div>
                  <div className="text-xl font-semibold">{t.messages.toLocaleString()}</div>
                  <div className="text-[10px] uppercase tracking-wider text-slate-500">msgs</div>
                </div>
              </div>
            </div>
          </div>
          <ul className="mt-2 space-y-2">
            {data.participants.slice(0, 6).map((p) => (
              <li key={p.name} className="flex items-center gap-2 text-xs">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: colorForName(p.name) }} />
                <span className="min-w-0 flex-1 truncate text-slate-200">{p.name}</span>
                <span className="text-slate-400">{p.pct}%</span>
              </li>
            ))}
          </ul>
        </Card>
      </section>

      {/* Participants detail */}
      <section className="mt-5">
        <Card title="Participants leaderboard">
          <ul className="space-y-3">
            {data.participants.map((p, i) => (
              <li key={p.name} className="flex items-center gap-3">
                <span className="w-5 text-right text-xs text-slate-500">{i + 1}</span>
                <div
                  className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-xs font-semibold text-white shadow"
                  style={{ background: colorForName(p.name) }}
                >
                  {initials(p.name)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline justify-between gap-2 text-xs">
                    <span className="truncate font-medium text-slate-100">{p.name}</span>
                    <span className="text-slate-400">
                      {p.count.toLocaleString()} msgs · {p.words.toLocaleString()} words · ⌀{p.avgLen}ch · {p.media} media
                    </span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/5">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${p.pct}%`, background: colorForName(p.name) }}
                    />
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      </section>

      {/* Per-day + per-month + weekday + hour */}
      <section className="mt-5 grid gap-4 lg:grid-cols-2">
        <Card title="Messages per day" subtitle={`${data.perDay.length} active days`}>
          <div className="flex h-40 items-end gap-[2px] overflow-x-auto">
            {data.perDay.map((d) => (
              <div
                key={d.date}
                title={`${d.date} — ${d.count}`}
                className="w-1 shrink-0 rounded-sm bg-gradient-to-t from-emerald-500 to-cyan-300 transition hover:brightness-125"
                style={{ height: `${(d.count / maxDay) * 100}%` }}
              />
            ))}
          </div>
          <div className="mt-2 flex justify-between text-[10px] text-slate-500">
            <span>{data.perDay[0]?.date}</span>
            <span>{data.perDay[data.perDay.length - 1]?.date}</span>
          </div>
        </Card>

        <Card title="Messages per month">
          <div className="flex h-40 items-end gap-2 overflow-x-auto">
            {data.perMonth.map((m) => (
              <div key={m.month} className="flex flex-col items-center gap-1">
                <div
                  title={`${m.month} — ${m.count}`}
                  className="w-7 rounded-md bg-gradient-to-t from-violet-500 to-fuchsia-400 transition hover:brightness-125"
                  style={{ height: `${(m.count / maxMonth) * 120 + 6}px` }}
                />
                <span className="text-[9px] text-slate-500">{m.month.slice(2)}</span>
              </div>
            ))}
          </div>
        </Card>

        <Card title="By weekday">
          <div className="grid grid-cols-7 gap-2 text-center">
            {DAYS.map((d, i) => (
              <div key={d} className="flex flex-col items-center gap-1">
                <div className="flex h-32 w-full items-end justify-center">
                  <div
                    className="w-full rounded-md bg-gradient-to-t from-amber-500 to-yellow-300"
                    style={{ height: `${(data.perWeekday[i] / maxWeekday) * 100}%` }}
                    title={`${d} — ${data.perWeekday[i]}`}
                  />
                </div>
                <span className="text-[10px] text-slate-400">{d}</span>
                <span className="text-[10px] font-semibold text-slate-200">
                  {data.perWeekday[i].toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        </Card>

        <Card title="By hour of day">
          <div className="flex h-32 items-end gap-[2px]">
            {data.perHour.map((v, h) => (
              <div key={h} className="flex flex-1 flex-col items-center gap-0.5">
                <div
                  title={`${h}:00 — ${v}`}
                  className="w-full rounded-sm bg-gradient-to-t from-sky-500 to-cyan-300"
                  style={{ height: `${(v / maxHour) * 100}%` }}
                />
              </div>
            ))}
          </div>
          <div className="mt-1 flex justify-between text-[9px] text-slate-500">
            {[0, 6, 12, 18, 23].map((h) => (
              <span key={h}>{String(h).padStart(2, "0")}</span>
            ))}
          </div>
        </Card>
      </section>

      {/* Response times */}
      {data.responseTimes.length > 1 && (
        <section className="mt-5">
          <Card title="Response time per person" subtitle="Median time to reply after the other person">
            <ul className="space-y-2">
              {data.responseTimes.map((r) => {
                const max = Math.max(...data.responseTimes.map((x) => x.medianSec), 1);
                return (
                  <li key={r.name} className="flex items-center gap-3 text-xs">
                    <span
                      className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-[10px] font-semibold text-white"
                      style={{ background: colorForName(r.name) }}
                    >
                      {initials(r.name)}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-slate-200">{r.name}</span>
                    <div className="h-1.5 w-32 overflow-hidden rounded-full bg-white/5">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${(r.medianSec / max) * 100}%`,
                          background: colorForName(r.name),
                        }}
                      />
                    </div>
                    <span className="w-16 text-right text-slate-400">{fmtDuration(r.medianSec)}</span>
                  </li>
                );
              })}
            </ul>
          </Card>
        </section>
      )}

      {/* Words + emojis */}
      <section className="mt-5 grid gap-4 lg:grid-cols-2">
        <Card title="Top words">
          {data.topWords.length === 0 ? (
            <p className="text-xs text-slate-500">Nothing notable.</p>
          ) : (
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-2">
              {data.topWords.slice(0, 50).map((w, i) => {
                const size = 0.8 + (w.count / maxWord) * 1.4;
                const hue = (i * 47) % 360;
                return (
                  <span
                    key={w.word}
                    style={{ fontSize: `${size}rem`, color: `oklch(0.8 0.12 ${hue})` }}
                    title={`${w.count}`}
                    className="transition hover:brightness-125"
                  >
                    {w.word}
                  </span>
                );
              })}
            </div>
          )}
        </Card>
        <Card title="Top emojis">
          {data.topEmojis.length === 0 ? (
            <p className="text-xs text-slate-500">No emojis yet.</p>
          ) : (
            <ul className="grid grid-cols-3 gap-2 text-sm sm:grid-cols-4">
              {data.topEmojis.slice(0, 16).map((e) => (
                <li
                  key={e.emoji}
                  className="flex items-center justify-between rounded-xl bg-white/5 px-3 py-2"
                >
                  <span className="text-2xl">{e.emoji}</span>
                  <span className="text-xs text-slate-400">{e.count.toLocaleString()}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </section>
    </main>
  );
}

function HeroPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2">
      <div className="text-[10px] uppercase tracking-wider text-slate-500">{label}</div>
      <div className="mt-0.5 font-semibold">{value}</div>
    </div>
  );
}

function Kpi({
  label,
  value,
  sub,
  from,
  to,
  subtle,
}: {
  label: string;
  value: string;
  sub?: string;
  from: string;
  to: string;
  subtle?: boolean;
}) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-white/5 bg-white/[0.03] p-4">
      <div className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${from} ${to}`} />
      <div className="text-[10px] uppercase tracking-wider text-slate-500">{label}</div>
      <div className={`mt-1 font-semibold tracking-tight ${subtle ? "text-xl" : "text-2xl"}`}>
        {value}
      </div>
      {sub && <div className="mt-0.5 text-[10px] text-slate-500">{sub}</div>}
    </div>
  );
}

function Card({
  title,
  subtitle,
  children,
  className = "",
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`rounded-2xl border border-white/5 bg-white/[0.03] p-5 ${className}`}>
      <div className="mb-3">
        <h3 className="text-sm font-semibold text-slate-100">{title}</h3>
        {subtitle && <p className="text-[11px] text-slate-500">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}

function FragmentRow({
  label,
  row,
  heatColor,
}: {
  label: string;
  row: number[];
  heatColor: (v: number) => string;
}) {
  return (
    <>
      <div className="pr-2 text-[10px] text-slate-500">{label}</div>
      {row.map((v, hi) => (
        <div
          key={hi}
          title={`${label} ${hi}:00 — ${v} messages`}
          className="aspect-square min-h-[14px] rounded-[3px] transition hover:scale-125"
          style={{ background: heatColor(v) }}
        />
      ))}
    </>
  );
}
