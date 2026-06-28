"""Chat Vault — Flask backend."""
from __future__ import annotations

import hashlib
import io
import os
import re
import shutil
import time
import uuid
import zipfile
from collections import Counter, defaultdict
from datetime import datetime
from functools import wraps
from pathlib import Path

from flask import (
    Flask,
    abort,
    jsonify,
    render_template,
    request,
    send_from_directory,
    session,
)

import models

BASE = Path(__file__).resolve().parent
UPLOAD_DIR = BASE / "static" / "media" / "uploads"
DEMO_DIR = BASE / "static" / "media" / "demo"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
DEMO_DIR.mkdir(parents=True, exist_ok=True)

app = Flask(__name__, static_folder=None)
app.secret_key = os.environ.get("SECRET_KEY", "dev-secret-change-me-please")
app.config["MAX_CONTENT_LENGTH"] = 256 * 1024 * 1024

models.init_db()


# ---------- helpers ----------
@app.after_request
def no_cache(resp):
    resp.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
    return resp


def login_required(fn):
    @wraps(fn)
    def w(*a, **kw):
        if not session.get("user_id"):
            return jsonify({"error": "Unauthorized"}), 401
        return fn(*a, **kw)

    return w


def current_user():
    uid = session.get("user_id")
    if not uid:
        return None
    return models.get_user(uid)


def sha256(s: str) -> str:
    return hashlib.sha256(s.encode("utf-8")).hexdigest()


# ---------- auth ----------
@app.get("/api/me")
def api_me():
    u = current_user()
    if not u:
        return jsonify({"error": "Unauthorized"}), 401
    return jsonify({"id": u["id"], "username": u["username"], "guest": bool(u["is_guest"])})


@app.post("/api/auth/register")
def api_register():
    data = request.get_json(silent=True) or {}
    username = (data.get("username") or "").strip()
    password = data.get("password") or ""
    if not (2 <= len(username) <= 32):
        return jsonify({"error": "Username must be 2–32 characters."}), 400
    if len(password) < 4:
        return jsonify({"error": "Password must be at least 4 characters."}), 400
    if models.get_user_by_username(username):
        return jsonify({"error": "Username already taken."}), 409
    uid = models.create_user(username, sha256(password), is_guest=False)
    session["user_id"] = uid
    return jsonify({"id": uid, "username": username})


@app.post("/api/auth/login")
def api_login():
    data = request.get_json(silent=True) or {}
    username = (data.get("username") or "").strip()
    password = data.get("password") or ""
    u = models.get_user_by_username(username)
    if not u or u["password_hash"] != sha256(password):
        return jsonify({"error": "Invalid credentials."}), 401
    session["user_id"] = u["id"]
    return jsonify({"id": u["id"], "username": u["username"]})


@app.post("/api/auth/guest")
def api_guest():
    name = f"guest_{uuid.uuid4().hex[:8]}"
    uid = models.create_user(name, sha256(uuid.uuid4().hex), is_guest=True)
    session["user_id"] = uid
    return jsonify({"id": uid, "username": name, "guest": True})


@app.post("/api/auth/logout")
def api_logout():
    session.clear()
    return jsonify({"ok": True})


# ---------- chats ----------
def compute_participants(messages):
    counts = Counter()
    for m in messages:
        s = m.get("sender") or ""
        if s and s != "__system__":
            counts[s] += 1
    total = sum(counts.values()) or 1
    out = [
        {"name": n, "count": c, "pct": round(c * 100.0 / total, 1)}
        for n, c in counts.most_common()
    ]
    return out


@app.get("/api/chats")
@login_required
def api_chats():
    u = current_user()
    chats = models.list_chats(u["id"])
    out = []
    for ch in chats:
        msgs = models.get_all_messages(ch["id"])
        ch["participants"] = compute_participants(msgs)
        out.append(ch)
    return jsonify(out)


@app.get("/api/chats/<int:chat_id>")
@login_required
def api_chat(chat_id):
    u = current_user()
    ch = models.get_chat(chat_id)
    if not ch or ch["owner_id"] != u["id"]:
        return jsonify({"error": "Not found"}), 404
    msgs = models.get_all_messages(chat_id)
    ch["participants"] = compute_participants(msgs)
    return jsonify(ch)


@app.get("/api/chats/<int:chat_id>/count")
@login_required
def api_chat_count(chat_id):
    u = current_user()
    ch = models.get_chat(chat_id)
    if not ch or ch["owner_id"] != u["id"]:
        return jsonify({"error": "Not found"}), 404
    return jsonify(models.get_message_count(chat_id))


