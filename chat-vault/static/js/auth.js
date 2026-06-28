import App from "./app.js";

App.route("/auth", () => {
  let mode = "login";
  App.root.innerHTML = `
    <div class="auth-wrap">
      <div class="auth-card">
        <div class="auth-brand">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2l8 4v6c0 5-3.5 9-8 10-4.5-1-8-5-8-10V6l8-4z"/></svg>
          <h1>Chat Vault</h1>
          <p>A digital museum for your conversations.</p>
        </div>
        <div class="auth-tabs" role="tablist">
          <div class="indicator"></div>
          <button data-mode="login" class="active">Log in</button>
          <button data-mode="register">Register</button>
        </div>
        <form class="auth-form" autocomplete="off">
          <div class="auth-field">
            <label>Username</label>
            <input name="username" required minlength="2" maxlength="32" autocomplete="username" />
          </div>
          <div class="auth-field">
            <label>Password</label>
            <input name="password" type="password" required minlength="4" autocomplete="current-password" />
          </div>
          <div class="auth-err"></div>
          <button class="auth-submit" type="submit">Log in</button>
        </form>
        <div class="auth-divider">or</div>
        <button class="auth-guest" type="button">
          Enter as Guest
          <small>Instant preview — no account needed</small>
        </button>
      </div>
    </div>
  `;
  const tabs = App.root.querySelectorAll(".auth-tabs button");
  const indicator = App.root.querySelector(".auth-tabs .indicator");
  const form = App.root.querySelector(".auth-form");
  const err = App.root.querySelector(".auth-err");
  const submit = App.root.querySelector(".auth-submit");
  const guest = App.root.querySelector(".auth-guest");

  tabs.forEach((t) => t.addEventListener("click", () => {
    mode = t.dataset.mode;
    tabs.forEach((x) => x.classList.toggle("active", x === t));
    indicator.classList.toggle("right", mode === "register");
    submit.textContent = mode === "register" ? "Create account" : "Log in";
    err.textContent = "";
  }));

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    err.textContent = "";
    const fd = new FormData(form);
    const body = JSON.stringify({ username: fd.get("username"), password: fd.get("password") });
    const url = mode === "register" ? "/api/auth/register" : "/api/auth/login";
    try {
      const res = await App.api(url, { method: "POST", body });
      App.setUser(res);
      App.navigate("/library");
    } catch (e2) { err.textContent = e2.message; }
  });

  guest.addEventListener("click", async () => {
    err.textContent = "";
    try {
      const res = await App.api("/api/auth/guest", { method: "POST", body: "{}" });
      App.setUser(res);
      App.navigate("/library");
    } catch (e2) { err.textContent = e2.message; }
  });
});
