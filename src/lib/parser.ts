// WhatsApp chat export parser. Handles iOS/Android, multi-line, media, system msgs.

export type MsgKind = "text" | "image" | "video" | "audio" | "sticker" | "deleted" | "system";

export interface ParsedMessage {
  seq: number;
  ts: number; // ms
  sender: string; // "__system__" for system
  isMe: boolean;
  kind: MsgKind;
  body: string;
  mediaName: string | null; // original filename if attachment
  edited: boolean;
}

const LINE_RE =
  /^\[?(\d{1,2}[/\-.]\d{1,2}[/\-.]\d{2,4})[,\s]+(\d{1,2}:\d{2}(?::\d{2})?(?:\s*[AaPp]\.?\s*[Mm]\.?)?)\]?\s*[-–—]?\s*(.*)$/;

const EDITED_RE = /\s*<This message was edited>\s*$/i;
const OMITTED_RE =
  /(image omitted|video omitted|sticker omitted|audio omitted|gif omitted|document omitted|<media omitted>|<medios omitidos>)/i;
const ATTACH_RE =
  /(?:<attached:\s*([^>]+)>|([\w\-.\s()]+\.(?:jpg|jpeg|png|gif|webp|bmp|heic|mp4|mov|3gp|avi|webm|opus|m4a|mp3|ogg|wav|aac|pdf|doc|docx|xls|xlsx|ppt|pptx))\s*\(?\s*(?:file attached|archivo adjunto)?\s*\)?)/i;
const DELETED_RE =
  /^(null|this message was deleted|you deleted this message|<this message was deleted>)\.?$/i;

function kindFor(name: string): MsgKind {
  const ext = name.toLowerCase().split(".").pop() || "";
  if (["webp"].includes(ext) && /sticker/i.test(name)) return "sticker";
  if (["jpg", "jpeg", "png", "gif", "bmp", "heic", "webp"].includes(ext)) return "image";
  if (["mp4", "mov", "3gp", "avi", "webm"].includes(ext)) return "video";
  if (["opus", "m4a", "mp3", "ogg", "wav", "aac"].includes(ext)) return "audio";
  return "image";
}

function parseTs(date: string, time: string): number {
  // Normalize
  const norm = (date + " " + time).replace(/\u202f/g, " ").replace(/\./g, "/").replace(/-/g, "/");
  const m = norm.match(
    /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([AaPp])?\.?\s*[Mm]?\.?$/,
  );
  if (!m) return Date.now();
  let [, a, b, y, hh, mm, ss, ap] = m;
  let year = parseInt(y, 10);
  if (year < 100) year += 2000;
  // Heuristic: assume D/M/Y unless month > 12 with first arg
  let day = parseInt(a, 10);
  let month = parseInt(b, 10);
  if (month > 12 && day <= 12) {
    [day, month] = [month, day];
  }
  let H = parseInt(hh, 10);
  if (ap) {
    const isPm = ap.toLowerCase() === "p";
    if (H === 12) H = isPm ? 12 : 0;
    else if (isPm) H += 12;
  }
  const M = parseInt(mm, 10);
  const S = ss ? parseInt(ss, 10) : 0;
  return new Date(year, month - 1, day, H, M, S).getTime();
}

export function parseWhatsApp(text: string): ParsedMessage[] {
  const msgs: ParsedMessage[] = [];
  let meSender: string | null = null;
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  for (let raw of lines) {
    const line = raw.replace(/\u200e/g, "").replace(/\u202f/g, " ").trim();
    if (!line) continue;
    const m = line.match(LINE_RE);
    if (!m) {
      if (msgs.length) {
        const last = msgs[msgs.length - 1];
        last.body = (last.body ? last.body + "\n" : "") + line;
      }
      continue;
    }
    const [, dateStr, timeStr, rest] = m;
    const ts = parseTs(dateStr, timeStr);
    let sender = "__system__";
    let body = rest || "";
    const colonIdx = rest.indexOf(":");
    if (colonIdx > 0 && colonIdx < 80) {
      sender = rest.slice(0, colonIdx).trim();
      body = rest.slice(colonIdx + 1).trim();
    }
    if (sender !== "__system__" && !meSender) meSender = sender;

    let kind: MsgKind = "text";
    let mediaName: string | null = null;
    const edited = EDITED_RE.test(body);
    if (edited) body = body.replace(EDITED_RE, "");

    const aMatch = body.match(ATTACH_RE);
    if (aMatch) {
      mediaName = (aMatch[1] || aMatch[2] || "").trim();
      kind = kindFor(mediaName);
      body = body.replace(ATTACH_RE, "").trim();
    } else if (OMITTED_RE.test(body)) {
      const txt = body.toLowerCase();
      kind = txt.includes("video")
        ? "video"
        : txt.includes("audio")
          ? "audio"
          : txt.includes("sticker")
            ? "sticker"
            : "image";
      body = "";
    } else if (DELETED_RE.test(body.trim())) {
      kind = "deleted";
      body = "";
    }

    msgs.push({
      seq: msgs.length + 1,
      ts,
      sender,
      isMe: false,
      kind,
      body,
      mediaName,
      edited,
    });
  }
  for (const msg of msgs) {
    msg.isMe = msg.sender === meSender;
    if (msg.sender === "__system__" && msg.kind === "text") msg.kind = "system";
  }
  return msgs;
}