@app.get("/api/chats/<int:chat_id>/messages")
@login_required
def api_chat_messages(chat_id):
    u = current_user()
    ch = models.get_chat(chat_id)
    if not ch or ch["owner_id"] != u["id"]:
        return jsonify({"error": "Not found"}), 404
    limit = min(int(request.args.get("limit", 50)), 200)
    seq = request.args.get("seq")
    before = int(seq) if seq else None
    return jsonify(models.get_messages_page(chat_id, limit=limit, before_seq=before))


@app.post("/api/chats/<int:chat_id>/delete")
@login_required
def api_chat_delete(chat_id):
    u = current_user()
    ch = models.get_chat(chat_id)
    if not ch or ch["owner_id"] != u["id"]:
        return jsonify({"error": "Not found"}), 404
    if ch.get("source") == "demo":
        return jsonify({"error": "Cannot delete demo chats."}), 400
    models.delete_chat(chat_id)
    # best-effort media cleanup
    try:
        shutil.rmtree(UPLOAD_DIR / str(chat_id))
    except FileNotFoundError:
        pass
    return jsonify({"ok": True})


# ---------- WhatsApp parser ----------
WA_RE = re.compile(
    r"^\[?(\d{1,2}[/\-.]\d{1,2}[/\-.]\d{2,4}),?\s*"
    r"(\d{1,2}:\d{2}(?::\d{2})?(?:\s*[AaPp][Mm])?)\]?\s*"
    r"(?:[\u2013\u2014\-]\s*)?(.*)$"
)

DATE_FORMATS = []
for d in ("%d/%m/%y", "%d/%m/%Y", "%m/%d/%y", "%m/%d/%Y",
          "%d-%m-%y", "%d-%m-%Y", "%m-%d-%y", "%m-%d-%Y",
          "%d.%m.%y", "%d.%m.%Y"):
    for t in ("%H:%M", "%H:%M:%S", "%I:%M %p", "%I:%M:%S %p",
              "%I:%M%p", "%I:%M:%S%p"):
        DATE_FORMATS.append(f"{d} {t}")


def parse_ts(date_str: str, time_str: str) -> float:
    s = f"{date_str} {time_str}".replace("\u202f", " ").strip()
    for fmt in DATE_FORMATS:
        try:
            return datetime.strptime(s, fmt).timestamp()
        except ValueError:
            continue
    return time.time()


MEDIA_EXTS = {".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp", ".heic"}
STICKER_EXTS = {".webp"}
EDITED_RE = re.compile(r"\s*<This message was edited>\s*$", re.IGNORECASE)
OMITTED_RE = re.compile(
    r"(image omitted|video omitted|sticker omitted|audio omitted|gif omitted|<media omitted>|<medios omitidos>)",
    re.IGNORECASE,
)
FILE_ATTACH_RE = re.compile(r"(?P<name>[\w\-. ]+\.[A-Za-z0-9]{2,5})\s*[\(<]?\s*(file attached|archivo adjunto)?", re.IGNORECASE)


def _kind_for(name: str) -> str:
    ext = Path(name).suffix.lower()
    if ext in STICKER_EXTS and "sticker" in name.lower():
        return "sticker"
    if ext in MEDIA_EXTS:
        return "image"
    return "image"


def parse_wa_chat(text: str) -> list[dict]:
    msgs: list[dict] = []
    me_sender = None
    for raw_line in text.splitlines():
        line = raw_line.replace("\u200e", "").replace("\u202f", " ").strip()
        if not line:
            continue
        m = WA_RE.match(line)
        if not m:
            if msgs:
                msgs[-1]["body"] = (msgs[-1].get("body") or "") + "\n" + line
            continue
        date_str, time_str, rest = m.group(1), m.group(2), m.group(3) or ""
        ts = parse_ts(date_str, time_str)

        if ":" in rest:
            sender, body = rest.split(":", 1)
            sender = sender.strip()
            body = body.strip()
        else:
            sender = "__system__"
            body = rest.strip()

        if sender != "__system__" and me_sender is None:
            me_sender = sender

        kind = "text"
        media_path = None
        edited = bool(EDITED_RE.search(body))
        if edited:
            body = EDITED_RE.sub("", body)

        if "(file attached)" in body.lower() or "archivo adjunto" in body.lower():
            fm = FILE_ATTACH_RE.search(body)
            if fm:
                fname = fm.group("name")
                kind = _kind_for(fname)
                media_path = fname
                body = ""
        elif OMITTED_RE.search(body):
            kind = "image"
            body = ""
        elif body.strip().lower() in ("null", "this message was deleted",
                                       "you deleted this message",
                                       "<this message was deleted>"):
            kind = "deleted"

        msgs.append({
            "seq": len(msgs) + 1,
            "ts": ts,
            "sender": sender,
            "is_me": False,  # set below
            "kind": kind,
            "body": body,
            "media_path": media_path,
            "edited": edited,
        })

    for m in msgs:
        m["is_me"] = (m["sender"] == me_sender)
        if m["sender"] == "__system__":
            m["kind"] = "system" if m["kind"] == "text" else m["kind"]

    return msgs


