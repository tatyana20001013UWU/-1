// 音乐上传扩展 — 前端 UI v3 (纯代理, 手机适配)
(function () {
  "use strict";
  var API = "http://127.0.0.1:3457", B = 44, MAX = 30, EXTS = ".mp3.wav.ogg.flac.aac.m4a.wma".split(".");
  var S = { p: false, b: true, c: false, up: false, q: [], songs: [], pu: "", pt: "", pl: false };
  var _b, _r, _c, _p, _t, _drag, _dx, _dy, _sx, _sy, _a;

  function $(s, c) { return (c || document).querySelector(s); }
  function D() { try { return (window.parent || window).document; } catch (e) { return document; } }
  function T(m, t) { try { if (typeof toastr !== "undefined") toastr[t || "info"](m); } catch (e) { console.log(m); } }
  function FS(b) { return b < 1024 ? b + " B" : b < 1048576 ? (b / 1024).toFixed(1) + " KB" : (b / 1048576).toFixed(1) + " MB"; }
  function FT(ts) { var d = new Date(ts), p = function (n) { return n < 10 ? "0" + n : n; }; return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()) + " " + p(d.getHours()) + ":" + p(d.getMinutes()); }
  function EH(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
  function EA(s) { return String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;"); }

  // === API ===
  function fe() { fetch(API + "/list").then(function (r) { return r.json(); }).then(function (d) { S.songs = d.songs || []; RS(); }).catch(function () { RS(); }); }
  function del(song) { if (!confirm("删除 " + song.title + "？")) return; fetch(API + "/delete?id=" + encodeURIComponent(song.id || ""), { method: "DELETE" }).then(function () { T("已删除", "success"); fe(); }).catch(function (e) { T("删除失败", "error"); }); }

  // === 上传 (只走代理) ===
  function up(f) {
    SP(f.name);
    var fd = new FormData(); fd.append("file", f); fd.append("fileName", f.name); fd.append("uid", "sk_20260728_699d4929c1a448feb6c565e8dfbb3c3e");
    fetch(API + "/upload?title=" + encodeURIComponent(f.name.replace(/\.[^.]+$/, "")), { method: "POST", body: fd })
      .then(function (r) { return r.json(); }).then(function (d) {
        HP(); if (d && d._song) { T("上传成功: " + d._song.title, "success"); fe(); try { if (typeof appendAudioList === "function") appendAudioList("bgm", [{ title: d._song.title, url: d._song.url }]); } catch (e) { } }
        else if (d && d.success !== false) { T("上传完成", "info"); fe(); } else T("上传失败", "error");
      }).catch(function (e) { HP(); T("代理未启动", "error"); });
  }
  function HF(files) { var v = []; for (var i = 0; i < files.length; i++) { var f = files[i]; if (!EXTS.some(function (e) { return f.name.toLowerCase().endsWith(e); })) { T("跳过: " + f.name, "warning"); continue; } if (f.size > MAX * 1048576) { T("过大: " + f.name, "error"); continue; } v.push(f); } if (!v.length) return; S.q = S.q.concat(v); PQ(); }
  function PQ() { if (S.up || !S.q.length) return; S.up = true; UQ(); var f = S.q.shift(); up(f).finally(function () { S.up = false; UQ(); PQ(); }); }
  function UQ() { var q = $("#mu-queue"); if (q) { q.style.display = S.q.length ? "block" : "none"; q.textContent = S.q.length ? "⏳ 队列 " + S.q.length + " 首" : ""; } }
  function SP(n) { var p = $("#mu-prog"); if (p) { p.style.display = "block"; $("#mu-pname").textContent = "上传中: " + n; } }
  function HP() { var p = $("#mu-prog"); if (p) p.style.display = "none"; }

  // === 播放 ===
  function play(url, title) {
    S.pu = url; S.pt = title; S.pl = true;
    try { if (typeof playAudio === "function") playAudio("bgm", { title: title, url: url }); else throw 0; } catch (e) {
      try { if (typeof TavernHelper !== "undefined" && TavernHelper.playAudio) TavernHelper.playAudio("bgm", { title: title, url: url }); else throw 0; } catch (e2) {
        if (!_a) { _a = new Audio(); _a.volume = 0.8; } _a.src = url; _a.play().catch(function () { });
      }
    }
    UP();
  }
  function tog() { if (S.pl) { try { if (typeof pauseAudio === "function") pauseAudio("bgm"); else if (_a) _a.pause(); } catch (e) { if (_a) _a.pause(); } S.pl = false; } else if (S.pu) play(S.pu, S.pt); UP(); }
  function UP() { if (_b) { _b.innerHTML = S.pl ? "🎶" : "🎵"; _b.classList.toggle("playing", S.pl); } if (_r) _r.classList.toggle("playing", S.pl); if (_c) { var b = $(".mu-playbtn", _c); if (b) b.textContent = S.pl ? "⏸" : "▶"; var t = $(".ctitle", _c); if (t) t.textContent = S.pt || "未播放"; } RS(); }

  // === 样式 (含手机适配) ===
  function IS() { var d = D(); if (d.getElementById("mu-s")) return; var s = d.createElement("style"); s.id = "mu-s"; s.textContent = "#mu-ball{position:fixed;z-index:2147483645;width:" + B + "px;height:" + B + "px;border-radius:50%;background:rgba(10,20,50,.9);border:1.5px solid rgba(212,168,67,.5);color:#d4a843;font-size:20px;display:flex;align-items:center;justify-content:center;cursor:pointer;user-select:none;touch-action:none;right:16px;bottom:100px;box-shadow:0 0 16px rgba(212,168,67,.3);transition:transform .15s,box-shadow .3s}#mu-ball:hover{transform:scale(1.08);box-shadow:0 0 24px rgba(212,168,67,.5)}#mu-ball.playing{animation:mu-pulse 2s ease-in-out infinite}@keyframes mu-pulse{0%,100%{box-shadow:0 0 16px rgba(212,168,67,.3)}50%{box-shadow:0 0 28px rgba(212,168,67,.6)}}#mu-ring{position:fixed;z-index:2147483644;width:" + (B + 16) + "px;height:" + (B + 16) + "px;border-radius:50%;border:2px solid rgba(212,168,67,.4);background:transparent;pointer-events:none;right:8px;bottom:92px;opacity:0}#mu-ring.playing{opacity:1!important;animation:mu-ring 2s ease-in-out infinite}@keyframes mu-ring{0%{transform:scale(1);opacity:.3}50%{transform:scale(1.15);opacity:.7}100%{transform:scale(1);opacity:.3}}#mu-ctrls{position:fixed;z-index:2147483644;right:16px;bottom:156px;padding:10px 14px;border-radius:16px;background:rgba(10,18,45,.94);border:1px solid rgba(212,168,67,.3);box-shadow:0 0 20px rgba(0,0,0,.5);display:none;min-width:180px;font-family:system-ui,PingFang SC,Microsoft YaHei,sans-serif}.mu-btn{width:36px;height:36px;border-radius:50%;border:1px solid rgba(255,255,255,.15);background:rgba(255,255,255,.05);color:rgba(255,255,255,.7);cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all .15s;font-size:16px}.mu-btn:hover{background:rgba(212,168,67,.2);border-color:rgba(212,168,67,.5);color:#d4a843}#mu-panel{position:fixed;z-index:2147483643;right:16px;bottom:210px;width:400px;max-height:560px;border-radius:18px;background:rgba(10,18,50,.97);border:1px solid rgba(212,168,67,.3);box-shadow:0 0 40px rgba(0,0,0,.6);display:none;flex-direction:column;overflow:hidden;font-family:system-ui,PingFang SC,Microsoft YaHei,sans-serif;font-size:13px;color:#ccc}#mu-panel .ph{display:flex;align-items:center;justify-content:space-between;padding:14px 18px;background:rgba(212,168,67,.1);border-bottom:1px solid rgba(212,168,67,.15)}#mu-panel .ph h3{margin:0;font-size:16px;color:#d4a843}#mu-panel .ph .cnt{color:rgba(255,255,255,.4);font-size:12px}#mu-panel .pc{width:30px;height:30px;border-radius:50%;border:none;background:rgba(255,255,255,.08);color:#888;cursor:pointer;font-size:16px}#mu-panel .pc:hover{background:rgba(255,80,80,.3);color:#f66}#mu-panel .uz{margin:14px 18px;padding:24px 20px;border:2px dashed rgba(212,168,67,.3);border-radius:14px;text-align:center;cursor:pointer;transition:all .2s;background:rgba(255,255,255,.02)}#mu-panel .uz:hover{border-color:rgba(212,168,67,.7)}#mu-panel .uz.dragover{border-color:#d4a843;background:rgba(212,168,67,.1)}#mu-panel .uprog{display:none;margin:0 18px 10px;padding:10px 14px;background:rgba(212,168,67,.1);border-radius:10px;color:#d4a843;font-size:12px}#mu-panel .queue-info{display:none;padding:4px 18px 8px;color:#d4a843;font-size:11px}#mu-panel .songs{flex:1;overflow-y:auto;padding:4px 12px 14px;min-height:0;-webkit-overflow-scrolling:touch}#mu-panel .songs::-webkit-scrollbar{width:4px}#mu-panel .songs::-webkit-scrollbar-thumb{background:rgba(212,168,67,.3);border-radius:2px}#mu-panel .song{display:flex;align-items:center;gap:12px;padding:12px 14px;border-radius:12px;margin-bottom:2px;background:rgba(255,255,255,.02);cursor:pointer}#mu-panel .song:active{background:rgba(212,168,67,.1)}#mu-panel .song.playing{background:rgba(212,168,67,.14);border:1px solid rgba(212,168,67,.25)}#mu-panel .song .sidx{width:24px;text-align:center;color:rgba(255,255,255,.2);font-size:11px;flex-shrink:0}#mu-panel .song .splay{width:36px;height:36px;border-radius:50%;border:1px solid rgba(255,255,255,.15);background:rgba(255,255,255,.05);color:#d4a843;cursor:pointer;flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:15px;transition:all .15s}#mu-panel .song .splay:active{background:rgba(212,168,67,.3)}#mu-panel .song .sinfo{flex:1;min-width:0}#mu-panel .song .stitle{color:#eee;font-size:13px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}#mu-panel .song .smeta{color:#666;font-size:11px;margin-top:3px}#mu-panel .song .sdel{width:32px;height:32px;border-radius:50%;border:none;background:transparent;color:#555;cursor:pointer;flex-shrink:0;font-size:14px;display:flex;align-items:center;justify-content:center}#mu-panel .song .sdel:active{background:rgba(255,80,80,.3);color:#f66}.empty{text-align:center;color:#555;padding:40px 20px;font-size:13px;line-height:1.8}@media(max-width:480px){#mu-ball{right:8px;bottom:80px}#mu-ring{right:0;bottom:72px}#mu-ctrls{right:8px;bottom:136px}#mu-panel{right:0;left:0;bottom:0;width:100%;max-height:65vh;border-radius:18px 18px 0 0}#mu-panel .uz{margin:10px 14px;padding:18px 14px}#mu-panel .song{gap:8px;padding:10px 12px}}"; d.head.appendChild(s); }

  // === UI ===
  function BU() { var d = D(); if (d.getElementById("mu-ball")) return;
    _r = d.createElement("div"); _r.id = "mu-ring"; d.body.appendChild(_r);
    _c = d.createElement("div"); _c.id = "mu-ctrls"; _c.innerHTML = '<div class="ctitle" style="font-size:11px;color:rgba(255,255,255,.5);text-align:center;margin-bottom:8px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:200px">未播放</div><div style="display:flex;align-items:center;justify-content:center;gap:10px"><button class="mu-btn" data-cmd="prev">⏮</button><button class="mu-btn mu-playbtn" data-cmd="toggle" style="font-size:22px;width:44px;height:44px">▶</button><button class="mu-btn" data-cmd="next">⏭</button></div><div style="display:flex;align-items:center;gap:8px;margin-top:10px"><span style="color:rgba(255,255,255,.35);font-size:11px">🔈</span><input type="range" class="mu-vol" min="0" max="100" value="80" style="flex:1;height:4px;accent-color:#d4a843"><span style="color:rgba(255,255,255,.35);font-size:11px">🔊</span></div><div style="text-align:center;margin-top:10px"><button class="mu-btn" data-cmd="panel" style="font-size:12px;width:auto;height:26px;border-radius:13px;padding:0 12px">📁 歌单</button></div>'; d.body.appendChild(_c);
    _b = d.createElement("div"); _b.id = "mu-ball"; _b.innerHTML = "🎵"; _b.title = "音乐"; d.body.appendChild(_b);
    _p = d.createElement("div"); _p.id = "mu-panel"; _p.innerHTML = '<div class="ph"><div><h3>🎵 共享歌单</h3><span class="cnt" id="mu-cnt">加载中...</span></div><button class="pc">✕</button></div><div class="uz" id="mu-uzone"><div style="font-size:36px;margin-bottom:8px">📤</div><div style="color:#999;font-size:13px">点击选择文件或拖拽到这里</div><div style="color:#666;font-size:11px;margin-top:6px">MP3/WAV/OGG/FLAC/AAC/M4A ≤' + MAX + 'MB</div><input type="file" id="mu-fi" accept=".mp3,.wav,.ogg,.flac,.aac,.m4a,.wma,audio/*" multiple style="display:none"></div><div class="uprog" id="mu-prog"><span id="mu-pname"></span></div><div class="queue-info" id="mu-queue"></div><div class="songs" id="mu-songs"><div class="empty">📭 暂无歌曲<br><span style="font-size:11px">拖拽文件到上方区域上传</span></div></div>'; d.body.appendChild(_p);
    BE(); VU(); fe();
  }
  function VU() { if (_b) _b.style.display = S.b ? "flex" : "none"; if (_r) _r.style.display = S.b ? "block" : "none"; if (_c) { _c.style.display = (S.b && S.c) ? "block" : "none"; if (S.b && S.c) SPO(); } if (_p) _p.style.display = S.p ? "flex" : "none"; }
  function SPO() { if (!_b || !_c) return; var r = _b.getBoundingClientRect(); _c.style.left = (r.left - 80) + "px"; _c.style.top = (r.top - _c.offsetHeight - 14) + "px"; _c.style.right = "auto"; _c.style.bottom = "auto"; }
  function RS() { var l = $("#mu-songs"), cnt = $("#mu-cnt"); if (cnt) cnt.textContent = S.songs.length + " 首"; if (!l) return; if (!S.songs.length) { l.innerHTML = '<div class="empty">📭 暂无歌曲<br><span style="font-size:11px">拖拽文件到上方区域上传</span></div>'; return; } var h = ""; for (var i = 0; i < S.songs.length; i++) { var s = S.songs[i], act = s.url === S.pu; h += '<div class="song' + (act ? " playing" : "") + '" data-url="' + EA(s.url) + '" data-id="' + EA(s.id || "") + '"><span class="sidx">' + (i + 1) + '</span><button class="splay">' + (act ? "⏸" : "▶") + '</button><div class="sinfo"><div class="stitle">' + EH(s.title || s.url.split("/").pop() || "未知") + '</div><div class="smeta">' + FS(s.size || 0) + ' · ' + FT(s.uploadedAt || Date.now()) + '</div></div><button class="sdel">🗑</button></div>'; } l.innerHTML = h; }

  // === 事件 ===
  function BE() { var d = D();
    _b.addEventListener("click", function (e) { if (_drag) return; S.c = !S.c; VU(); }); _b.addEventListener("contextmenu", function (e) { e.preventDefault(); });
    _b.addEventListener("pointerdown", function (e) { if (e.pointerType === "mouse" && e.button !== 0) return; _b.setPointerCapture(e.pointerId); _drag = false; _sx = e.clientX; _sy = e.clientY; var r = _b.getBoundingClientRect(); _dx = e.clientX - r.left; _dy = e.clientY - r.top; _b.style.cursor = "grabbing"; _b.style.transition = "none"; });
    _b.addEventListener("pointermove", function (e) { if (!_sx) return; if (Math.abs(e.clientX - _sx) > 3 || Math.abs(e.clientY - _sy) > 3) _drag = true; if (!_drag) return; e.preventDefault(); _b.style.right = "auto"; _b.style.bottom = "auto"; _b.style.left = (e.clientX - _dx) + "px"; _b.style.top = (e.clientY - _dy) + "px"; if (_r) { _r.style.right = "auto"; _r.style.bottom = "auto"; _r.style.left = (e.clientX - _dx - 8) + "px"; _r.style.top = (e.clientY - _dy - 8) + "px"; } if (S.c) SPO(); });
    _b.addEventListener("pointerup", function () { _sx = 0; _b.style.cursor = "pointer"; _b.style.transition = "transform .15s,box-shadow .3s"; }); _b.addEventListener("pointercancel", function () { _sx = 0; _b.style.cursor = "pointer"; _b.style.transition = "transform .15s,box-shadow .3s"; });
    _c.addEventListener("click", function (e) { var b = e.target.closest(".mu-btn"); if (!b) return; var cmd = b.getAttribute("data-cmd"); if (cmd === "toggle") tog(); else if (cmd === "prev" || cmd === "next") { try { if (typeof triggerSlash === "function") triggerSlash("/audioplay type=bgm"); } catch (ex) { } } else if (cmd === "panel") { S.p = !S.p; if (S.p) fe(); VU(); } });
    var vs = $(".mu-vol", _c); if (vs) vs.addEventListener("input", function () { try { if (typeof setAudioSettings === "function") setAudioSettings("bgm", { volume: parseInt(vs.value, 10) }); } catch (e) { } });
    $(".pc", _p).addEventListener("click", function () { S.p = false; VU(); });
    var uz = $("#mu-uzone"), fi = $("#mu-fi"); uz.addEventListener("click", function () { fi.click(); }); uz.addEventListener("dragover", function (e) { e.preventDefault(); uz.classList.add("dragover"); }); uz.addEventListener("dragleave", function () { uz.classList.remove("dragover"); }); uz.addEventListener("drop", function (e) { e.preventDefault(); uz.classList.remove("dragover"); if (e.dataTransfer.files.length) HF(e.dataTransfer.files); }); fi.addEventListener("change", function () { if (fi.files.length) { HF(fi.files); fi.value = ""; } });
    $("#mu-songs").addEventListener("click", function (e) { var it = e.target.closest(".song"); if (!it) return; var u = it.getAttribute("data-url"), id = it.getAttribute("data-id"), t = ($(".stitle", it) || {}).textContent || "未知"; if (e.target.closest(".splay")) { if (u === S.pu && S.pl) tog(); else play(u, t); } if (e.target.closest(".sdel")) { e.stopPropagation(); del({ id: id, url: u, title: t }); } });
    d.addEventListener("dragover", function (e) { e.preventDefault(); }); d.addEventListener("drop", function (e) { e.preventDefault(); if (_p && !_p.contains(e.target) && e.dataTransfer.files.length) { S.p = true; VU(); fe(); HF(e.dataTransfer.files); } });
  }

  // === 同步 ===
  function PA() { try { if (typeof getCurrentAudio === "function") { var a = getCurrentAudio("bgm"); if (a && a.url) { S.pu = a.url; S.pt = a.title || ""; S.pl = true; } } if (typeof getAudioSettings === "function") { var s = getAudioSettings("bgm"); if (s && !s.enabled) S.pl = false; if (s && _c) { var v = $(".mu-vol", _c); if (v && String(v.value) !== String(s.volume)) v.value = s.volume; } } UP(); } catch (e) { } }
  function PT() { clearInterval(_t); PA(); _t = setInterval(PA, 2000); }

  IS(); BU(); PT();
  console.log("[音乐扩展] v3 就绪 → " + API);
})();
