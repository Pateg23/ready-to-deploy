import App from "./app.js";

function topNav() {
  const u = App.user;
  return `
    <div class="lib-nav">
      <div class="lib-nav-inner">
        <a class="brand" href="#/library">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2l8 4v6c0 5-3.5 9-8 10-4.5-1-8-5-8-10V6l8-4z"/></svg>
          <div><b>Chat Vault</b><small>private archive</small></div>
        </a>
        <div class="lib-user">
          <span class="uname">@${App.escapeHtml(u?.username || "")}</span>
          <button class="btn-icon" data-logout title="Log out" aria-label="Log out">
            <svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
          </button>
        </div>
      </div>
    </div>`;
}

function chatCard(c) {
  const parts = (c.participants || []).slice(0, 3);
  const avs = parts.map((p) => App.avatar(p.name, 36)).join("");
  const isDemo = c.source === "demo";
  return `
    <div class="chat-card" data-id="${c.id}">
      <div class="avs">${avs || App.avatar(c.title, 36)}</div>
      <div class="meta">
        <div class="title">${App.escapeHtml(c.title)} ${isDemo ? '<span class="badge">demo</span>' : ""}</div>
        <div class="info">
          <span title="Messages">💬 ${c.message_count.toLocaleString()}</span>
          <span title="Media">🖼 ${c.media_count.toLocaleString()}</span>
          <span title="Range">📅 ${App.fmtRange(c.first_ts, c.last_ts) || App.relTime(c.created_at)}</span>
        </div>
      </div>
      <div class="actions">
        <a class="btn-icon" href="#/analytics/${c.id}" title="Analytics" onclick="event.stopPropagation()">
          <svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
        </a>
        ${isDemo ? "" : `<button class="btn-icon" data-delete title="Delete">
          <svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/></svg>
        </button>`}
      </div>
    </div>
  `;
}

App.route("/library", async () => {
  App.root.innerHTML = `${topNav()}<div class="lib"><div class="lib-main"><div class="boot"><div class="spinner"></div></div></div></div>`;
  let chats = [];
  try {
    chats = await App.api("/api/chats");
  } catch (e) { App.toast(e.message, "error"); }

  const totalMsgs = chats.reduce((s, c) => s + (c.message_count || 0), 0);
  const totalMedia = chats.reduce((s, c) => s + (c.media_count || 0), 0);

  function draw(filter = "") {
    const f = filter.toLowerCase();
    const filtered = chats.filter((c) => c.title.toLowerCase().includes(f));
    const empty = chats.length === 0;
    const main = `
      ${topNav()}
      <div class="lib scroll-thin">
        <div class="lib-main">
          ${empty ? `
            <div class="empty">
              <h2>No chats yet</h2>
              <p>Upload your first WhatsApp export to get started.</p>
              <button class="btn-primary" data-upload>📥 Upload chat</button>
            </div>
          ` : `
            <div class="lib-hero">
              <h1>Your library</h1>
              <p>${chats.length} ${chats.length === 1 ? "chat" : "chats"} · ${totalMsgs.toLocaleString()} messages archived</p>
            </div>
            <div class="lib-search">
              <svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
              <input data-search placeholder="Search chats…" value="${App.escapeHtml(filter)}" />
            </div>
            <div class="lib-stats">
              <div class="lib-stat"><div class="lbl">Chats</div><div class="num">${chats.length}</div><div class="bar"></div></div>
              <div class="lib-stat"><div class="lbl">Messages</div><div class="num">${totalMsgs.toLocaleString()}</div><div class="bar"></div></div>
              <div class="lib-stat"><div class="lbl">Media</div><div class="num">${totalMedia.toLocaleString()}</div><div class="bar"></div></div>
            </div>
            <div class="chat-list">${filtered.map(chatCard).join("") || "<p class='muted' style='color:var(--muted-foreground);text-align:center;padding:40px'>No matches.</p>"}</div>
          `}
        </div>
        <button class="fab" data-upload title="Upload">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="24" height="24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        </button>
      </div>
    `;
    App.root.innerHTML = main;

    App.root.querySelector("[data-logout]")?.addEventListener("click", async () => {
      await App.api("/api/auth/logout", { method: "POST", body: "{}" });
      App.setUser(null); App.navigate("/auth");
    });
    App.root.querySelectorAll("[data-upload]").forEach((b) =>
      b.addEventListener("click", () => window.dispatchEvent(new CustomEvent("cv:upload"))));

    const search = App.root.querySelector("[data-search]");
    if (search) {
      search.addEventListener("input", (e) => draw(e.target.value));
      // Keep focus on redraws
      const v = search.value;
      search.focus(); search.setSelectionRange(v.length, v.length);
    }

    App.root.querySelectorAll(".chat-card").forEach((card) => {
      card.addEventListener("click", (e) => {
        if (e.target.closest("[data-delete]") || e.target.closest("a")) return;
        App.navigate(`/chat/${card.dataset.id}`);
      });
      card.querySelector("[data-delete]")?.addEventListener("click", async (e) => {
        e.stopPropagation();
        if (!confirm("Delete this chat and all messages?")) return;
        try {
          await App.api(`/api/chats/${card.dataset.id}/delete`, { method: "POST", body: "{}" });
          chats = chats.filter((c) => String(c.id) !== card.dataset.id);
          draw(filter);
          App.toast("Chat deleted.");
        } catch (err) { App.toast(err.message, "error"); }
      });
    });
  }

  draw();
});
