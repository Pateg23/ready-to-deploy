# Chat Vault

Self-hosted WhatsApp chat archive — Flask + SQLite + vanilla JS SPA.

## Run locally / on a VPS

```bash
cd chat-vault
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
export SECRET_KEY="change-me-to-a-long-random-string"
export PORT=8080
python app.py
```

Open http://your-server:8080.

### Production (systemd + nginx, suggested)

Run behind nginx as a reverse proxy. Use a real WSGI server such as gunicorn:

```bash
pip install gunicorn
gunicorn -w 2 -b 127.0.0.1:8080 app:app
```

Uploads (up to 256 MB) are stored under `static/media/uploads/<chat_id>/`.
The SQLite database is `vault.db` next to `app.py`.

## Features

- Register / login / guest mode (SHA-256 + signed cookies)
- Upload WhatsApp `.txt` or `.zip` exports
- WhatsApp-style chat simulator with infinite scroll & search
- Per-chat analytics: heatmap, donut, per-day chart, top emojis, word cloud
