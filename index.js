// ============================================================
// 音乐上传扩展 — 酒馆扩展 (Server-Side)
// 功能: 接收前端上传 → 解码 → 转发 API → 存储歌单
// 端口: 注册到酒馆 Express 路由, 走 127.0.0.1:8000
// 安装: 放到酒馆 extensions/music-upload/ 文件夹即可
// ============================================================
"use strict";

const https = require("https");
const http = require("http");
const fs = require("fs");
const path = require("path");
const url = require("url");
const crypto = require("crypto");

// ============================================================
// 配置
// ============================================================
const TOKEN = "sk_20260728_699d4929c1a448feb6c565e8dfbb3c3e";
const UPLOAD_URL = "https://playground.z.wiki/img/api/upload";
const DELETE_URL = "https://playground.z.wiki/img/delete";
const FAILURE_URL = "https://playground.z.wiki/img/api/upload/failure-report";
const MAX_FILE_MB = 30;

// 歌单存储文件（存在扩展目录下）
const SONGS_FILE = path.join(__dirname, "songs.json");

// ============================================================
// 歌单持久化
// ============================================================
function loadSongs() {
  try {
    if (fs.existsSync(SONGS_FILE)) {
      return JSON.parse(fs.readFileSync(SONGS_FILE, "utf8"));
    }
  } catch (e) {
    console.error("[音乐扩展] 读取歌单失败:", e.message);
  }
  return [];
}

function saveSongs(songs) {
  try {
    fs.writeFileSync(SONGS_FILE, JSON.stringify(songs, null, 2), "utf8");
  } catch (e) {
    console.error("[音乐扩展] 保存歌单失败:", e.message);
  }
}

function addSong(song) {
  const songs = loadSongs();
  // 去重
  if (!songs.some((s) => s.url === song.url)) {
    songs.unshift(song);
    if (songs.length > 500) songs.length = 500;
    saveSongs(songs);
  }
  return songs;
}

function removeSongFromList(id) {
  let songs = loadSongs();
  songs = songs.filter((s) => s.id !== id);
  saveSongs(songs);
  return songs;
}

// ============================================================
// API 代理 — 上传文件到 playground.z.wiki
// ============================================================
function proxyUpload(fileBuffer, fileName, fileType) {
  return new Promise((resolve, reject) => {
    const boundary = "----FormBoundary" + crypto.randomBytes(16).toString("hex");
    const CRLF = "\r\n";

    // 手动构造 multipart/form-data
    const parts = [];
    const addPart = (name, value, filename, contentType) => {
      let header = "--" + boundary + CRLF;
      header +=
        'Content-Disposition: form-data; name="' + name + '"';
      if (filename) {
        header += '; filename="' + filename + '"';
      }
      header += CRLF;
      if (contentType) {
        header += "Content-Type: " + contentType + CRLF;
      }
      header += CRLF;
      parts.push(Buffer.from(header, "utf8"));
      parts.push(typeof value === "string" ? Buffer.from(value, "utf8") : value);
      parts.push(Buffer.from(CRLF, "utf8"));
    };

    addPart("file", fileBuffer, fileName, fileType || "audio/mpeg");
    addPart("fileName", fileName);
    addPart("uid", TOKEN);

    const endBoundary = Buffer.from("--" + boundary + "--" + CRLF, "utf8");
    const body = Buffer.concat([...parts, endBoundary]);

    const parsedUrl = new URL(UPLOAD_URL);
    const options = {
      hostname: parsedUrl.hostname,
      path: parsedUrl.pathname + parsedUrl.search,
      method: "POST",
      headers: {
        "Content-Type": "multipart/form-data; boundary=" + boundary,
        "Content-Length": body.length,
      },
      timeout: 120000,
    };

    const req = https.request(options, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        const respText = Buffer.concat(chunks).toString();
        console.log("[音乐扩展] 上传响应 HTTP", res.statusCode, "|", respText.substring(0, 200));
        try {
          const data = JSON.parse(respText);
          resolve({ status: res.statusCode, data });
        } catch (e) {
          resolve({ status: res.statusCode, data: { raw: respText } });
        }
      });
    });

    req.on("error", (e) => {
      console.error("[音乐扩展] 上传转发失败:", e.message);
      reject(e);
    });
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("上传超时"));
    });

    req.write(body);
    req.end();
  });
}

