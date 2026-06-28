import App from "./app.js";

function modalHTML() {
  return `
    <div class="modal-overlay" data-overlay>
      <div class="modal" role="dialog" aria-modal="true">
        <button class="btn-icon close" data-close aria-label="Close">
          <svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
        <h2>Upload chat</h2>
        <p class="muted">Drop a WhatsApp .txt or .zip export (up to 256 MB).</p>
        <div class="dropzone" data-dz tabindex="0">
          <div class="dz-icon">📥</div>
          <div><b>Drop file here</b> or click to browse</div>
          <div class="dz-small">Supports .txt and .zip exports</div>
          <input type="file" accept=".txt,.zip" style="display:none" data-file />
        </div>
        <div class="upload-progress" data-progress>
          <div class="upload-step" data-step="1"><span class="num">1</span> <span class="lbl">Preparing file…</span></div>
          <div class="upload-step" data-step="2"><span class="num">2</span> <span class="lbl">Parsing messages…</span></div>
          <div class="upload-step" data-step="3"><span class="num">3</span> <span class="lbl">Indexing media…</span></div>
          <div class="upload-bar"><div class="fill" data-fill></div></div>
        </div>
        <div class="upload-done" data-done>
          <div class="check">✓</div>
          <h3>Upload complete!</h3>
          <p class="muted" data-done-msg></p>
          <button class="btn-primary" data-view>View chat</button>
        </div>
      </div>
    </div>
  `;
}

function show() {
  const wrap = document.createElement("div");
  wrap.innerHTML = modalHTML();
  const el = wrap.firstElementChild;
  document.body.appendChild(el);

  const dz = el.querySelector("[data-dz]");
  const file = el.querySelector("[data-file]");
  const progress = el.querySelector("[data-progress]");
  const fill = el.querySelector("[data-fill]");
  const done = el.querySelector("[data-done]");
  const doneMsg = el.querySelector("[data-done-msg]");
  const viewBtn = el.querySelector("[data-view]");
  let createdChatId = null;

  function close() { el.remove(); }
  el.addEventListener("click", (e) => { if (e.target.matches("[data-overlay]")) close(); });
  el.querySelector("[data-close]").addEventListener("click", close);

  dz.addEventListener("click", () => file.click());
  dz.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") file.click(); });
  dz.addEventListener("dragover", (e) => { e.preventDefault(); dz.classList.add("drag"); });
  dz.addEventListener("dragleave", () => dz.classList.remove("drag"));
  dz.addEventListener("drop", (e) => {
    e.preventDefault(); dz.classList.remove("drag");
    if (e.dataTransfer.files[0]) processFile(e.dataTransfer.files[0]);
  });
  file.addEventListener("change", () => { if (file.files[0]) processFile(file.files[0]); });

  function activateStep(id, doneFlag = false) {
    el.querySelectorAll(".upload-step").forEach((s) => {
      const n = +s.dataset.step;
      s.classList.toggle("active", n === id && !doneFlag);
      s.classList.toggle("done", n < id || (n === id && doneFlag));
    });
  }

  async function processFile(f) {
    dz.style.display = "none";
    progress.classList.add("active");
    try {
      activateStep(1); fill.style.width = "20%";
      await new Promise((r) => setTimeout(r, 400));
      activateStep(1, true);
      activateStep(2); fill.style.width = "50%";
      const res = await App.uploadFile(f);
      createdChatId = res.chat_id;
      activateStep(2, true); fill.style.width = "80%";
      await new Promise((r) => setTimeout(r, 300));
      activateStep(3);
      await new Promise((r) => setTimeout(r, 500));
      activateStep(3, true); fill.style.width = "100%";
      await new Promise((r) => setTimeout(r, 300));
      progress.classList.remove("active");
      done.classList.add("active");
      doneMsg.textContent = `${res.count} messages parsed from “${f.name}”.`;
      // Refresh library in background
      App.navigate("/library");
    } catch (e) {
      App.toast(e.message || "Upload failed", "error");
      close();
    }
  }

  viewBtn.addEventListener("click", () => {
    if (createdChatId) App.navigate(`/chat/${createdChatId}`);
    close();
  });
}

window.addEventListener("cv:upload", show);
