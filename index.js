// ============================================================
// 音乐上传扩展 v1.3 — 双环境兼容
// 服务端 (extensions/): Express 路由 + 上传代理 + HTML 注入
// 客户端 (third-party/): 自动加载 inject.js UI
// ============================================================
(function () {
  "use strict";

  // ============================================================
  // 环境检测：浏览器端 → 加载 inject.js 后退出
  // ============================================================
  if (typeof module === "undefined" || typeof require === "undefined") {
    var base = ".";
    var scripts = document.getElementsByTagName("script");
    for (var i = scripts.length - 1; i >= 0; i--) {
      var src = scripts[i].src || "";
      var idx = src.lastIndexOf("/");
      if (idx >= 0 && src.indexOf("index.js") === src.length - 8) {
        base = src.substring(0, idx);
        break;
      }
    }
    var s = document.createElement("script");
    s.src = base + "/inject.js";
    document.head.appendChild(s);
    console.log("[音乐扩展·客户端] UI 已加载");
    return;
  }

  // ============================================================
  // 以下为 Node.js 服务端代码
  // ============================================================
  const https = require("https");
  const fs = require("fs");
  const path = require("path");
  const crypto = require("crypto");

  const TOKEN = "sk_20260728_699d4929c1a448feb6c565e8dfbb3c3e";
  const UPLOAD_URL = "https://playground.z.wiki/img/api/upload";
  const DELETE_URL = "https://playground.z.wiki/img/delete";
  const FAILURE_URL = "https://playground.z.wiki/img/api/upload/failure-report";
  const MAX_FILE_MB = 30;
  const SONGS_FILE = path.join(__dirname, "songs.json");

  // ============================================================
  // 歌单持久化
  // ============================================================
  function loadSongs() {
    try { if (fs.existsSync(SONGS_FILE)) return JSON.parse(fs.readFileSync(SONGS_FILE, "utf8")); }
    catch (e) { console.error("[音乐扩展] 读取歌单失败:", e.message); }
    return [];
  }
  function saveSongs(songs) {
    try { fs.writeFileSync(SONGS_FILE, JSON.stringify(songs, null, 2), "utf8"); }
    catch (e) { console.error("[音乐扩展] 保存歌单失败:", e.message); }
  }
  function addSong(song) {
    const songs = loadSongs();
    if (!songs.some((s) => s.url === song.url)) {
      songs.unshift(song); if (songs.length > 500) songs.length = 500; saveSongs(songs);
    }
    return songs;
  }
  function removeSongFromList(id) {
    let songs = loadSongs(); songs = songs.filter((s) => s.id !== id); saveSongs(songs); return songs;
  }

  // ============================================================
  // API 代理
  // ============================================================
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
    return _request({
      hostname: u.hostname,
      path: "/img/delete?id=" + encodeURIComponent(fileId) + "&uid=" + encodeURIComponent(TOKEN),
      method: "DELETE", timeout: 30000,
    });
  }

  function reportFailure(text) {
    const pd = JSON.stringify({ uid: TOKEN, text: String(text).substring(0, 500) });
    const u = new URL(FAILURE_URL);
    _request({
      hostname: u.hostname, path: u.pathname, method: "POST",
      headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(pd) },
      timeout: 10000,
    }, pd).catch(() => {});
  }

  // ============================================================
  // HTML 自动注入中间件
  // ============================================================
  function injectMiddleware(req, res, next) {
    if (req.method !== "GET") return next();
    const p = req.path;
    if (p.startsWith("/api/") || p.startsWith("/css/") || p.startsWith("/scripts/") ||
        p.startsWith("/fonts/") || p.startsWith("/images/") || p.startsWith("/img/") ||
        p.startsWith("/socket.io/") || p.includes(".")) return next();

    req.headers["accept-encoding"] = "identity";
    const _write = res.write.bind(res), _end = res.end.bind(res), chunks = [];

    res.write = function (chunk, encoding) {
      if (chunk) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, encoding));
      return true;
    };
    res.end = function (chunk, encoding, callback) {
      if (chunk) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, encoding));
      try {
        const body = Buffer.concat(chunks).toString("utf8");
        if (body.includes("</body>") && (body.includes("<html") || body.includes("<!DOCTYPE"))) {
          const modified = body.replace("</body>",
            '<script src="/api/plugins/music/inject.js"></script>\n</body>');
          res.removeHeader("Content-Encoding");
          res.removeHeader("Transfer-Encoding");
          res.setHeader("Content-Length", Buffer.byteLength(modified));
          res.write = _write; res.end = _end;
          return _end.call(res, modified, "utf8", callback);
        }
      } catch (e) { /* 二进制跳过 */ }
      res.write = _write; res.end = _end;
      return _end.call(res, Buffer.concat(chunks), encoding, callback);
    };
    next();
  }

  // ============================================================
  // Express 路由注册
  // ============================================================
  function registerRoutes(app) {
    app.use(injectMiddleware);

    // 上传
    app.post("/api/plugins/music/upload", async (req, res) => {
      const chunks = []; req.on("data", (c) => chunks.push(c));
      req.on("end", async () => {
        try {
          const json = JSON.parse(Buffer.concat(chunks).toString("utf8"));
          const fileName = (json.name || "upload.mp3").replace(/[\\/:"*?<>|]/g, "_");
          const base64 = json.file || "";
          if (!base64) return res.status(400).json({ error: "缺少文件数据" });
          const comma = base64.indexOf(",");
          const raw = comma >= 0 ? base64.substring(comma + 1) : base64;
          let fileBuffer;
          try { fileBuffer = Buffer.from(raw, "base64"); }
          catch (e) { return res.status(400).json({ error: "base64 解码失败" }); }
          if (fileBuffer.length > MAX_FILE_MB * 1048576)
            return res.status(413).json({ error: "文件过大, 限制 " + MAX_FILE_MB + "MB" });

          console.log("[音乐扩展] 收到上传:", fileName, (fileBuffer.length / 1024).toFixed(1), "KB");
          const ext = path.extname(fileName).toLowerCase();
          const mimeMap = { ".mp3": "audio/mpeg", ".wav": "audio/wav", ".ogg": "audio/ogg",
            ".flac": "audio/flac", ".aac": "audio/aac", ".m4a": "audio/mp4", ".wma": "audio/x-ms-wma" };
          const result = await proxyUpload(fileBuffer, fileName, mimeMap[ext] || "audio/mpeg");

          let songUrl = "", songId = "";
          const d = result.data;
          if (d && d.data) { songUrl = d.data.url || d.data.link || ""; songId = d.data.id || d.data.uid || ""; }
          if (!songUrl && d && d.url) songUrl = d.url;
          if (!songId && d && d.id) songId = d.id;

          if (songUrl) {
            const song = { id: songId || ("local_" + Date.now()), url: songUrl,
              title: fileName.replace(/\.[^.]+$/, "").replace(/[_-]/g, " ").substring(0, 80),
              size: fileBuffer.length, uploadedAt: Date.now() };
            addSong(song);
            console.log("[音乐扩展] 上传成功:", song.title);
            return res.json({ success: true, song, apiResponse: result.data });
          }
          return res.json({ success: true, warning: "未获取到链接", apiResponse: result.data });
        } catch (e) {
          console.error("[音乐扩展] 上传出错:", e.message);
          reportFailure("上传失败: " + e.message);
          return res.status(500).json({ error: e.message });
        }
      });
    });

    // 删除
    app.delete("/api/plugins/music/delete", async (req, res) => {
      try {
        const fileId = req.query.id || "";
        if (!fileId) return res.status(400).json({ error: "缺少 id 参数" });
        let apiDeleted = false;
        if (!fileId.startsWith("local_")) {
          try { await proxyDelete(fileId); apiDeleted = true; }
          catch (e) { console.warn("[音乐扩展] API 删除失败:", e.message); }
        }
        return res.json({ success: true, apiDeleted, songs: removeSongFromList(fileId) });
      } catch (e) { return res.status(500).json({ error: e.message }); }
    });

    // 歌单
    app.get("/api/plugins/music/list", (req, res) => res.json({ success: true, songs: loadSongs() }));

    // 前端脚本
    app.get("/api/plugins/music/inject.js", (req, res) => {
      const p = path.join(__dirname, "inject.js");
      if (fs.existsSync(p)) { res.setHeader("Content-Type", "application/javascript"); res.sendFile(p); }
      else res.status(404).send("// not found");
    });

    // 独立面板
    app.get("/api/plugins/music/panel", (req, res) => {
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.send(getPanelHTML());
    });

    console.log("[音乐扩展] 路由已注册: POST/upload DELETE/delete GET/list GET/inject.js GET/panel");
  }

  // ============================================================
  // 面板 HTML（压缩版）
  // ============================================================
  function getPanelHTML() {
    return '<!DOCTYPE html><html lang="zh"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>🎵 音乐上传</title><style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:-apple-system,PingFang SC,Microsoft YaHei,sans-serif;background:linear-gradient(135deg,#0a122e,#1a1a3e);color:#ccc;min-height:100vh;display:flex;justify-content:center;align-items:flex-start;padding:20px}.c{width:100%;max-width:500px}h1{text-align:center;color:#d4a843;margin:20px 0;font-size:24px}.card{background:rgba(10,20,50,.85);border:1px solid rgba(212,168,67,.25);border-radius:16px;padding:20px;margin-bottom:16px;box-shadow:0 4px 20px rgba(0,0,0,.3)}.card h2{color:#d4a843;font-size:16px;margin-bottom:12px}.uz{border:2px dashed rgba(212,168,67,.35);border-radius:12px;padding:30px 20px;text-align:center;cursor:pointer;transition:all .2s;background:rgba(255,255,255,.02)}.uz:hover{border-color:rgba(212,168,67,.7);background:rgba(212,168,67,.05)}.uz.dragover{border-color:#d4a843;background:rgba(212,168,67,.1)}.icon{font-size:36px;margin-bottom:8px}.txt{color:#999;font-size:13px}.hint{color:#666;font-size:11px;margin-top:6px}.prog{display:none;background:rgba(212,168,67,.08);border-radius:8px;padding:10px 14px;margin-top:12px}.pbar{height:4px;background:rgba(255,255,255,.1);border-radius:2px;overflow:hidden;margin-top:6px}.pfill{height:100%;background:linear-gradient(90deg,#d4a843,#f0c060);width:0%;transition:width .3s;border-radius:2px}.pname{color:#d4a843;font-size:12px}.si{display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:10px;margin-bottom:4px;background:rgba(255,255,255,.02);transition:background .15s}.si:hover{background:rgba(212,168,67,.06)}.sp{width:34px;height:34px;border-radius:50%;border:1px solid rgba(255,255,255,.15);background:rgba(255,255,255,.05);color:rgba(255,255,255,.6);cursor:pointer;flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:15px}.sp:hover{background:rgba(212,168,67,.25);border-color:rgba(212,168,67,.5);color:#d4a843}.sinfo{flex:1;min-width:0}.stitle{color:#ddd;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.smeta{color:#666;font-size:10px;margin-top:2px}.sd{width:30px;height:30px;border-radius:50%;border:none;background:transparent;color:#555;cursor:pointer;flex-shrink:0;font-size:14px;display:flex;align-items:center;justify-content:center}.sd:hover{background:rgba(255,80,80,.2);color:#f66}.empty{text-align:center;color:#555;padding:30px 0;font-size:13px}.toast{position:fixed;top:20px;left:50%;transform:translateX(-50%);z-index:9999;padding:10px 24px;border-radius:8px;font-size:13px;display:none;max-width:400px;text-align:center}.toast.success{background:rgba(40,167,69,.9);color:#fff}.toast.error{background:rgba(220,53,69,.9);color:#fff}.toast.info{background:rgba(212,168,67,.9);color:#111}.qb{display:none;color:#d4a843;font-size:11px;padding:6px 0;text-align:center}@media(max-width:500px){body{padding:10px}.card{padding:14px}}</style></head><body><div class="c"><h1>🎵 音乐上传管理</h1><div class="card"><h2>📤 上传音乐</h2><div class="uz" id="uz"><div class="icon">📤</div><div class="txt">点击或拖拽音乐文件到此处</div><div class="hint">支持 MP3/WAV/OGG/FLAC/AAC/M4A，≤30MB</div><input type="file" id="fi" accept=".mp3,.wav,.ogg,.flac,.aac,.m4a,.wma,audio/*" multiple style="display:none"></div><div class="prog" id="prog"><div class="pname" id="pn"></div><div class="pbar"><div class="pfill" id="pf"></div></div></div><div class="qb" id="qb"></div></div><div class="card"><h2>🎶 歌曲列表 (<span id="sc">0</span>)</h2><div id="sl"><div class="empty">加载中...</div></div></div></div><div class="toast" id="toast"></div><script>(function(){var A="/api/plugins/music",M=30,E=[".mp3",".wav",".ogg",".flac",".aac",".m4a",".wma"],songs=[],up=false,q=[];function $(s){return document.querySelector(s)}function T(m,t){var o=$("#toast");o.textContent=m;o.className="toast "+(t||"info");o.style.display="block";setTimeout(function(){o.style.display="none"},3000)}function FS(b){return b<1024?b+" B":b<1048576?(b/1024).toFixed(1)+" KB":(b/1048576).toFixed(1)+" MB"}function FT(ts){var d=new Date(ts),p=function(n){return n<10?"0"+n:""+n};return d.getFullYear()+"-"+p(d.getMonth()+1)+"-"+p(d.getDate())+" "+p(d.getHours())+":"+p(d.getMinutes())}function fe(){fetch(A+"/list").then(function(r){return r.json()}).then(function(d){songs=d.songs||[];RS()}).catch(function(e){console.error(e)})}function RS(){var l=$("#sl");$("#sc").textContent=songs.length;if(!songs.length){l.innerHTML=\'<div class="empty">📭 还没有上传歌曲</div>\';return}var h="";songs.forEach(function(s){h+=\'<div class="si" data-url="\'+EA(s.url)+\'" data-id="\'+EA(s.id||"")+\'"><button class="sp">▶</button><div class="sinfo"><div class="stitle">\'+EH(s.title)+\'</div><div class="smeta">\'+FS(s.size||0)+" · "+FT(s.uploadedAt||0)+\'</div></div><button class="sd">🗑</button></div>\'});l.innerHTML=h}function EH(s){return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")}function EA(s){return String(s).replace(/&/g,"&amp;").replace(/"/g,"&quot;")}function SP(n,p){$("#prog").style.display="block";$("#pn").textContent=n;$("#pf").style.width=Math.min(p||10,100)+"%"}function HP(){$("#prog").style.display="none"}function RF(file){return new Promise(function(ok,no){var r=new FileReader();r.onload=function(){ok(r.result)};r.onerror=function(){no(new Error("读取失败"))};r.readAsDataURL(file)})}function UO(file){SP(file.name,5);return RF(file).then(function(b64){SP(file.name,30);return fetch(A+"/upload",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({file:b64,name:file.name})})}).then(function(r){return r.json()}).then(function(d){if(d.success){if(d.warning)T(d.warning,"warning");else T("上传成功: "+(d.song?d.song.title:file.name),"success");fe()}else T("上传失败: "+(d.error||"未知错误"),"error")}).catch(function(e){T("上传失败: "+e.message,"error")}).finally(function(){HP()})}function HF(files){var vf=[];for(var i=0;i<files.length;i++){var f=files[i],nl=f.name.toLowerCase();if(!E.some(function(e){return nl.endsWith(e)})){T("跳过: "+f.name,"info");continue}if(f.size>M*1048576){T("过大("+FS(f.size)+"): "+f.name,"error");continue}vf.push(f)}if(!vf.length)return;q=q.concat(vf);PQ()}function PQ(){if(up||!q.length)return;up=true;UQ();var f=q.shift();UO(f).finally(function(){up=false;UQ();PQ()})}function UQ(){var o=$("#qb");if(q.length){o.style.display="block";o.textContent="⏳ 队列: "+q.length+" 个文件"}else o.style.display="none"}$("#uz").addEventListener("click",function(){$("#fi").click()});$("#uz").addEventListener("dragover",function(e){e.preventDefault();$("#uz").classList.add("dragover")});$("#uz").addEventListener("dragleave",function(){$("#uz").classList.remove("dragover")});$("#uz").addEventListener("drop",function(e){e.preventDefault();$("#uz").classList.remove("dragover");if(e.dataTransfer.files.length)HF(e.dataTransfer.files)});$("#fi").addEventListener("change",function(){if($("#fi").files.length){HF($("#fi").files);$("#fi").value=""}});$("#sl").addEventListener("click",function(e){var i=e.target.closest(".si");if(!i)return;var u=i.getAttribute("data-url"),id=i.getAttribute("data-id"),t=i.querySelector(".stitle").textContent;if(e.target.closest(".sp")){var a=document.createElement("audio");a.src=u;a.controls=true;a.style.width="100%";a.play().catch(function(){});T("正在播放: "+t,"info")}if(e.target.closest(".sd")){if(!confirm("确定删除 "+t+"？"))return;fetch(A+"/delete?id="+encodeURIComponent(id),{method:"DELETE"}).then(function(r){return r.json()}).then(function(){T("已删除: "+t,"success");fe()}).catch(function(e){T("删除失败: "+e.message,"error")})}});document.addEventListener("dragover",function(e){e.preventDefault()});document.addEventListener("drop",function(e){e.preventDefault();if(e.dataTransfer.files.length)HF(e.dataTransfer.files)});fe()})();</script></body></html>';
  }

  // ============================================================
  // 扩展入口
  // ============================================================
  function init(app) {
    console.log("[音乐扩展] ================================");
    console.log("[音乐扩展] 🎵 v1.3 双环境兼容");
    console.log("[音乐扩展] Token: " + TOKEN.substring(0, 10) + "...");
    console.log("[音乐扩展] ================================");
    registerRoutes(app);
  }

  if (typeof module !== "undefined" && module.exports) {
    module.exports = { init, registerRoutes };
  }

  if (require.main === module) {
    console.log("[音乐扩展] 独立模式启动...");
    const express = require("express");
    const app = express();
    app.use(express.json({ limit: "50mb" }));
    registerRoutes(app);
    const PORT = process.env.PORT || 3457;
    app.listen(PORT, "0.0.0.0", () => console.log("[音乐扩展] → http://localhost:" + PORT));
  }
})();
