// IndexedDB layer for Chat Vault — partitioned per user id so accounts are isolated.
import { openDB, type IDBPDatabase } from "idb";
import type { ParsedMessage } from "./parser";

export interface ChatRow {
  id: string;
  title: string;
  createdAt: number;
  firstTs: number;
  lastTs: number;
  messageCount: number;
  mediaCount: number;
  participants: { name: string; count: number; pct: number }[];
}

export interface MessageRow extends ParsedMessage {
  id?: number;
  chatId: string;
  mediaKey?: string | null;
}

const dbs = new Map<string, Promise<IDBPDatabase>>();

let currentUserId: string = "guest";

export function setVaultUser(userId: string | null) {
  currentUserId = userId || "guest";
}

function db() {
  const key = currentUserId;
  if (!dbs.has(key)) {
    const p = openDB(`chat-vault::${key}`, 1, {
      upgrade(d) {
        d.createObjectStore("chats", { keyPath: "id" });
        const m = d.createObjectStore("messages", { keyPath: "id", autoIncrement: true });
        m.createIndex("by_chat_seq", ["chatId", "seq"]);
        m.createIndex("by_chat", "chatId");
        const md = d.createObjectStore("media", { keyPath: "key" });
        md.createIndex("by_chat", "chatId");
      },
    });
    dbs.set(key, p);
  }
  return dbs.get(key)!;
}

export async function listChats(): Promise<ChatRow[]> {
  const d = await db();
  const all = (await d.getAll("chats")) as ChatRow[];
  return all.sort((a, b) => b.createdAt - a.createdAt);
}

export async function getChat(id: string) {
  return (await (await db()).get("chats", id)) as ChatRow | undefined;
}

export async function deleteChat(id: string) {
  const d = await db();
  const tx = d.transaction(["chats", "messages", "media"], "readwrite");
  await tx.objectStore("chats").delete(id);
  const msgIdx = tx.objectStore("messages").index("by_chat");
  let c = await msgIdx.openCursor(IDBKeyRange.only(id));
  while (c) {
    await c.delete();
    c = await c.continue();
  }
  const medIdx = tx.objectStore("media").index("by_chat");
  let mc = await medIdx.openCursor(IDBKeyRange.only(id));
  while (mc) {
    await mc.delete();
    mc = await mc.continue();
  }
  await tx.done;
}

export async function createChat(
  title: string,
  msgs: ParsedMessage[],
  mediaByName: Map<string, { blob: Blob; type: string }>,
): Promise<string> {
  const d = await db();
  const id = crypto.randomUUID();
  const tx = d.transaction(["chats", "messages", "media"], "readwrite");
  const mStore = tx.objectStore("messages");
  const mediaStore = tx.objectStore("media");

  let mediaCount = 0;
  const participants = new Map<string, number>();
  const unused = new Set(mediaByName.keys());

  for (const msg of msgs) {
    if (msg.sender !== "__system__") {
      participants.set(msg.sender, (participants.get(msg.sender) || 0) + 1);
    }
    let mediaKey: string | null = null;
    if (msg.mediaName) {
      const lookup = [...mediaByName.keys()].find(
        (k) => k.toLowerCase() === msg.mediaName!.toLowerCase(),
      );
      if (lookup) {
        const m = mediaByName.get(lookup)!;
        mediaKey = `${id}/${lookup}`;
        await mediaStore.put({ key: mediaKey, chatId: id, blob: m.blob, type: m.type });
        unused.delete(lookup);
        mediaCount++;
      }
    }
    await mStore.put({ ...msg, chatId: id, mediaKey });
  }

  const orphans = [...unused];
  if (orphans.length) {
    const idx = mStore.index("by_chat_seq");
    let cur = await idx.openCursor(IDBKeyRange.bound([id, 0], [id, Number.MAX_SAFE_INTEGER]));
    while (cur && orphans.length) {
      const v = cur.value as MessageRow;
      if (!v.mediaKey && (v.kind === "image" || v.kind === "video" || v.kind === "sticker" || v.kind === "audio")) {
        const name = orphans.shift()!;
        const m = mediaByName.get(name)!;
        const key = `${id}/${name}`;
        await mediaStore.put({ key, chatId: id, blob: m.blob, type: m.type });
        v.mediaKey = key;
        v.kind = inferKindFromType(m.type, name) || v.kind;
        await cur.update(v);
        mediaCount++;
      }
      cur = await cur.continue();
    }
  }

  const pTotal = [...participants.values()].reduce((a, b) => a + b, 0) || 1;
  const partsArr = [...participants.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([name, count]) => ({ name, count, pct: Math.round((count * 1000) / pTotal) / 10 }));

  const chat: ChatRow = {
    id,
    title,
    createdAt: Date.now(),
    firstTs: msgs.length ? msgs[0].ts : Date.now(),
    lastTs: msgs.length ? msgs[msgs.length - 1].ts : Date.now(),
    messageCount: msgs.length,
    mediaCount,
    participants: partsArr,
  };
  await tx.objectStore("chats").put(chat);
  await tx.done;
  return id;
}

function inferKindFromType(type: string, name: string) {
  if (type.startsWith("image/")) return /sticker/i.test(name) ? "sticker" : "image";
  if (type.startsWith("video/")) return "video";
  if (type.startsWith("audio/")) return "audio";
  return null;
}

export async function getMessagesPage(
  chatId: string,
  beforeSeq: number | null,
  limit: number,
): Promise<MessageRow[]> {
  const d = await db();
  const idx = d.transaction("messages").store.index("by_chat_seq");
  const upper = beforeSeq == null ? Number.MAX_SAFE_INTEGER : beforeSeq - 1;
  const range = IDBKeyRange.bound([chatId, 0], [chatId, upper]);
  const out: MessageRow[] = [];
  let cur = await idx.openCursor(range, "prev");
  while (cur && out.length < limit) {
    out.push(cur.value as MessageRow);
    cur = await cur.continue();
  }
  return out.reverse();
}

export async function getAllMessages(chatId: string): Promise<MessageRow[]> {
  const d = await db();
  const idx = d.transaction("messages").store.index("by_chat_seq");
  const range = IDBKeyRange.bound([chatId, 0], [chatId, Number.MAX_SAFE_INTEGER]);
  const out: MessageRow[] = [];
  let cur = await idx.openCursor(range);
  while (cur) {
    out.push(cur.value as MessageRow);
    cur = await cur.continue();
  }
  return out;
}

export async function getMediaURL(key: string): Promise<string | null> {
  const d = await db();
  const rec = (await d.get("media", key)) as { blob: Blob } | undefined;
  if (!rec) return null;
  return URL.createObjectURL(rec.blob);
}
