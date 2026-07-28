// 音乐上传扩展 — 前端 UI (悬浮球 + 上传面板 + 歌单)
// 通过本地代理 http://127.0.0.1:3457 上传
(function () {
  "use strict";
  var API = "http://127.0.0.1:3457";
  var BALL = 44, MAX_MB = 30;
  var EXTS = [".mp3", ".wav", ".ogg", ".flac", ".aac", ".m4a", ".wma"];
  var ST = { panel: false, ball: true, ctrl: false, up: false, queue: [], songs: [], purl: "", ptitle: "", playing: false };
  var _b, _r, _c, _p, _t, _drag, _dx, _dy, _sx, _sy;

  function $(s, c) { return (c || document).querySelector(s); }
  function D() { try { return (window.parent || window).document; } catch (e) { return document; } }
  function T(m, t) { try { if (typeof toastr !== "undefined") toastr[t || "info"](m); else console.log(m); } catch (e) { console.log(m); } }
  function FS(b) { return b < 1024 ? b + " B" : b < 1048576 ? (b / 1024).toFixed(1) + " KB" : (b / 1048576).toFixed(1) + " MB"; }
  function FT(ts) { var d = new Date(ts), p = function (n) { return n < 10 ? "0" + n : "" + n; }; return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()) + " " + p(d.getHours()) + ":" + p(d.getMinutes()); }
  function EH(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
  function EA(s) { return String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;"); }

  // === API ===
  function fe() {
    fetch(API + "/list").then(function (r) { return r.json(); }).then(function (d) {
      ST.songs = d.songs || []; RS();
    }).catch(function () { RS(); });
  }
  function doDelete(song) {
    if (!confirm("删除 " + song.title + "？")) return;
    fetch(API + "/delete?id=" + encodeURIComponent(song.id || ""), { method: "DELETE" })
      .then(function () { T("已删除: " + song.title, "success"); fe(); })
      .catch(function (e) { T("删除失败: " + e.message, "error"); });
  }

  // === 上传 (FormData → 代理) ===
  function upOne(file) {
    SP(file.name);
    var fd = new FormData();
    fd.append("file", file);
    fd.append("fileName", file.name);
    fd.append("uid", "sk_20260728_699d4929c1a448feb6c565e8dfbb3c3e");
    return fetch(API + "/upload", { method: "POST", body: fd }).then(function (r) { return r.json(); }).then(function (d) {
      HP();
      if (d && d._song) {
        T("上传成功: " + (d._song.title || file.name), "success");
        fe();
        if (d._song.url) { try { if (typeof appendAudioList === "function") appendAudioList("bgm", [{ title: d._song.title || file.name, url: d._song.url }]); } catch (e) { } }
      } else if (d && d.success !== false) { T("上传完成", "info"); fe(); }
      else { T("上传失败: " + ((d && d.message) || "未知"), "error"); }
    }).catch(function (e) { HP(); T("上传失败: " + e.message, "error"); });
  }
  function HF(files) {
    var vf = []; for (var i = 0; i < files.length; i++) { var f = files[i], nl = f.name.toLowerCase(); if (!EXTS.some(function (e) { return nl.endsWith(e); })) { T("跳过: " + f.name, "warning"); continue; } if (f.size > MAX_MB * 1048576) { T("过大(" + FS(f.size) + "): " + f.name, "error"); continue; } vf.push(f); }
    if (!vf.length) return; ST.queue = ST.queue.concat(vf); PQ();
  }
  function PQ() { if (ST.up || !ST.queue.length) return; ST.up = true; UQ(); var f = ST.queue.shift(); upOne(f).finally(function () { ST.up = false; UQ(); PQ(); }); }
  function UQ() { var q = $("#mu-queue"); if (q) { if (ST.queue.length) { q.style.display = "block"; q.textContent = "队列: " + ST.queue.length + " 个"; } else q.style.display = "none"; } }
  function SP(n) { var p = $("#mu-prog"); if (p) { p.style.display = "block"; var nn = $("#mu-pname"); if (nn) nn.textContent = n; } }
  function HP() { var p = $("#mu-prog"); if (p) p.style.display = "none"; }

  // === 播放 ===
  function play(url, title) { try { if (typeof playAudio === "function") { playAudio("bgm", { title: title, url: url }); ST.purl = url; ST.ptitle = title; ST.playing = true; UP(); } } catch (e) { } }
  function tog() { try { if (ST.playing) { if (typeof pauseAudio === "function") pauseAudio("bgm"); ST.playing = false; } else if (ST.purl) play(ST.purl, ST.ptitle); UP(); } catch (e) { } }
  function UP() { if (_b) { _b.innerHTML = ST.playing ? "🎶" : "🎵"; _b.classList.toggle("playing", ST.playing); } if (_r) _r.classList.toggle("playing", ST.playing); if (_c) { var b = $(".mu-playbtn", _c); if (b) b.textContent = ST.playing ? "⏸" : "▶"; var t = $(".ctitle", _c); if (t) t.textContent = ST.ptitle || "未播放"; } RS(); }

  // === UI: 样式 ===
  function IS() { var d = D(); if (d.getElementById("mu-ext-styles")) return; var s = d.createElement("style"); s.id = "mu-ext-styles"; s.textContent = "#mu-ball{position:fixed;z-index:2147483645;width:" + BALL + "px;height:" + BALL + "px;border-radius:50%;background:rgba(10,20,50,.9);border:1.5px solid rgba(212,168,67,.5);color:#d4a843;font-size:20px;display:flex;align-items:center;justify-content:center;cursor:pointer;user-select:none;touch-action:none;right:16px;bottom:100px;box-shadow:0 0 16px rgba(212,168,67,.3),0 4px 12px rgba(0,0,0,.4);transition:transform .15s,box-shadow .3s}#mu-ball:hover{transform:scale(1.08);box-shadow:0 0 24px rgba(212,168,67,.5)}#mu-ball.playing{animation:mu-pulse 2s ease-in-out infinite}@keyframes mu-pulse{0%,100%{box-shadow:0 0 16px rgba(212,168,67,.3)}50%{box-shadow:0 0 28px rgba(212,168,67,.6)}}#mu-ring{position:fixed;z-index:2147483644;width:" + (BALL + 16) + "px;height:" + (BALL + 16) + "px;border-radius:50%;border:2px solid rgba(212,168,67,.4);background:transparent;pointer-events:none;right:8px;bottom:92px;opacity:0}#mu-ring.playing{opacity:1!important;animation:mu-ring 2s ease-in-out infinite}@keyframes mu-ring{0%{transform:scale(1);opacity:.3}50%{transform:scale(1.15);opacity:.7}100%{transform:scale(1);opacity:.3}}#mu-ctrls{position:fixed;z-index:2147483644;right:16px;bottom:156px;padding:10px 14px;border-radius:16px;background:rgba(10,18,45,.94);border:1px solid rgba(212,168,67,.3);box-shadow:0 0 20px rgba(212,168,67,.2);display:none;min-width:180px;font-family:-apple-system,PingFang SC,Microsoft YaHei,sans-serif}.mu-btn{width:36px;height:36px;border-radius:50%;border:1px solid rgba(255,255,255,.15);background:rgba(255,255,255,.05);color:rgba(255,255,255,.7);cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all .15s;font-size:16px}.mu-btn:hover{background:rgba(212,168,67,.2);border-color:rgba(212,168,67,.5);color:#d4a843}#mu-panel{position:fixed;z-index:2147483643;right:16px;bottom:210px;width:380px;max-height:520px;border-radius:18px;background:rgba(10,18,45,.96);border:1px solid rgba(212,168,67,.3);box-shadow:0 0 30px rgba(0,0,0,.6);display:none;flex-direction:column;overflow:hidden;font-family:-apple-system,PingFang SC,Microsoft YaHei,sans-serif;font-size:13px;color:#ccc}#mu-panel .ph{padding:12px 16px;background:rgba(212,168,67,.08);border-bottom:1px solid rgba(212,168,67,.15);display:flex;justify-content:space-between;align-items:center}#mu-panel .ph h3{margin:0;font-size:15px;color:#d4a843}#mu-panel .pc{width:28px;height:28px;border-radius:50%;border:none;background:rgba(255,255,255,.08);color:#888;cursor:pointer}#mu-panel .pc:hover{background:rgba(255,80,80,.3);color:#f66}#mu-panel .uz{margin:12px 16px;padding:20px;border:2px dashed rgba(212,168,67,.3);border-radius:12px;text-align:center;cursor:pointer;background:rgba(255,255,255,.02)}#mu-panel .uz:hover{border-color:rgba(212,168,67,.7)}#mu-panel .uz.dragover{border-color:#d4a843;background:rgba(212,168,67,.1)}#mu-panel .uprog{display:none;margin:8px 16px;padding:8px 12px;background:rgba(212,168,67,.08);border-radius:8px;color:#d4a843;font-size:11px}#mu-panel .queue-info{display:none;padding:4px 16px 8px;color:#d4a843;font-size:11px}#mu-panel .slist{flex:1;overflow-y:auto;padding:0 16px 12px;min-height:0}#mu-panel .sitem{display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:10px;margin-bottom:4px;background:rgba(255,255,255,.02)}#mu-panel .sitem:hover{background:rgba(212,168,67,.06)}#mu-panel .sitem.active{background:rgba(212,168,67,.12);border:1px solid rgba(212,168,67,.2)}#mu-panel .splay{width:32px;height:32px;border-radius:50%;border:1px solid rgba(255,255,255,.15);background:rgba(255,255,255,.05);color:rgba(255,255,255,.6);cursor:pointer;flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:14px}#mu-panel .splay:hover{background:rgba(212,168,67,.25);border-color:rgba(212,168,67,.5);color:#d4a843}#mu-panel .sinfo{flex:1;min-width:0}#mu-panel .stitle{color:#ddd;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}#mu-panel .smeta{color:#666;font-size:10px;margin-top:2px}#mu-panel .sdel{width:28px;height:28px;border-radius:50%;border:none;background:transparent;color:#555;cursor:pointer;flex-shrink:0;font-size:14px;display:flex;align-items:center;justify-content:center}#mu-panel .sdel:hover{background:rgba(255,80,80,.2);color:#f66}@media(max-width:420px){#mu-panel{right:4px;left:4px;width:auto;max-height:55vh;bottom:195px}}"; d.head.appendChild(s); }

  // === UI: 构建 ===
  function BU() {
    var d = D(); if (d.getElementById("mu-ball")) return;
    _r = d.createElement("div"); _r.id = "mu-ring"; d.body.appendChild(_r);
    _c = d.createElement("div"); _c.id = "mu-ctrls"; _c.innerHTML = '<div style="font-size:11px;color:rgba(255,255,255,.5);text-align:center;margin-bottom:6px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:200px" class="ctitle">未播放</div><div style="display:flex;align-items:center;justify-content:center;gap:8px"><button class="mu-btn" data-cmd="prev">⏮</button><button class="mu-btn mu-playbtn" data-cmd="toggle" style="font-size:22px;width:42px;height:42px">▶</button><button class="mu-btn" data-cmd="next">⏭</button></div><div style="display:flex;align-items:center;gap:6px;margin-top:8px;padding:0 4px"><span style="color:rgba(255,255,255,.35);font-size:11px">🔈</span><input type="range" class="mu-vol" min="0" max="100" value="80" style="flex:1;height:3px;accent-color:#d4a843"><span style="color:rgba(255,255,255,.35);font-size:11px">🔊</span></div><div style="text-align:center;margin-top:6px"><button class="mu-btn" data-cmd="panel" style="font-size:12px;width:auto;height:24px;border-radius:12px;padding:0 10px">📁 歌曲管理</button></div>';
    d.body.appendChild(_c);
    _b = d.createElement("div"); _b.id = "mu-ball"; _b.innerHTML = "🎵"; _b.title = "音乐遥控器"; d.body.appendChild(_b);
    _p = d.createElement("div"); _p.id = "mu-panel"; _p.innerHTML = '<div class="ph"><h3>🎵 音乐管理</h3><button class="pc">✕</button></div><div class="uz" id="mu-uzone"><div style="font-size:32px;margin-bottom:6px">📤</div><div style="color:#999;font-size:12px">点击或拖拽音乐文件</div><div style="color:#666;font-size:11px;margin-top:4px">MP3/WAV/OGG/FLAC/AAC/M4A ≤' + MAX_MB + 'MB</div><input type="file" id="mu-filein" accept=".mp3,.wav,.ogg,.flac,.aac,.m4a,.wma,audio/*" multiple style="display:none"></div><div class="uprog" id="mu-prog"><div id="mu-pname"></div></div><div class="queue-info" id="mu-queue"></div><div class="slist" id="mu-slist"><div style="text-align:center;color:#555;padding:30px 0">📭 加载中...</div></div>';
    d.body.appendChild(_p);
    BE(); VU(); fe();
  }
  function VU() { if (_b) _b.style.display = ST.ball ? "flex" : "none"; if (_r) _r.style.display = ST.ball ? "block" : "none"; if (_c) { _c.style.display = (ST.ball && ST.ctrl) ? "block" : "none"; if (ST.ball && ST.ctrl) SPO(); } if (_p) _p.style.display = ST.panel ? "flex" : "none"; }
  function SPO() { if (!_b || !_c) return; var r = _b.getBoundingClientRect(); _c.style.left = (r.left - 70) + "px"; _c.style.top = (r.top - _c.offsetHeight - 12) + "px"; _c.style.right = "auto"; _c.style.bottom = "auto"; }
  function RS() { var l = $("#mu-slist"); if (!l) return; if (!ST.songs.length) { l.innerHTML = '<div style="text-align:center;color:#555;padding:30px 0">📭 暂无歌曲</div>'; return; } var h = ""; for (var i = 0; i < ST.songs.length; i++) { var s = ST.songs[i], act = s.url === ST.purl; h += '<div class="sitem' + (act ? " active" : "") + '" data-url="' + EA(s.url) + '" data-id="' + EA(s.id || "") + '"><button class="splay">' + (act ? "⏸" : "▶") + '</button><div class="sinfo"><div class="stitle">' + EH(s.title || s.url) + '</div><div class="smeta">' + FS(s.size || 0) + ' · ' + FT(s.uploadedAt || 0) + '</div></div><button class="sdel">🗑</button></div>'; } l.innerHTML = h; }

  // === 事件 ===
  function BE() {
    var d = D();
    _b.addEventListener("click", function (e) { if (_drag) return; ST.ctrl = !ST.ctrl; VU(); });
    _b.addEventListener("contextmenu", function (e) { e.preventDefault(); });
    _b.addEventListener("pointerdown", function (e) { if (e.pointerType === "mouse" && e.button !== 0) return; _b.setPointerCapture(e.pointerId); _drag = false; _sx = e.clientX; _sy = e.clientY; var r = _b.getBoundingClientRect(); _dx = e.clientX - r.left; _dy = e.clientY - r.top; _b.style.cursor = "grabbing"; _b.style.transition = "none"; });
    _b.addEventListener("pointermove", function (e) { if (!_sx) return; if (Math.abs(e.clientX - _sx) > 3 || Math.abs(e.clientY - _sy) > 3) _drag = true; if (!_drag) return; e.preventDefault(); _b.style.right = "auto"; _b.style.bottom = "auto"; _b.style.left = (e.clientX - _dx) + "px"; _b.style.top = (e.clientY - _dy) + "px"; if (_r) { _r.style.right = "auto"; _r.style.bottom = "auto"; _r.style.left = (e.clientX - _dx - 8) + "px"; _r.style.top = (e.clientY - _dy - 8) + "px"; } if (ST.ctrl) SPO(); });
    _b.addEventListener("pointerup", function () { _sx = 0; _b.style.cursor = "pointer"; _b.style.transition = "transform .15s,box-shadow .3s"; });
    _b.addEventListener("pointercancel", function () { _sx = 0; _b.style.cursor = "pointer"; _b.style.transition = "transform .15s,box-shadow .3s"; });
    _c.addEventListener("click", function (e) { var b = e.target.closest(".mu-btn"); if (!b) return; var cmd = b.getAttribute("data-cmd"); if (cmd === "toggle") tog(); else if (cmd === "prev" || cmd === "next") { try { if (typeof triggerSlash === "function") triggerSlash("/audioplay type=bgm"); } catch (ex) { } } else if (cmd === "panel") { ST.panel = !ST.panel; if (ST.panel) fe(); VU(); } });
    var vs = $(".mu-vol", _c); if (vs) vs.addEventListener("input", function () { try { if (typeof setAudioSettings === "function") setAudioSettings("bgm", { volume: parseInt(vs.value, 10) }); } catch (e) { } });
    var cb = $(".pc", _p); if (cb) cb.addEventListener("click", function () { ST.panel = false; VU(); });
    var uz = $("#mu-uzone"), fi = $("#mu-filein"); if (uz && fi) { uz.addEventListener("click", function () { fi.click(); }); uz.addEventListener("dragover", function (e) { e.preventDefault(); uz.classList.add("dragover"); }); uz.addEventListener("dragleave", function () { uz.classList.remove("dragover"); }); uz.addEventListener("drop", function (e) { e.preventDefault(); uz.classList.remove("dragover"); if (e.dataTransfer.files.length) HF(e.dataTransfer.files); }); fi.addEventListener("change", function () { if (fi.files.length) { HF(fi.files); fi.value = ""; } }); }
    var sl = $("#mu-slist"); if (sl) sl.addEventListener("click", function (e) { var it = e.target.closest(".sitem"); if (!it) return; var u = it.getAttribute("data-url"), id = it.getAttribute("data-id"), t = ($(".stitle", it) || {}).textContent || "未知"; if (e.target.closest(".splay")) { if (u === ST.purl && ST.playing) tog(); else play(u, t); } if (e.target.closest(".sdel")) doDelete({ id: id, url: u, title: t }); });
    d.addEventListener("dragover", function (e) { e.preventDefault(); });
    d.addEventListener("drop", function (e) { e.preventDefault(); if (_p && !_p.contains(e.target) && e.dataTransfer.files.length) { ST.panel = true; VU(); fe(); HF(e.dataTransfer.files); } });
  }

  // === 轮询 ===
  function PA() { try { if (typeof getCurrentAudio === "function") { var a = getCurrentAudio("bgm"); if (a && a.url) { ST.purl = a.url; ST.ptitle = a.title || ""; ST.playing = true; } } if (typeof getAudioSettings === "function") { var s = getAudioSettings("bgm"); if (s && !s.enabled) ST.playing = false; if (s && _c) { var v = $(".mu-vol", _c); if (v && String(v.value) !== String(s.volume)) v.value = s.volume; } } UP(); } catch (e) { } }
  function PT() { clearInterval(_t); PA(); _t = setInterval(PA, 2000); }

  // === 启动 ===
  IS(); BU(); PT();
  window.MusicUploader = { show: function () { ST.ball = true; VU(); }, hide: function () { ST.ball = false; ST.ctrl = false; ST.panel = false; VU(); }, toggle: function () { ST.ball ? this.hide() : this.show(); }, showPanel: function () { ST.ball = true; ST.panel = true; VU(); fe(); }, destroy: function () { clearInterval(_t); [_b, _r, _c, _p].forEach(function (e) { if (e && e.parentNode) e.remove(); }); } };
  console.log("[音乐扩展] 已加载 → 代理 " + API);
})();