def extract_zip_messages(file_bytes: bytes):
    with zipfile.ZipFile(io.BytesIO(file_bytes)) as zf:
        names = zf.namelist()
        chat_name = None
        for n in names:
            if n.lower().endswith("_chat.txt"):
                chat_name = n
                break
        if not chat_name:
            for n in names:
                if n.lower().endswith(".txt"):
                    chat_name = n
                    break
        text = ""
        if chat_name:
            text = zf.read(chat_name).decode("utf-8", errors="replace")
        media = []
        for n in names:
            if n == chat_name or n.endswith("/"):
                continue
            try:
                media.append((n, Path(n).name, zf.read(n)))
            except KeyError:
                continue
        return text, media


# ---------- upload ----------
@app.post("/api/upload")
@login_required
def api_upload():
    u = current_user()
    if "file" not in request.files:
        return jsonify({"error": "No file provided."}), 400
    f = request.files["file"]
    fname = f.filename or "chat.txt"
    data = f.read()
    if not data:
        return jsonify({"error": "Empty file."}), 400

    text = ""
    media_files: list[tuple[str, str, bytes]] = []
    if fname.lower().endswith(".zip"):
        try:
            text, media_files = extract_zip_messages(data)
        except zipfile.BadZipFile:
            return jsonify({"error": "Invalid ZIP file."}), 400
    else:
        try:
            text = data.decode("utf-8")
        except UnicodeDecodeError:
            text = data.decode("utf-8", errors="replace")

    msgs = parse_wa_chat(text)
    if not msgs:
        return jsonify({"error": "No messages found in file."}), 400

    title = Path(fname).stem[:200] or "Imported chat"
    first_ts = msgs[0]["ts"]
    last_ts = msgs[-1]["ts"]
    chat_id = models.create_chat(
        title=title,
        owner_id=u["id"],
        message_count=len(msgs),
        media_count=0,
        first_ts=first_ts,
        last_ts=last_ts,
        source="upload",
    )

    # write media to disk and map filenames -> messages
    media_dir = UPLOAD_DIR / str(chat_id)
    media_dir.mkdir(parents=True, exist_ok=True)
    by_name: dict[str, str] = {}
    for _orig, name, blob in media_files:
        safe = re.sub(r"[^A-Za-z0-9._\-]+", "_", name)
        out = media_dir / safe
        with open(out, "wb") as fh:
            fh.write(blob)
        by_name[name.lower()] = f"uploads/{chat_id}/{safe}"

    matched = 0
    unmatched_remaining = list(by_name.values())
    for m in msgs:
        if m.get("media_path"):
            key = (m["media_path"] or "").lower()
            if key in by_name:
                m["media_path"] = by_name[key]
                matched += 1
                if by_name[key] in unmatched_remaining:
                    unmatched_remaining.remove(by_name[key])
            else:
                m["media_path"] = None  # show "media omitted"

    # spill unmatched media into image messages that have no path yet
    for m in msgs:
        if not unmatched_remaining:
            break
        if m["kind"] in ("image", "sticker") and not m.get("media_path"):
            m["media_path"] = unmatched_remaining.pop(0)
            matched += 1

    models.insert_messages(chat_id, msgs)
    media_count = sum(1 for m in msgs if m.get("media_path"))
    models.update_chat_media_count(chat_id, media_count)
    return jsonify({"chat_id": chat_id, "count": len(msgs), "media": media_count})


