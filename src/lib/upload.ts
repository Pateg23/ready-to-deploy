import JSZip from "jszip";
import { parseWhatsApp, type ParsedMessage } from "./parser";

export interface UploadParseResult {
  title: string;
  msgs: ParsedMessage[];
  media: Map<string, { blob: Blob; type: string }>;
}

const MEDIA_EXT_TO_MIME: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
  bmp: "image/bmp",
  heic: "image/heic",
  mp4: "video/mp4",
  mov: "video/quicktime",
  webm: "video/webm",
  "3gp": "video/3gpp",
  opus: "audio/ogg",
  m4a: "audio/mp4",
  mp3: "audio/mpeg",
  ogg: "audio/ogg",
  wav: "audio/wav",
  aac: "audio/aac",
};

export async function readUpload(file: File): Promise<UploadParseResult> {
  const name = file.name;
  const title = name.replace(/\.(zip|txt)$/i, "").slice(0, 200) || "Imported chat";
  if (/\.zip$/i.test(name)) {
    const zip = await JSZip.loadAsync(file);
    let chatText = "";
    let chatPath = "";
    // Pick the chat .txt
    zip.forEach((path, entry) => {
      if (entry.dir) return;
      if (/_chat\.txt$/i.test(path) && !chatPath) chatPath = path;
    });
    if (!chatPath) {
      zip.forEach((path, entry) => {
        if (!entry.dir && /\.txt$/i.test(path) && !chatPath) chatPath = path;
      });
    }
    if (chatPath) chatText = await zip.file(chatPath)!.async("string");
    const msgs = parseWhatsApp(chatText);
    const media = new Map<string, { blob: Blob; type: string }>();
    const entries: { path: string; entry: JSZip.JSZipObject }[] = [];
    zip.forEach((path, entry) => {
      if (entry.dir || path === chatPath) return;
      entries.push({ path, entry });
    });
    for (const { path, entry } of entries) {
      const base = path.split("/").pop() || path;
      const ext = (base.toLowerCase().split(".").pop() || "").trim();
      const type = MEDIA_EXT_TO_MIME[ext] || "application/octet-stream";
      const blob = await entry.async("blob");
      media.set(base, { blob: new Blob([blob], { type }), type });
    }
    return { title, msgs, media };
  }
  const text = await file.text();
  return { title, msgs: parseWhatsApp(text), media: new Map() };
}