function proxyDelete(fileId) {
  return new Promise((resolve, reject) => {
    const apiPath = "/img/delete?id=" + encodeURIComponent(fileId) + "&uid=" + encodeURIComponent(TOKEN);
    const parsedUrl = new URL(DELETE_URL);
    const options = {
      hostname: parsedUrl.hostname,
      path: apiPath,
      method: "DELETE",
      timeout: 30000,
    };

    const req = https.request(options, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        const respText = Buffer.concat(chunks).toString();
        console.log("[音乐扩展] 删除响应 HTTP", res.statusCode, "|", respText.substring(0, 200));
        try {
          resolve(JSON.parse(respText));
        } catch (e) {
          resolve({ raw: respText });
        }
      });
    });

    req.on("error", (e) => {
      console.error("[音乐扩展] 删除转发失败:", e.message);
      reject(e);
    });

    req.end();
  });
}

function reportFailure(text) {
  try {
    const postData = JSON.stringify({
      uid: TOKEN,
      text: String(text).substring(0, 500),
    });
    const parsedUrl = new URL(FAILURE_URL);
    const options = {
      hostname: parsedUrl.hostname,
      path: parsedUrl.pathname,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(postData),
      },
      timeout: 10000,
    };
    const req = https.request(options);
    req.write(postData);
    req.end();
  } catch (e) {}
}

// ============================================================
// HTML 注入中间件 — 将前端脚本注入酒馆页面（尽力而为）
// 如果酒馆启用了压缩中间件，此注入可能不生效
// 备选方案：用户手动添加 <script src="/api/plugins/music/inject.js"></script>
//          或访问 /api/plugins/music/panel 独立面板
// ============================================================
function injectMiddleware(req, res, next) {
  // 只拦截 HTML 页面的 GET 请求，跳过 API 和静态资源
  const ct = res.getHeader("Content-Type") || res.getHeader("content-type") || "";
  if (req.method !== "GET" || ct.includes("json") || ct.includes("javascript") ||
      ct.includes("css") || ct.includes("image") || ct.includes("font") ||
      req.path.startsWith("/api/") || req.path.startsWith("/css/") ||
      req.path.startsWith("/scripts/") || req.path.startsWith("/fonts/") ||
      req.path.startsWith("/images/") || req.path.startsWith("/img/")) {
    return next();
  }

  const _write = res.write.bind(res);
  const _end = res.end.bind(res);
  const chunks = [];
  let hijacked = false;

  res.write = function (chunk, encoding, callback) {
    hijacked = true;
    if (chunk) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, encoding));
    return true;
  };

  res.end = function (chunk, encoding, callback) {
    if (!hijacked) {
      // 没有调用过 write，直接 end — 可能是静态文件
      return _end(chunk, encoding, callback);
    }
    if (chunk) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, encoding));
    try {
      const body = Buffer.concat(chunks).toString("utf8");
      if (body.includes("</body>")) {
        const injectTag = '<script src="/api/plugins/music/inject.js"></script>';
        const modified = body.replace("</body>", injectTag + "\n</body>");
        res.write = _write;
        res.end = _end;
        return _end(modified, "utf8", callback);
      }
    } catch (e) {
      // 二进制内容，跳过
    }
    // 回退
    res.write = _write;
    res.end = _end;
    const buf = Buffer.concat(chunks);
    return _end(buf, encoding, callback);
  };

  next();
}

