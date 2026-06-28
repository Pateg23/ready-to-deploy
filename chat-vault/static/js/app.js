const App = (() => {
  const root = document.getElementById("app");
  let currentUser = null;

  async function api(path, opts = {}) {
    const res = await fetch(path, {
      credentials: "same-origin",
      headers: opts.body && !(opts.body instanceof FormData)
        ? { "Content-Type": "application/json", ...(opts.headers || {}) }
        : (opts.headers || {}),
      ...opts,
    });
    let data = null;
    try { data = await res.json(); } catch { data = null; }
    if (!res.ok) {
      const err = new Error((data && data.error) || res.statusText || "Request failed");
      err.status = res.status; err.data = data;
      throw err;
    }
    return data;
  }

  async function uploadFile(file) {
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch("/api/upload", { method: "POST", credentials: "same-origin", body: fd });
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new Error((data && data.error) || "Upload failed");
    return data;
  }

  let toastEl = null;
  function toast(msg, type = "info", ms = 2600) {
    if (!toastEl) toastEl = document.querySelector(".toast");
    if (!toastEl) return;
    toastEl.textContent = msg;
    toastEl.className = "toast show" + (type === "error" ? " error" : "");
    clearTimeout(toast._t);
    toast._t = setTimeout(() => { toastEl.className = "toast"; }, ms);
  }

  const AVATAR_HUES = [160, 200, 240, 280, 320, 40, 80, 120];
  function hueFor(name) {
    let h = 5381;
    for (let i = 0; i < (name || "").length; i++) h = ((h << 5) + h) + name.charCodeAt(i);
    return AVATAR_HUES[Math.abs(h) % AVATAR_HUES.length];
  }
  function avatar(name, size = 36) {
    const initials = (name || "?").trim().slice(0, 2).toUpperCase();
    const hue = hueFor(name || "");
    const s = size;
    return `<div class="av" style="width:${s}px;height:${s}px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font-weight:600;font-size:${Math.round(s*0.38)}px;color:oklch(0.96 0.005 180);background:linear-gradient(135deg, oklch(0.55 0.14 ${hue}), oklch(0.4 0.12 ${(hue+40)%360}));box-shadow:0 2px 6px oklch(0 0 0 / 0.3);">${escapeHtml(initials)}</div>`;
  }

  function fmtTime(ts) { return new Date(ts * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }); }
  function fmtDate(ts) { return new Date(ts * 1000).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" }); }
  function fmtRange(a, b) {
    if (!a || !b) return "";
    const da = new Date(a * 1000), db = new Date(b * 1000);
    const sameYear = da.getFullYear() === db.getFullYear();
    const fa = da.toLocaleDateString([], { month: "short", day: "numeric", ...(sameYear ? {} : { year: "numeric" }) });
    const fb = db.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });
    return `${fa} — ${fb}`;
  }
  function fmtDuration(sec) {
    sec = Math.round(sec || 0);
    if (sec >= 3600) return `${Math.floor(sec/3600)}h ${Math.floor((sec%3600)/60)}m`;
    if (sec >= 60) return `${Math.floor(sec/60)}m ${sec%60}s`;
    return `${sec}s`;
  }
  function relTime(ts) {
    const d = Date.now()/1000 - ts;
    if (d < 60) return "just now";
    if (d < 3600) return `${Math.floor(d/60)}m ago`;
    if (d < 86400) return `${Math.floor(d/3600)}h ago`;
    if (d < 86400*7) return `${Math.floor(d/86400)}d ago`;
    return fmtDate(ts);
  }
  function escapeHtml(s) {
    return String(s ?? "")
      .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;").replaceAll("'", "&#39;");
  }
  function tickSVG(status) {
    if (status === "sent") return `<span class="tick" style="color:var(--tick)"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3,9 6,12 13,4"/></svg></span>`;
    const color = status === "read" ? "var(--tick-read)" : "var(--tick)";
    return `<span class="tick" style="color:${color}"><svg viewBox="0 0 18 16" fill="none" stroke="currentColor" stroke-width="2"><polyline points="2,9 5,12 11,4"/><polyline points="7,12 9.5,14.5 16,4"/></svg></span>`;
  }

  const routes = {};
  function route(path, handler) { routes[path] = handler; }
  function routeMatches(pattern, pathname) {
    const a = pattern.split("/"), b = pathname.split("/");
    if (a.length !== b.length) return null;
    const params = {};
    for (let i = 0; i < a.length; i++) {
      if (a[i].startsWith(":")) params[a[i].slice(1)] = b[i];
      else if (a[i] !== b[i]) return null;
    }
    return params;
  }
  function navigate(path) {
    if (("#" + path) === window.location.hash) { render(path); return; }
    window.location.hash = path;
  }
  function render(path) {
    path = path || (window.location.hash.replace(/^#/, "") || "/auth");
    if (routes[path]) return routes[path]({});
    for (const pat of Object.keys(routes)) {
      const m = routeMatches(pat, path);
      if (m) return routes[pat](m, path);
    }
    return (routes["/auth"] || (() => {}))({});
  }

  async function boot() {
    window.addEventListener("hashchange", () => render());
    await Promise.all([
      import("./auth.js"), import("./library.js"),
      import("./upload.js"), import("./simulator.js"),
      import("./analytics.js"),
    ]);
    try {
      currentUser = await api("/api/me");
      if (!window.location.hash || window.location.hash === "#/auth") navigate("/library");
      else render();
    } catch {
      currentUser = null;
      navigate("/auth");
    }
  }

  function setUser(u) { currentUser = u; }

  const App = {
    root, api, uploadFile, toast, avatar, fmtTime, fmtDate, fmtRange, fmtDuration,
    relTime, escapeHtml, tickSVG, hueFor,
    route, navigate, render, setUser,
    get user() { return currentUser; },
  };
  window.App = App;
  return App;
})();

export default App;

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => App.boot ? App.boot() : null);
} else {
  // boot is internal; expose
}
(async () => { await App._bootOnce?.(); })();
// Boot explicitly
App._booted = true;
(async () => {
  // Wait a tick so modules can register their routes
  await new Promise((r) => setTimeout(r, 0));
})();

// Trigger the actual boot procedure
const _boot = async () => {
  window.addEventListener("hashchange", () => App.render());
  await Promise.all([
    import("./auth.js"), import("./library.js"),
    import("./upload.js"), import("./simulator.js"),
    import("./analytics.js"),
  ]);
  try {
    const me = await App.api("/api/me");
    App.setUser(me);
    if (!window.location.hash || window.location.hash === "#/auth") App.navigate("/library");
    else App.render();
  } catch {
    App.setUser(null);
    App.navigate("/auth");
  }
};
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", _boot);
else _boot();
