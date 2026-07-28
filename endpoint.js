// 音乐上传代理端点 — 接收前端 base64 → 服务端转发 multipart 到 API
import https from "node:https";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import express from "express";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const TOKEN = "sk_20260728_699d4929c1a448feb6c565e8dfbb3c3e";
const UPLOAD_URL = "https://playground.z.wiki/img/api/upload";
const DELETE_URL = "https://playground.z.wiki/img/delete";
const FAILURE_URL = "https://playground.z.wiki/img/api/upload/failure-report";
const MAX_FILE_MB = 30;
const SONGS_FILE = path.join(__dirname, "..", "..", "plugins", "music-upload", "songs.json");

function loadSongs() {
  try { if (fs.existsSync(SONGS_FILE)) return JSON.parse(fs.readFileSync(SONGS_FILE, "utf8")); }
  catch (e) { console.error("[音乐端点] 读取歌单失败:", e.message); }
  return [];
}
function saveSongs(songs) {
  try { fs.writeFileSync(SONGS_FILE, JSON.stringify(songs, null, 2), "utf8"); }
  catch (e) { console.error("[音乐端点] 保存歌单失败:", e.message); }
}

function _request(opts, body) {
  return new Promise((resolve, reject) => {
    const req = https.request(opts, (res) => {
      const c = []; res.on("data", (d) => c.push(d));
      res.on("end", () => {
        const t = Buffer.concat(c).toString();
        try { resolve({ status: res.statusCode, data: JSON.parse(t) }); }
        catch (e) { resolve({ status: res.statusCode, data: { raw: t } }); }
      });
    });
    req.on("error", reject);
    req.on("timeout", () => { req.destroy(); reject(new Error("请求超时")); });
    if (body) req.write(body);
    req.end();
  });
}

function proxyUpload(fileBuffer, fileName, fileType) {
  const boundary = "----FB" + crypto.randomBytes(16).toString("hex");
  const CRLF = "\r\n", parts = [];
  function addPart(name, value, filename, ct) {
    let h = "--" + boundary + CRLF + 'Content-Disposition: form-data; name="' + name + '"';
    if (filename) h += '; filename="' + filename + '"';
    h += CRLF; if (ct) h += "Content-Type: " + ct + CRLF; h += CRLF;
    parts.push(Buffer.from(h, "utf8"));
    parts.push(typeof value === "string" ? Buffer.from(value, "utf8") : value);
    parts.push(Buffer.from(CRLF, "utf8"));
  }
  addPart("file", fileBuffer, fileName, fileType || "audio/mpeg");
  addPart("fileName", fileName);
  addPart("uid", TOKEN);
  const body = Buffer.concat([...parts, Buffer.from("--" + boundary + "--" + CRLF, "utf8")]);
  const u = new URL(UPLOAD_URL);
  return _request({
    hostname: u.hostname, path: u.pathname + u.search, method: "POST",
    headers: { "Content-Type": "multipart/form-data; boundary=" + boundary, "Content-Length": body.length },
    timeout: 120000,
  }, body);
}

function proxyDelete(fileId) {
  const u = new URL(DELETE_URL);
  return _request({ hostname: u.hostname,
    path: "/img/delete?id=" + encodeURIComponent(fileId) + "&uid=" + encodeURIComponent(TOKEN),
    method: "DELETE", timeout: 30000 });
}

export const router = express.Router();

router.post("/upload", async (req, res) => {
  const chunks = []; req.on("data", (c) => chunks.push(c));
  req.on("end", async () => {
    try {
      const json = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      const fileName = (json.name || "upload.mp3").replace(/[\\/:"*?<>|]/g, "_");
      const base64 = json.file || "";
      if (!base64) return res.status(400).json({ error: "缺少文件数据" });
      const comma = base64.indexOf(",");
      const raw = comma >= 0 ? base64.substring(comma + 1) : base64;
      let buf; try { buf = Buffer.from(raw, "base64"); } catch (e) { return res.status(400).json({ error: "base64 解码失败" }); }
      if (buf.length > MAX_FILE_MB * 1048576) return res.status(413).json({ error: "文件过大" });

      console.log("[音乐端点] 收到上传:", fileName, (buf.length / 1024).toFixed(1), "KB");
      const ext = path.extname(fileName).toLowerCase();
      const mimeMap = { ".mp3": "audio/mpeg", ".wav": "audio/wav", ".ogg": "audio/ogg",
        ".flac": "audio/flac", ".aac": "audio/aac", ".m4a": "audio/mp4", ".wma": "audio/x-ms-wma" };
      const result = await proxyUpload(buf, fileName, mimeMap[ext] || "audio/mpeg");

      let songUrl = "", songId = "";
      const d = result.data;
      if (d?.data) { songUrl = d.data.url || d.data.link || ""; songId = d.data.id || d.data.uid || ""; }
      if (!songUrl && d?.url) songUrl = d.url;
      if (!songId && d?.id) songId = d.id;

      if (songUrl) {
        const song = { id: songId || ("local_" + Date.now()), url: songUrl,
          title: fileName.replace(/\.[^.]+$/, "").replace(/[_-]/g, " ").substring(0, 80),
          size: buf.length, uploadedAt: Date.now() };
        const songs = loadSongs();
        if (!songs.some((s) => s.url === song.url)) { songs.unshift(song); if (songs.length > 500) songs.length = 500; saveSongs(songs); }
        console.log("[音乐端点] 上传成功:", song.title);
        return res.json({ success: true, song });
      }
      return res.json({ success: true, warning: "未获取到链接" });
    } catch (e) {
      console.error("[音乐端点] 上传出错:", e.message);
      return res.status(500).json({ error: e.message });
    }
  });
});

router.delete("/delete", async (req, res) => {
  try {
    const fileId = req.query.id || "";
    if (!fileId) return res.status(400).json({ error: "缺少 id 参数" });
    if (!fileId.startsWith("local_")) {
      try { await proxyDelete(fileId); } catch (e) { console.warn("[音乐端点] API 删除失败:", e.message); }
    }
    const songs = loadSongs().filter((s) => s.id !== fileId);
    saveSongs(songs);
    return res.json({ success: true, songs });
  } catch (e) { return res.status(500).json({ error: e.message }); }
});

router.get("/list", (req, res) => res.json({ success: true, songs: loadSongs() }));

console.log("[音乐端点] 模块已加载");
