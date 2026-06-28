import App from "./app.js";

App.route("/chat/:id", async (params) => {
  const chatId = params.id;
  App.root.innerHTML = `<div class="sim"><div class="boot"><div class="spinner"></div></div></div>`;
  let chat = null, count = null;
  try {
    [chat, count] = await Promise.all([
      App.api(`/api/chats/${chatId}`),
      App.api(`/api/chats/${chatId}/count`),
    ]);
  } catch (e) { App.toast(e.message, "error"); App.navigate("/library"); return; }

  const participants = chat.participants || [];
  const colorFor = (name) => App.hueFor(name);
  const replyKey = `cv_replies_${chatId}`;
  let mockReplies = [];
  try { mockReplies = JSON.parse(localStorage.getItem(replyKey) || "[]"); } catch {}

  let loadedMsgs = [];
  let allLoaded = false;
  let loadingMore = false;
  let searchResults = [];
  let searchIdx = -1;
  let withSidebar = false, withDrawer = false, searchOpen = false;

  const PAGE = 60;

  function render() {
    const avs = participants.slice(0, 3).map((p) => App.avatar(p.name, 32)).join("");
    App.root.innerHTML = `
      <div class="sim">
        <div class="sim-top">
          <button class="btn-icon back" data-back aria-label="Back">
            <svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg>
          </button>
          <div class="info">
            <div class="avs">${avs}</div>
            <div>
              <div class="title">${App.escapeHtml(chat.title)}</div>
              <div class="sub">${count.count.toLocaleString()} messages · ${participants.length} ${participants.length === 1 ? "person" : "people"}</div>
            </div>
          </div>
          <div class="tools">
            <button class="btn-icon" data-toggle-sidebar title="Participants"><svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg></button>
            <button class="btn-icon" data-toggle-search title="Search"><svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg></button>
            <a class="btn-icon" href="#/analytics/${chatId}" title="Analytics"><svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg></a>
            <button class="btn-icon" data-toggle-drawer title="Info"><svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg></button>
          </div>
        </div>
        <div class="sim-body ${withSidebar?'with-sidebar':''} ${withDrawer?'with-drawer':''}" data-body>
          <aside class="sim-sidebar scroll-thin">
            <h3>Participants</h3>
            ${participants.map((p) => `
              <div class="p">${App.avatar(p.name, 28)}<span class="name">${App.escapeHtml(p.name)}</span><span class="c">${p.count}</span></div>
            `).join("")}
          </aside>
          <div class="sim-main">
            <div class="sim-search ${searchOpen?'open':''}" data-sw>
              <input data-q placeholder="Search messages…" />
              <button class="btn-icon" data-prev title="Previous">↑</button>
              <button class="btn-icon" data-next title="Next">↓</button>
              <span class="count" data-count></span>
              <button class="btn-icon" data-close-search>✕</button>
            </div>
            <div class="feed chat-wallpaper scroll-thin" data-feed></div>
            <div class="reply-bar">
              <span class="mock-badge">mock</span>
              <input data-reply placeholder="Type a mock reply (saved locally only)…" />
              <button class="send" data-send aria-label="Send">
                <svg class="ico" viewBox="0 0 24 24" fill="currentColor"><path d="M2 21l21-9L2 3v7l15 2-15 2v7z"/></svg>
              </button>
            </div>
            <div class="mock-list" data-mocks></div>
          </div>
          <aside class="sim-drawer scroll-thin" data-drawer>
            <h4>Message info</h4>
            <p style="color:var(--muted-foreground);font-size:13px">Click any message to see details.</p>
          </aside>
        </div>
      </div>
    `;
    bindEvents();
    loadInitial();
    renderMocks();
  }

  function bindEvents() {
    App.root.querySelector("[data-back]").addEventListener("click", () => App.navigate("/library"));
    App.root.querySelector("[data-toggle-sidebar]").addEventListener("click", () => {
      withSidebar = !withSidebar;
      App.root.querySelector("[data-body]").classList.toggle("with-sidebar", withSidebar);
    });
    App.root.querySelector("[data-toggle-drawer]").addEventListener("click", () => {
      withDrawer = !withDrawer;
      App.root.querySelector("[data-body]").classList.toggle("with-drawer", withDrawer);
    });
    App.root.querySelector("[data-toggle-search]").addEventListener("click", () => toggleSearch(true));
    App.root.querySelector("[data-close-search]").addEventListener("click", () => toggleSearch(false));

    const q = App.root.querySelector("[data-q]");
    let t;
    q.addEventListener("input", () => { clearTimeout(t); t = setTimeout(() => doSearch(q.value), 300); });
    q.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); searchNav(e.shiftKey ? -1 : 1); }
      if (e.key === "Escape") toggleSearch(false);
    });
    App.root.querySelector("[data-prev]").addEventListener("click", () => searchNav(-1));
    App.root.querySelector("[data-next]").addEventListener("click", () => searchNav(1));

    const reply = App.root.querySelector("[data-reply]");
    const send = () => {
      const v = reply.value.trim();
      if (!v) return;
      const m = { id: Date.now(), text: v, ts: Date.now()/1000 };
      mockReplies.push(m);
      localStorage.setItem(replyKey, JSON.stringify(mockReplies));
      reply.value = "";
      renderMessages(loadedMsgs);
      renderMocks();
      const feed = App.root.querySelector("[data-feed]");
      feed.scrollTop = feed.scrollHeight;
    };
    reply.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); send(); } });
    App.root.querySelector("[data-send]").addEventListener("click", send);

    const feed = App.root.querySelector("[data-feed]");
    feed.addEventListener("scroll", onScroll);
  }

  function toggleSearch(on) {
    searchOpen = on;
    App.root.querySelector("[data-sw]").classList.toggle("open", on);
    if (on) {
      setTimeout(() => App.root.querySelector("[data-q]").focus(), 50);
    } else {
      searchResults = []; searchIdx = -1;
      App.root.querySelector("[data-count]").textContent = "";
      renderMessages(loadedMsgs);
    }
  }

  async function loadInitial() {
    const list = await App.api(`/api/chats/${chatId}/messages?limit=${PAGE}`);
    loadedMsgs = list;
    if (!list.length || list[0].seq <= 1) allLoaded = true;
    renderMessages(loadedMsgs);
    const feed = App.root.querySelector("[data-feed]");
    feed.scrollTop = feed.scrollHeight;
  }

  async function onScroll(e) {
    if (loadingMore || allLoaded) return;
    const feed = e.target;
    if (feed.scrollTop < 150 && loadedMsgs.length) {
      loadingMore = true;
      const beforeSeq = loadedMsgs[0].seq;
      const prevH = feed.scrollHeight;
      const more = await App.api(`/api/chats/${chatId}/messages?limit=${PAGE}&seq=${beforeSeq}`);
      if (!more.length) { allLoaded = true; loadingMore = false; return; }
      loadedMsgs = more.concat(loadedMsgs);
      renderMessages(loadedMsgs);
      feed.scrollTop = feed.scrollHeight - prevH;
      loadingMore = false;
    }
  }

  function computeGroups(msgs) {
    const groups = [];
    let cur = null;
    for (const m of msgs) {
      if (m.sender === "__system__") { groups.push({ sender: "__system__", isMe: false, msgs: [m] }); cur = null; continue; }
      if (!cur || cur.sender !== m.sender || (m.ts - cur.lastTs) > 300) {
        cur = { sender: m.sender, isMe: !!m.is_me, msgs: [m], firstTs: m.ts, lastTs: m.ts };
        groups.push(cur);
      } else {
        cur.msgs.push(m); cur.lastTs = m.ts;
      }
    }
    return groups;
  }

  function fmtChatDate(ts) {
    const d = new Date(ts * 1000); const now = new Date();
    const diffDays = Math.floor((now - d) / 86400000);
    if (d.toDateString() === now.toDateString()) return "Today";
    const yest = new Date(now); yest.setDate(now.getDate() - 1);
    if (d.toDateString() === yest.toDateString()) return "Yesterday";
    if (diffDays < 7) return d.toLocaleDateString([], { weekday: "long" });
    return d.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric", year: d.getFullYear()===now.getFullYear()?undefined:"numeric" });
  }

  function linkify(text) {
    return App.escapeHtml(text).replace(/https?:\/\/[^\s<]+/g, (u) => `<a href="${u}" target="_blank" rel="noopener noreferrer">${u}</a>`);
  }

  function renderBubble(m, side, posClass, isLast) {
    const safe = m.body || "";
    const time = App.fmtTime(m.ts);
    const meta = `<div class="meta">${App.escapeHtml(time)}${m.edited?' · edited':''}${side==='me'?' '+App.tickSVG('read'):''}</div>`;

    if (m.sender === "__system__") {
      return `<div class="bubble system" data-seq="${m.seq}">${linkify(safe)}</div>`;
    }
    if (m.kind === "deleted") {
      return `<div class="row ${side} ${posClass}" data-seq="${m.seq}"><div class="bubble deleted">🚫 ${side==='me'?'You deleted this message':'This message was deleted'}</div></div>`;
    }
    if (m.kind === "sticker" && m.media_path) {
      return `<div class="row ${side} ${posClass}" data-seq="${m.seq}"><div class="bubble sticker"><img loading="lazy" src="/media/${m.media_path}" alt="sticker" /></div></div>`;
    }
    if ((m.kind === "image" || m.media_path) && m.media_path) {
      return `<div class="row ${side} ${posClass}" data-seq="${m.seq}"><div class="bubble image">
        <img loading="lazy" src="/media/${m.media_path}" alt="image" />
        ${safe?`<div>${linkify(safe)}</div>`:''}${meta}</div></div>`;
    }
    if (m.kind === "image" || m.kind === "sticker") {
      return `<div class="row ${side} ${posClass}" data-seq="${m.seq}"><div class="bubble media-omitted">🖼 Media omitted</div></div>`;
    }
    return `<div class="row ${side} ${posClass}" data-seq="${m.seq}"><div class="bubble">${linkify(safe)}${meta}</div></div>`;
  }

  function renderMessages(list) {
    const feed = App.root.querySelector("[data-feed]");
    if (!feed) return;
    const wasNearBottom = (feed.scrollHeight - feed.scrollTop - feed.clientHeight) < 80;
    const groups = computeGroups(list);
    let html = "";
    let lastTs = 0;
    for (const g of groups) {
      if (!lastTs || (g.firstTs - lastTs) > 60*15) {
        html += `<div class="divider">${fmtChatDate(g.firstTs)}</div>`;
      }
      if (g.sender !== "__system__" && !g.isMe) {
        const hue = colorFor(g.sender);
        html += `<div class="sender-name" style="color:oklch(0.75 0.12 ${hue})">${App.escapeHtml(g.sender)}</div>`;
      }
      g.msgs.forEach((m, i) => {
        const side = g.sender === "__system__" ? "system" : (g.isMe ? "me" : "them");
        let pos = "alone";
        if (g.msgs.length > 1) {
          if (i === 0) pos = "first";
          else if (i === g.msgs.length - 1) pos = "last";
          else pos = "mid";
        }
        html += renderBubble(m, side, pos, i === g.msgs.length - 1);
      });
      lastTs = g.lastTs;
    }
    // append mock replies
    for (const m of mockReplies) {
      html += `<div class="row me alone pop-in" data-mock="${m.id}"><div class="bubble">${linkify(m.text)}<div class="meta">${App.escapeHtml(App.fmtTime(m.ts))} · mock ${App.tickSVG('sent')}</div></div></div>`;
    }
    feed.innerHTML = html;

    // highlight search matches
    if (searchResults.length) {
      const set = new Set(searchResults.map(r => String(r.seq)));
      feed.querySelectorAll("[data-seq]").forEach(el => {
        const row = el.classList.contains("row") ? el : el.closest(".row");
        if (row && set.has(el.dataset.seq)) row.classList.add("match");
      });
    }

    // click to show drawer
    feed.querySelectorAll("[data-seq]").forEach((el) => {
      el.addEventListener("click", () => {
        const seq = +el.dataset.seq;
        const m = list.find((x) => x.seq === seq);
        if (m) showDrawer(m);
      });
    });

    if (wasNearBottom) feed.scrollTop = feed.scrollHeight;
  }

  function renderMocks() {
    const el = App.root.querySelector("[data-mocks]");
    if (!el) return;
    el.innerHTML = mockReplies.map((m) => `
      <span class="mock-pill">${App.escapeHtml(m.text.slice(0, 30))}${m.text.length>30?'…':''}
        <button data-del="${m.id}" title="Delete">✕</button>
      </span>
    `).join("");
    el.querySelectorAll("[data-del]").forEach((b) => b.addEventListener("click", () => {
      mockReplies = mockReplies.filter((m) => String(m.id) !== b.dataset.del);
      localStorage.setItem(replyKey, JSON.stringify(mockReplies));
      renderMessages(loadedMsgs); renderMocks();
    }));
  }

  async function doSearch(q) {
    q = (q || "").trim();
    const countEl = App.root.querySelector("[data-count]");
    if (!q) { searchResults = []; searchIdx = -1; countEl.textContent = ""; renderMessages(loadedMsgs); return; }
    try {
      searchResults = await App.api(`/api/search/${chatId}?q=${encodeURIComponent(q)}`);
      searchIdx = searchResults.length ? 0 : -1;
      countEl.textContent = searchResults.length ? `1/${searchResults.length}` : "0";
      if (searchIdx >= 0) await ensureSeqVisible(searchResults[searchIdx].seq);
      renderMessages(loadedMsgs); scrollToMatch();
    } catch (e) { App.toast(e.message, "error"); }
  }

  async function searchNav(dir) {
    if (!searchResults.length) return;
    searchIdx = (searchIdx + dir + searchResults.length) % searchResults.length;
    App.root.querySelector("[data-count]").textContent = `${searchIdx+1}/${searchResults.length}`;
    await ensureSeqVisible(searchResults[searchIdx].seq);
    renderMessages(loadedMsgs); scrollToMatch();
  }

  async function ensureSeqVisible(seq) {
    while (loadedMsgs.length && loadedMsgs[0].seq > seq && !allLoaded) {
      const beforeSeq = loadedMsgs[0].seq;
      const more = await App.api(`/api/chats/${chatId}/messages?limit=${PAGE}&seq=${beforeSeq}`);
      if (!more.length) { allLoaded = true; break; }
      loadedMsgs = more.concat(loadedMsgs);
    }
  }

  function scrollToMatch() {
    if (searchIdx < 0) return;
    const seq = searchResults[searchIdx].seq;
    const el = App.root.querySelector(`.feed [data-seq="${seq}"]`);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  function showDrawer(m) {
    withDrawer = true;
    App.root.querySelector("[data-body]").classList.add("with-drawer");
    const d = App.root.querySelector("[data-drawer]");
    d.innerHTML = `
      <h4>Message info</h4>
      <div class="kv"><span class="k">Sender</span><span>${App.escapeHtml(m.sender)}</span></div>
      <div class="kv"><span class="k">Time</span><span>${App.escapeHtml(App.fmtTime(m.ts))}</span></div>
      <div class="kv"><span class="k">Date</span><span>${App.escapeHtml(App.fmtDate(m.ts))}</span></div>
      <div class="kv"><span class="k">Kind</span><span>${App.escapeHtml(m.kind)}${m.edited?' (edited)':''}</span></div>
      <div class="kv"><span class="k">Words</span><span>${(m.body||"").split(/\s+/).filter(Boolean).length}</span></div>
      <div class="body">${App.escapeHtml(m.body || "(no text)")}</div>
    `;
  }

  render();
});
