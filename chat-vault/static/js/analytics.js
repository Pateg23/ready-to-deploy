import App from "./app.js";

App.route("/analytics/:id", async (params) => {
  const chatId = params.id;
  App.root.innerHTML = `<div class="boot"><div class="spinner"></div></div>`;
  let chat = null, data = null;
  try {
    [chat, data] = await Promise.all([
      App.api(`/api/chats/${chatId}`),
      App.api(`/api/analytics/${chatId}`),
    ]);
  } catch (e) { App.toast(e.message, "error"); App.navigate("/library"); return; }

  const t = data.totals;
  const heatMax = data.heatmap_max || 1;
  const perDayMax = data.per_day.reduce((m, d) => Math.max(m, d.count), 1);
  const DAY_LBL = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  function heatColor(v) {
    if (!v) return "var(--panel-muted)";
    const ratio = Math.min(1, v / heatMax);
    const l = 0.25 + ratio * 0.45;
    return `oklch(${l} ${0.05 + ratio * 0.12} 160)`;
  }

  function svgDonut(parts, total) {
    const r = 56, C = 2 * Math.PI * r;
    let offset = 0;
    const segs = parts.map((p, i) => {
      const len = (p.count / (total || 1)) * C;
      const hue = App.hueFor(p.name);
      const seg = `<circle r="${r}" cx="70" cy="70" fill="none" stroke="oklch(0.6 0.16 ${hue})" stroke-width="18" stroke-dasharray="${len} ${C-len}" stroke-dashoffset="${-offset}" />`;
      offset += len;
      return seg;
    }).join("");
    return `<svg viewBox="0 0 140 140" width="140" height="140" style="transform:rotate(-90deg)">
      <circle r="${r}" cx="70" cy="70" fill="none" stroke="var(--panel-muted)" stroke-width="18" />
      ${segs}
    </svg>`;
  }

  const wordMax = (data.top_words[0]?.count) || 1;

  App.root.innerHTML = `
    <div class="an scroll-thin">
      <div class="lib-nav"><div class="lib-nav-inner">
        <a class="brand" href="#/library">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2l8 4v6c0 5-3.5 9-8 10-4.5-1-8-5-8-10V6l8-4z"/></svg>
          <div><b>Chat Vault</b><small>private archive</small></div>
        </a>
        <a class="btn-ghost" href="#/chat/${chatId}">← Back to chat</a>
      </div></div>
      <div class="an-main">
        <div class="an-hero">
          <div class="an-eyebrow">Analytics report</div>
          <h1>${App.escapeHtml(chat.title)}</h1>
          <p>${t.messages.toLocaleString()} messages · ${data.participants.length} ${data.participants.length===1?'person':'people'}</p>
        </div>
        <div class="kpis">
          <div class="kpi"><div class="l">Messages</div><div class="v">${t.messages.toLocaleString()}</div><div class="bar"></div></div>
          <div class="kpi"><div class="l">Words</div><div class="v">${t.words.toLocaleString()}</div><div class="bar"></div></div>
          <div class="kpi"><div class="l">Media</div><div class="v">${t.media.toLocaleString()}</div><div class="bar"></div></div>
          <div class="kpi"><div class="l">Avg response</div><div class="v">${App.fmtDuration(t.avg_response_sec)}</div><div class="bar"></div></div>
        </div>

        <div class="an-grid">
          <div class="card">
            <h3>Activity heatmap</h3>
            <div class="heatmap">
              <div></div>
              ${Array.from({length:24}, (_,h) => `<div class="head">${h%4===0?h:''}</div>`).join("")}
              ${data.heatmap.map((row, di) => `
                <div class="lbl">${DAY_LBL[di]}</div>
                ${row.map((v, h) => `<div class="cell" style="background:${heatColor(v)}" title="${DAY_LBL[di]} ${String(h).padStart(2,'0')}:00 — ${v} msgs"></div>`).join("")}
              `).join("")}
            </div>
            <div class="heatmap-legend">Less <div class="sw" style="background:${heatColor(heatMax*0.2)}"></div><div class="sw" style="background:${heatColor(heatMax*0.5)}"></div><div class="sw" style="background:${heatColor(heatMax*0.8)}"></div><div class="sw" style="background:${heatColor(heatMax)}"></div> More</div>
          </div>
          <div class="card">
            <h3>Who talks the most</h3>
            <div class="donut">${svgDonut(data.participants, t.messages)}<div class="center" style="margin-top:-90px">${t.messages.toLocaleString()}</div></div>
            <div class="parts">
              ${data.participants.map((p, i) => {
                const hue = App.hueFor(p.name);
                return `<div class="p">
                  <span class="dot" style="background:oklch(0.6 0.16 ${hue})"></span>
                  <span>${i+1}. ${App.escapeHtml(p.name)}</span>
                  <div class="barbg"><div style="width:${p.pct}%;background:oklch(0.6 0.16 ${hue})"></div></div>
                  <span>${p.count} · ${p.pct}%</span>
                </div>`;
              }).join("")}
            </div>
          </div>
        </div>

        <div class="card" style="margin-bottom:16px">
          <h3>Messages per day</h3>
          <div class="bars">
            ${data.per_day.map((d) => {
              const h = Math.max(2, Math.round((d.count / perDayMax) * 150));
              return `<div class="b" style="height:${h}px" data-c="${d.date} · ${d.count}"></div>`;
            }).join("")}
          </div>
        </div>

        <div class="an-grid">
          <div class="card">
            <h3>Word cloud</h3>
            <div class="cloud">
              ${data.top_words.slice(0, 60).map((w, i) => {
                const size = 12 + Math.round((w.count / wordMax) * 28);
                const hue = (i * 47) % 360;
                return `<span style="font-size:${size}px;color:oklch(0.75 0.12 ${hue})" title="${w.count}">${App.escapeHtml(w.word)}</span>`;
              }).join("") || "<p style='color:var(--muted-foreground)'>Not enough text yet.</p>"}
            </div>
          </div>
          <div class="card">
            <h3>Top emojis</h3>
            <div class="emoji-grid">
              ${data.top_emojis.slice(0,12).map((e) => `<div class="e">${e.emoji}<span class="c">${e.count}</span></div>`).join("") || "<p style='color:var(--muted-foreground)'>No emojis found.</p>"}
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
});