// ============================================================
// Express 路由注册
// ============================================================
function registerRoutes(app) {
  // ── 注入中间件（尝试自动注入前端脚本）──
  app.use(injectMiddleware);

  // ── 上传: POST /api/plugins/music/upload ──
  // Body: JSON { file: "<base64>", name: "song.mp3" }
  app.post("/api/plugins/music/upload", async (req, res) => {
    try {
      // 收集请求体
      const chunks = [];
      req.on("data", (c) => chunks.push(c));
      req.on("end", async () => {
        try {
          const body = Buffer.concat(chunks).toString("utf8");
          const json = JSON.parse(body);
          const fileName = (json.name || "upload.mp3").replace(/[\\/:"*?<>|]/g, "_");
          const base64 = json.file || "";

          if (!base64) {
            return res.status(400).json({ error: "缺少文件数据" });
          }

          // 解码 base64（支持 data:xxx;base64, 前缀）
          const comma = base64.indexOf(",");
          const raw = comma >= 0 ? base64.substring(comma + 1) : base64;
          let fileBuffer;
          try {
            fileBuffer = Buffer.from(raw, "base64");
          } catch (e) {
            return res.status(400).json({ error: "base64 解码失败: " + e.message });
          }

          // 大小限制
          if (fileBuffer.length > MAX_FILE_MB * 1048576) {
            return res.status(413).json({ error: "文件过大, 限制 " + MAX_FILE_MB + "MB" });
          }

          console.log("[音乐扩展] 收到上传:", fileName, (fileBuffer.length / 1024).toFixed(1), "KB");

          // 检测 MIME 类型
          const ext = path.extname(fileName).toLowerCase();
          const mimeMap = {
            ".mp3": "audio/mpeg", ".wav": "audio/wav", ".ogg": "audio/ogg",
            ".flac": "audio/flac", ".aac": "audio/aac", ".m4a": "audio/mp4",
            ".wma": "audio/x-ms-wma",
          };
          const fileType = mimeMap[ext] || "audio/mpeg";

          // 转发到 API
          const result = await proxyUpload(fileBuffer, fileName, fileType);

          // 提取 URL 和 ID
          let songUrl = "";
          let songId = "";
          if (result.data && result.data.data) {
            songUrl = result.data.data.url || result.data.data.link || "";
            songId = result.data.data.id || result.data.data.uid || "";
          }
          if (!songUrl && result.data && result.data.url) songUrl = result.data.url;
          if (!songId && result.data && result.data.id) songId = result.data.id;

          if (songUrl) {
            const song = {
              id: songId || ("local_" + Date.now()),
              url: songUrl,
              title: fileName.replace(/\.[^.]+$/, "").replace(/[_-]/g, " ").substring(0, 80),
              size: fileBuffer.length,
              uploadedAt: Date.now(),
            };
            addSong(song);
            console.log("[音乐扩展] 上传成功:", song.title, "→", songUrl);
            return res.json({ success: true, song, apiResponse: result.data });
          } else {
            console.warn("[音乐扩展] 上传完成但未获取到链接:", JSON.stringify(result.data).substring(0, 300));
            return res.json({ success: true, warning: "上传完成但未获取到链接", apiResponse: result.data });
          }
        } catch (e) {
          console.error("[音乐扩展] 处理上传出错:", e.message);
          reportFailure("上传处理失败: " + e.message);
          return res.status(500).json({ error: e.message });
        }
      });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  });

  // ── 删除: DELETE /api/plugins/music/delete?id=xxx ──
  app.delete("/api/plugins/music/delete", async (req, res) => {
    try {
      const fileId = req.query.id || "";
      if (!fileId) {
        return res.status(400).json({ error: "缺少 id 参数" });
      }

      console.log("[音乐扩展] 删除请求, id:", fileId);

      // 尝试从 API 删除
      let apiDeleted = false;
      if (!fileId.startsWith("local_")) {
        try {
          await proxyDelete(fileId);
          apiDeleted = true;
        } catch (e) {
          console.warn("[音乐扩展] API 删除失败:", e.message);
        }
      }

      // 从本地歌单移除
      const songs = removeSongFromList(fileId);

      return res.json({ success: true, apiDeleted, songs });
    } catch (e) {
      console.error("[音乐扩展] 删除出错:", e.message);
      return res.status(500).json({ error: e.message });
    }
  });

  // ── 列表: GET /api/plugins/music/list ──
  app.get("/api/plugins/music/list", (req, res) => {
    const songs = loadSongs();
    return res.json({ success: true, songs });
  });

  // ── 提供前端注入脚本 ──
  app.get("/api/plugins/music/inject.js", (req, res) => {
    const injectPath = path.join(__dirname, "inject.js");
    if (fs.existsSync(injectPath)) {
      res.setHeader("Content-Type", "application/javascript");
      res.sendFile(injectPath);
    } else {
      res.status(404).send("// inject.js not found");
    }
  });

  // ── 提供前端样式 ──
  app.get("/api/plugins/music/style.css", (req, res) => {
    const cssPath = path.join(__dirname, "style.css");
    if (fs.existsSync(cssPath)) {
      res.setHeader("Content-Type", "text/css");
      res.sendFile(cssPath);
    } else {
      res.status(404).send("/* style.css not found */");
    }
  });

  // ── 独立面板页面（不依赖注入，直接访问即可使用）──
  app.get("/api/plugins/music/panel", (req, res) => {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(`<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>🎵 音乐上传管理</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:-apple-system,PingFang SC,Microsoft YaHei,sans-serif;
    background:linear-gradient(135deg,#0a122e,#1a1a3e);color:#ccc;min-height:100vh;
    display:flex;justify-content:center;align-items:flex-start;padding:20px}
  .container{width:100%;max-width:500px}
  h1{text-align:center;color:#d4a843;margin:20px 0;font-size:24px}
  .card{background:rgba(10,20,50,0.85);border:1px solid rgba(212,168,67,0.25);
    border-radius:16px;padding:20px;margin-bottom:16px;box-shadow:0 4px 20px rgba(0,0,0,0.3)}
  .card h2{color:#d4a843;font-size:16px;margin-bottom:12px}
  .upload-zone{border:2px dashed rgba(212,168,67,0.35);border-radius:12px;padding:30px 20px;
    text-align:center;cursor:pointer;transition:all 0.2s;background:rgba(255,255,255,0.02)}
  .upload-zone:hover{border-color:rgba(212,168,67,0.7);background:rgba(212,168,67,0.05)}
  .upload-zone.dragover{border-color:#d4a843;background:rgba(212,168,67,0.1)}
  .upload-zone .icon{font-size:36px;margin-bottom:8px}
  .upload-zone .text{color:#999;font-size:13px}
  .upload-zone .hint{color:#666;font-size:11px;margin-top:6px}
  .progress{display:none;background:rgba(212,168,67,0.08);border-radius:8px;padding:10px 14px;margin-top:12px}
  .progress .pname{color:#d4a843;font-size:12px;margin-bottom:6px}
  .progress .pbar{height:4px;background:rgba(255,255,255,0.1);border-radius:2px;overflow:hidden}
  .progress .pfill{height:100%;background:linear-gradient(90deg,#d4a843,#f0c060);width:0%;transition:width 0.3s;border-radius:2px}
  .song-item{display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:10px;
    margin-bottom:4px;background:rgba(255,255,255,0.02);transition:background 0.15s}
  .song-item:hover{background:rgba(212,168,67,0.06)}
  .song-item.active{background:rgba(212,168,67,0.12);border:1px solid rgba(212,168,67,0.2)}
  .song-play{width:34px;height:34px;border-radius:50%;border:1px solid rgba(255,255,255,0.15);
    background:rgba(255,255,255,0.05);color:rgba(255,255,255,0.6);cursor:pointer;flex-shrink:0;
    display:flex;align-items:center;justify-content:center;font-size:15px}
  .song-play:hover{background:rgba(212,168,67,0.25);border-color:rgba(212,168,67,0.5);color:#d4a843}
  .song-info{flex:1;min-width:0}
  .song-title{color:#ddd;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .song-meta{color:#666;font-size:10px;margin-top:2px}
  .song-del{width:30px;height:30px;border-radius:50%;border:none;background:transparent;
    color:#555;cursor:pointer;flex-shrink:0;font-size:14px;display:flex;align-items:center;justify-content:center}
  .song-del:hover{background:rgba(255,80,80,0.2);color:#f66}
  .empty{text-align:center;color:#555;padding:30px 0;font-size:13px}
  .toast{position:fixed;top:20px;left:50%;transform:translateX(-50%);z-index:9999;
    padding:10px 24px;border-radius:8px;font-size:13px;display:none;max-width:400px;text-align:center}
  .toast.success{background:rgba(40,167,69,0.9);color:#fff}
  .toast.error{background:rgba(220,53,69,0.9);color:#fff}
  .toast.info{background:rgba(212,168,67,0.9);color:#111}
  .queue-bar{display:none;color:#d4a843;font-size:11px;padding:6px 0;text-align:center}
  @media (max-width:500px){body{padding:10px}.card{padding:14px}}
</style>
</head>
<body>
<div class="container">
  <h1>🎵 音乐上传管理</h1>

  <div class="card">
    <h2>📤 上传音乐</h2>
    <div class="upload-zone" id="uploadZone">
      <div class="icon">📤</div>
      <div class="text">点击此处选择文件，或拖拽文件到此处</div>
      <div class="hint">支持 MP3 / WAV / OGG / FLAC / AAC / M4A，单文件 ≤ 30MB</div>
      <input type="file" id="fileInput" accept=".mp3,.wav,.ogg,.flac,.aac,.m4a,.wma,audio/*" multiple style="display:none">
    </div>
    <div class="progress" id="progress">
      <div class="pname" id="pName"></div>
      <div class="pbar"><div class="pfill" id="pFill"></div></div>
    </div>
    <div class="queue-bar" id="queueBar"></div>
  </div>

  <div class="card">
    <h2>🎶 歌曲列表 (<span id="songCount">0</span>)</h2>
    <div id="songList"><div class="empty">加载中...</div></div>
  </div>
</div>

<div class="toast" id="toast"></div>

<script>
(function(){
  var API = "/api/plugins/music";
  var MAX_MB = 30;
  var EXTS = [".mp3",".wav",".ogg",".flac",".aac",".m4a",".wma"];
  var songs = [], uploading = false, queue = [];
  var $ = function(s){return document.querySelector(s);};

  function toast(msg, type){
    var t = $("#toast");
    t.textContent = msg; t.className = "toast " + (type||"info"); t.style.display = "block";
    setTimeout(function(){t.style.display = "none";}, 3000);
  }

  function formatSize(b){
    if(b<1024)return b+" B";
    if(b<1048576)return (b/1024).toFixed(1)+" KB";
    return (b/1048576).toFixed(1)+" MB";
  }

  function formatTime(ts){
    var d = new Date(ts), pad = function(n){return n<10?"0"+n:""+n;};
    return d.getFullYear()+"-"+pad(d.getMonth()+1)+"-"+pad(d.getDate())+" "+pad(d.getHours())+":"+pad(d.getMinutes());
  }

  function fetchSongs(){
    fetch(API+"/list").then(function(r){return r.json();}).then(function(d){
      songs = d.songs || []; renderSongs();
    }).catch(function(e){console.error(e);});
  }

  function renderSongs(){
    var list = $("#songList");
    $("#songCount").textContent = songs.length;
    if(!songs.length){list.innerHTML = '<div class="empty">📭 还没有上传歌曲</div>';return;}
    var h = "";
    songs.forEach(function(s){
      h += '<div class="song-item" data-url="'+escAttr(s.url)+'" data-id="'+escAttr(s.id||"")+'">'+
        '<button class="song-play">▶</button>'+
        '<div class="song-info"><div class="song-title">'+escHtml(s.title)+'</div>'+
        '<div class="song-meta">'+formatSize(s.size||0)+' · '+formatTime(s.uploadedAt||0)+'</div></div>'+
        '<button class="song-del">🗑</button></div>';
    });
    list.innerHTML = h;
    bindSongEvents();
  }

  function escHtml(s){return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");}
  function escAttr(s){return String(s).replace(/&/g,"&amp;").replace(/"/g,"&quot;");}

  function bindSongEvents(){
    $("#songList").onclick = function(e){
      var item = e.target.closest(".song-item");
      if(!item) return;
      var url = item.getAttribute("data-url");
      var id = item.getAttribute("data-id");
      var title = item.querySelector(".song-title").textContent;
      if(e.target.closest(".song-play")){
        // 通过酒馆音频 API 或直接打开
        var a = document.createElement("audio");
        a.src = url; a.controls = true; a.style.width = "100%"; a.play().catch(function(){});
        toast("正在播放: " + title, "info");
      }
      if(e.target.closest(".song-del")){
        if(!confirm("确定删除 "+title+" ？")) return;
        fetch(API+"/delete?id="+encodeURIComponent(id),{method:"DELETE"})
          .then(function(r){return r.json();})
          .then(function(){toast("已删除: "+title,"success");fetchSongs();})
          .catch(function(e){toast("删除失败: "+e.message,"error");});
      }
    };
  }

  function showProgress(name,pct){
    var p = $("#progress"); p.style.display = "block";
    $("#pName").textContent = name;
    $("#pFill").style.width = Math.min(pct||10,100)+"%";
  }
  function hideProgress(){ $("#progress").style.display = "none"; }

  function readFile(file){
    return new Promise(function(ok,no){
      var r = new FileReader();
      r.onload = function(){ok(r.result);};
      r.onerror = function(){no(new Error("读取失败"));};
      r.readAsDataURL(file);
    });
  }

  function uploadOne(file){
    showProgress(file.name, 5);
    return readFile(file).then(function(b64){
      showProgress(file.name, 30);
      return fetch(API+"/upload",{method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({file:b64,name:file.name})});
    }).then(function(r){return r.json();})
    .then(function(d){
      if(d.success){
        if(d.warning) toast(d.warning,"info");
        else toast("上传成功: "+(d.song?d.song.title:file.name),"success");
        fetchSongs();
      } else {
        toast("上传失败: "+(d.error||"未知错误"),"error");
      }
    }).catch(function(e){
      toast("上传失败: "+e.message,"error");
    }).finally(function(){hideProgress();});
  }

  function handleFiles(files){
    var vf = [];
    for(var i=0;i<files.length;i++){
      var f = files[i], nl = f.name.toLowerCase();
      if(!EXTS.some(function(e){return nl.endsWith(e);})){toast("跳过: "+f.name,"info");continue;}
      if(f.size>MAX_MB*1048576){toast("过大("+formatSize(f.size)+"): "+f.name,"error");continue;}
      vf.push(f);
    }
    if(!vf.length) return;
    queue = queue.concat(vf);
    processQueue();
  }

  function processQueue(){
    if(uploading || !queue.length) return;
    uploading = true; updateQueue();
    var f = queue.shift();
    uploadOne(f).finally(function(){uploading=false;updateQueue();processQueue();});
  }

  function updateQueue(){
    var q = $("#queueBar");
    if(queue.length){q.style.display="block";q.textContent="⏳ 队列: "+queue.length+" 个文件";}
    else q.style.display="none";
  }

  // 事件
  var uz = $("#uploadZone"), fi = $("#fileInput");
  uz.addEventListener("click",function(){fi.click();});
  uz.addEventListener("dragover",function(e){e.preventDefault();uz.classList.add("dragover");});
  uz.addEventListener("dragleave",function(){uz.classList.remove("dragover");});
  uz.addEventListener("drop",function(e){e.preventDefault();uz.classList.remove("dragover");
    if(e.dataTransfer.files.length) handleFiles(e.dataTransfer.files);});
  fi.addEventListener("change",function(){if(fi.files.length){handleFiles(fi.files);fi.value="";}});

  // 全局拖放
  document.addEventListener("dragover",function(e){e.preventDefault();});
  document.addEventListener("drop",function(e){e.preventDefault();
    if(e.dataTransfer.files.length) handleFiles(e.dataTransfer.files);});

  fetchSongs();
})();
</script>
</body>
</html>`);
  });

  console.log("[音乐扩展] 路由已注册:");
  console.log("  POST   /api/plugins/music/upload        — 上传音乐 (JSON: {file: base64, name: string})");
  console.log("  DELETE /api/plugins/music/delete?id=xxx — 删除音乐");
  console.log("  GET    /api/plugins/music/list          — 获取歌单");
  console.log("  GET    /api/plugins/music/inject.js     — 前端注入脚本");
  console.log("  GET    /api/plugins/music/panel         — 独立管理面板");
  console.log("  (已启用 HTML 自动注入中间件)");
}

// ============================================================
// 扩展入口 — 酒馆加载扩展时调用 init(app)
// ============================================================
function init(app) {
  console.log("[音乐扩展] ================================");
  console.log("[音乐扩展] 音乐上传扩展 v1.0 已加载");
  console.log("[音乐扩展] Token: " + TOKEN.substring(0, 10) + "...");
  console.log("[音乐扩展] ================================");

  registerRoutes(app);
}

// 兼容不同类型的导出
if (typeof module !== "undefined" && module.exports) {
  module.exports = { init, registerRoutes };
}

// 如果直接运行（node index.js），启动独立服务器
if (require.main === module) {
  console.log("[音乐扩展] 独立模式启动...");
  const express = require("express");
  const standaloneApp = express();
  standaloneApp.use(express.json({ limit: "50mb" }));
  registerRoutes(standaloneApp);
  const PORT = process.env.PORT || 3457;
  standaloneApp.listen(PORT, "0.0.0.0", () => {
    console.log("[音乐扩展] 独立服务器已启动 → http://localhost:" + PORT);
  });
}