# ---------- search ----------
@app.get("/api/search/<int:chat_id>")
@login_required
def api_search(chat_id):
    u = current_user()
    ch = models.get_chat(chat_id)
    if not ch or ch["owner_id"] != u["id"]:
        return jsonify({"error": "Not found"}), 404
    q = (request.args.get("q") or "").strip().lower()
    if not q:
        return jsonify([])
    msgs = models.get_all_messages(chat_id)
    out = [
        {"seq": m["seq"], "chat_id": chat_id}
        for m in msgs
        if m.get("body") and q in m["body"].lower()
    ]
    return jsonify(out)


# ---------- analytics ----------
EMOJI_RE = re.compile(
    "[" "\U0001F1E0-\U0001F1FF"
    "\U0001F300-\U0001F5FF"
    "\U0001F600-\U0001F64F"
    "\U0001F680-\U0001F6FF"
    "\U0001F700-\U0001F77F"
    "\U0001F780-\U0001F7FF"
    "\U0001F800-\U0001F8FF"
    "\U0001F900-\U0001F9FF"
    "\U0001FA00-\U0001FA6F"
    "\U0001FA70-\U0001FAFF"
    "\u2600-\u26FF"
    "\u2700-\u27BF"
    "]",
    flags=re.UNICODE,
)
WORD_STRIP = re.compile(r"^[\W_]+|[\W_]+$", re.UNICODE)


@app.get("/api/analytics/<int:chat_id>")
@login_required
def api_analytics(chat_id):
    u = current_user()
    ch = models.get_chat(chat_id)
    if not ch or ch["owner_id"] != u["id"]:
        return jsonify({"error": "Not found"}), 404
    msgs = models.get_all_messages(chat_id)

    total_words = 0
    media_count = 0
    per_day: dict[str, int] = defaultdict(int)
    heatmap = [[0] * 24 for _ in range(7)]
    word_counter: Counter = Counter()
    emoji_counter: Counter = Counter()
    response_deltas: list[float] = []
    last_sender = None
    last_ts = None

    for m in msgs:
        body = (m.get("body") or "").strip()
        if m.get("kind") in ("image", "sticker") or m.get("media_path"):
            media_count += 1
        if body:
            words = body.split()
            total_words += len(words)
            for w in words:
                w2 = WORD_STRIP.sub("", w).lower()
                if len(w2) > 2 and not w2.startswith("http"):
                    word_counter[w2] += 1
            for e in EMOJI_RE.findall(body):
                emoji_counter[e] += 1
        try:
            dt = datetime.fromtimestamp(m["ts"])
            per_day[dt.strftime("%Y-%m-%d")] += 1
            heatmap[dt.weekday()][dt.hour] += 1
        except (OSError, ValueError):
            pass

        if m.get("sender") and m["sender"] != "__system__":
            if last_sender and m["sender"] != last_sender and last_ts is not None:
                delta = m["ts"] - last_ts
                if 0 < delta < 60 * 60 * 24:
                    response_deltas.append(delta)
            last_sender = m["sender"]
            last_ts = m["ts"]

    avg_resp = sum(response_deltas) / len(response_deltas) if response_deltas else 0
    heatmap_max = max((max(r) for r in heatmap), default=0)

    return jsonify({
        "totals": {
            "messages": len(msgs),
            "words": total_words,
            "media": media_count,
            "avg_response_sec": avg_resp,
        },
        "per_day": [{"date": d, "count": per_day[d]} for d in sorted(per_day.keys())],
        "heatmap": heatmap,
        "heatmap_max": heatmap_max,
        "participants": compute_participants(msgs),
        "top_words": [{"word": w, "count": c} for w, c in word_counter.most_common(60)],
        "top_emojis": [{"emoji": e, "count": c} for e, c in emoji_counter.most_common(30)],
    })


# ---------- static & SPA ----------
@app.get("/")
def index():
    return render_template("index.html")


@app.get("/static/<path:filename>")
def static_files(filename):
    return send_from_directory(BASE / "static", filename)


@app.get("/media/<path:filename>")
def media_files(filename):
    base_media = (BASE / "static" / "media").resolve()
    target = (base_media / filename).resolve()
    if not str(target).startswith(str(base_media)):
        abort(404)
    if not target.exists() or not target.is_file():
        abort(404)
    return send_from_directory(base_media, filename)


@app.get("/<path:path>")
def spa_catchall(path):
    if path.startswith("api/"):
        abort(404)
    return render_template("index.html")


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8080))
    app.run(host="0.0.0.0", port=port, debug=False)
