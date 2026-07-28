// 音乐上传扩展 — 前端 UI
// 代理 http://127.0.0.1:3457
(function () {
  "use strict";
  var API = "http://127.0.0.1:3457";
  var B = 44, MB = 30;
  var EX = [".mp3", ".wav", ".ogg", ".flac", ".aac", ".m4a", ".wma"];
  var S = { panel: false, ball: true, ctrl: false, up: false, q: [], songs: [], purl: "", ptitle: "", playing: false };
  var _b, _r, _c, _p, _t, _drag, _dx, _dy, _sx, _sy;

  function $(s, c) { return (c || document).querySelector(s); }
  function D() { try { return (window.parent || window).document; } catch (e) { return document; } }
  function T(m, t) { try { if (typeof toastr !== "undefined") toastr[t || "info"](m); else console.log(m); } catch (e) { console.log(m); } }
  function FS(b) { return b < 1024 ? b + " B" : b < 1048576 ? (b / 1024).toFixed(1) + " KB" : (b / 1048576).toFixed(1) + " MB"; }
  function FT(ts) { var d = new Date(ts), p = function (n) { return n < 10 ? "0" + n : "" + n; }; return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()) + " " + p(d.getHours()) + ":" + p(d.getMinutes()); }
  function EH(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
  function EA(s) { return String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/\\/g, "\\\\"); }

  // === 歌单 ===
  function fe() {
    fetch(API + "/list").then(function (r) { return r.json(); }).then(function (d) {
      S.songs = d.songs || []; RS();
    }).catch(function () { RS(); });
  }
  function doDel(song) {
    if (!confirm("确定删除「" + song.title + "」？")) return;
    fetch(API + "/delete?id=" + encodeURIComponent(song.id || ""), { method: "DELETE" })
      .then(function () { T("已删除", "success"); fe(); })
      .catch(function (e) { T(e.message, "error"); });
  }
  function RS() {
    var l = $("#mu-slist"); if (!l) return;
    if (!S.songs.length) {
      l.innerHTML = '<div style="text-align:center;color:#555;padding:40px 0"><div style="font-size:40px;margin-bottom:8px">🎵</div>还没有歌曲<br><span style="font-size:11px;color:#444">上传后这里会显示共享歌单</span></div>';
      return;
    }
    var h = "";
    for (var i = 0; i < S.songs.length; i++) {
      var s = S.songs[i], act = s.url === S.purl;
      var title = s.title || "未知歌曲";
      var size = s.size ? FS(s.size) : "";
      var time = s.uploadedAt ? FT(s.uploadedAt) : "";
      h += '<div class="si' + (act ? " on" : "") + '" data-url="' + EA(s.url) + '" data-id="' + EA(s.id || "") + '">' +
        '<button class="sp" title="' + (act ? "暂停" : "播放") + '">' + (act ? "⏸" : "▶") + '</button>' +
        '<div class="sinfo">' +
          '<div class="st" title="' + EA(title) + '">' + EH(title) + '</div>' +
          '<div class="sm">' + size + (size && time ? " · " : "") + time + '</div>' +
        '</div>' +
        '<button class="sd" title="删除">✕</button>' +
      '</div>';
    }
    l.innerHTML = h;
  }

  // === 上传 ===
  function upOne(file) {
    SP(file.name);
    var fd = new FormData();
    fd.append("file", file);
    fd.append("fileName", file.name);
    fd.append("uid", "sk_20260728_699d4929c1a448feb6c565e8dfbb3c3e");
    return fetch(API + "/upload?name=" + encodeURIComponent(file.name), { method: "POST", body: fd })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        HP();
        if (d && d._song) {
          T("✅ " + (d._song.title || file.name), "success"); fe();
          try { if (typeof appendAudioList === "function") appendAudioList("bgm", [{ title: d._song.title || file.name, url: d._song.url }]); } catch (e) {}
        } else if (d && d.success !== false) { T("上传完成", "info"); fe(); }
        else { T("失败: " + ((d && d.message) || "未知"), "error"); }
      }).catch(function (e) { HP(); T(e.message, "error"); });
  }
  function HF(files) {
    var v = []; for (var i = 0; i < files.length; i++) { var f = files[i], nl = f.name.toLowerCase(); if (!EX.some(function (e) { return nl.endsWith(e); })) { T("跳过: " + f.name, "warning"); continue; } if (f.size > MB * 1048576) { T("过大: " + f.name, "error"); continue; } v.push(f); }
    if (!v.length) return; S.q = S.q.concat(v); PQ();
  }
  function PQ() { if (S.up || !S.q.length) return; S.up = true; UQ(); var f = S.q.shift(); upOne(f).finally(function () { S.up = false; UQ(); PQ(); }); }
  function UQ() { var q = $("#mu-queue"); if (q) q.textContent = S.q.length ? "⏳ 队列 " + S.q.length + " 个" : ""; }
  function SP(n) { var p = $("#mu-prog"); if (p) { p.style.display = "block"; var nn = $("#mu-pname"); if (nn) nn.textContent = "📤 " + n; } }
  function HP() { var p = $("#mu-prog"); if (p) p.style.display = "none"; }

  // === 播放 ===
  function play(url, title) { try { if (typeof playAudio === "function") { playAudio("bgm", { title: title, url: url }); S.purl = url; S.ptitle = title; S.playing = true; UP(); } } catch (e) {} }
  function tog() { try { if (S.playing) { if (typeof pauseAudio === "function") pauseAudio("bgm"); S.playing = false; } else if (S.purl) play(S.purl, S.ptitle); UP(); } catch (e) {} }
  function UP() {
    if (_b) { _b.innerHTML = S.playing ? "🎶" : "🎵"; _b.classList.toggle("on", S.playing); }
    if (_r) _r.classList.toggle("on", S.playing);
    if (_c) {
      var b = $(".mu-playbtn", _c); if (b) b.textContent = S.playing ? "⏸" : "▶";
      var t = $(".ctitle", _c); if (t) t.textContent = S.ptitle || "未播放";
    }
  }

  // === 面板 UI ===
  function RS2() { RS(); } // alias for refresh

  // === 样式 ===
  function IS() {
    var d = D(); if (d.getElementById("mu-styles")) return;
    var s = d.createElement("style"); s.id = "mu-styles"; s.textContent =
      "#mu-ball{position:fixed;z-index:9999998;width:" + B + "px;height:" + B + "px;border-radius:50%;background:rgba(10,20,50,.92);border:1.5px solid rgba(212,168,67,.5);color:#d4a843;font-size:20px;display:flex;align-items:center;justify-content:center;cursor:pointer;user-select:none;touch-action:none;right:16px;bottom:100px;box-shadow:0 0 16px rgba(212,168,67,.3);transition:transform .15s,box-shadow .3s;line-height:1}" +
      "#mu-ball:hover{transform:scale(1.08)}" +
      "#mu-ball.on{animation:mu-pulse 2s ease-in-out infinite}@keyframes mu-pulse{0%,100%{box-shadow:0 0 16px rgba(212,168,67,.3)}50%{box-shadow:0 0 28px rgba(212,168,67,.6)}}" +
      "#mu-ring{position:fixed;z-index:9999997;width:" + (B + 16) + "px;height:" + (B + 16) + "px;border-radius:50%;border:2px solid rgba(212,168,67,.4);pointer-events:none;right:8px;bottom:92px;opacity:0;transition:opacity .3s}" +
      "#mu-ring.on{opacity:1!important;animation:mu-ring 2s ease-in-out infinite}@keyframes mu-ring{0%{transform:scale(1);opacity:.3}50%{transform:scale(1.15);opacity:.7}100%{transform:scale(1);opacity:.3}}" +
      "#mu-ctrls{position:fixed;z-index:9999997;right:16px;bottom:156px;padding:12px 16px;border-radius:16px;background:rgba(10,18,45,.94);border:1px solid rgba(212,168,67,.3);box-shadow:0 0 24px rgba(0,0,0,.5);display:none;min-width:190px;font-family:system-ui,PingFang SC,Microsoft YaHei,sans-serif;font-size:13px;color:#ccc}" +
      ".mu-btn{width:36px;height:36px;border-radius:50%;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.04);color:rgba(255,255,255,.65);cursor:pointer;display:inline-flex;align-items:center;justify-content:center;transition:all .15s;font-size:16px;line-height:1}" +
      ".mu-btn:hover{background:rgba(212,168,67,.2);border-color:rgba(212,168,67,.5);color:#d4a843}" +
      "#mu-panel{position:fixed;z-index:9999996;right:16px;bottom:210px;width:380px;max-height:480px;border-radius:18px;background:rgba(10,18,45,.96);border:1px solid rgba(212,168,67,.3);box-shadow:0 0 40px rgba(0,0,0,.6);display:none;flex-direction:column;overflow:hidden;font-family:system-ui,PingFang SC,Microsoft YaHei,sans-serif;font-size:13px;color:#bbb}" +
      "#mu-panel .ph{padding:14px 16px;background:rgba(212,168,67,.06);border-bottom:1px solid rgba(212,168,67,.12);display:flex;justify-content:space-between;align-items:center;flex-shrink:0}" +
      "#mu-panel .ph h3{margin:0;font-size:15px;color:#d4a843;font-weight:600}" +
      "#mu-panel .pc{width:28px;height:28px;border-radius:50%;border:none;background:rgba(255,255,255,.06);color:#777;cursor:pointer;font-size:16px;display:flex;align-items:center;justify-content:center}" +
      "#mu-panel .pc:hover{background:rgba(255,80,80,.25);color:#f66}" +
      "#mu-panel .uzone{margin:10px 14px;padding:18px 14px;border:2px dashed rgba(212,168,67,.25);border-radius:12px;text-align:center;cursor:pointer;background:rgba(255,255,255,.015);flex-shrink:0}" +
      "#mu-panel .uzone:hover{border-color:rgba(212,168,67,.6);background:rgba(212,168,67,.04)}" +
      "#mu-panel .uzone.on{border-color:#d4a843;background:rgba(212,168,67,.08)}" +
      "#mu-panel .uprog{display:none;margin:6px 14px;padding:8px 12px;background:rgba(212,168,67,.06);border-radius:8px;color:#d4a843;font-size:11px}" +
      "#mu-panel .queue-info{color:#d4a843;font-size:11px;padding:2px 14px 4px;min-height:18px}" +
      "#mu-panel .slist{flex:1;overflow-y:auto;padding:4px 8px 8px;min-height:0}" +
      "#mu-panel .slist::-webkit-scrollbar{width:4px}" +
      "#mu-panel .slist::-webkit-scrollbar-thumb{background:rgba(212,168,67,.25);border-radius:2px}" +
      ".si{display:flex;align-items:center;gap:10px;padding:9px 10px;border-radius:10px;margin-bottom:2px;background:rgba(255,255,255,.015);transition:background .15s}" +
      ".si:hover{background:rgba(212,168,67,.05)}" +
      ".si.on{background:rgba(212,168,67,.1);border:1px solid rgba(212,168,67,.18)}" +
      ".sp{width:32px;height:32px;border-radius:50%;border:1px solid rgba(255,255,255,.1);background:rgba(255,255,255,.03);color:rgba(255,255,255,.55);cursor:pointer;flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:14px}" +
      ".sp:hover{background:rgba(212,168,67,.2);border-color:rgba(212,168,67,.5);color:#d4a843}" +
      ".sinfo{flex:1;min-width:0}" +
      ".st{color:#ddd;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-weight:500}" +
      ".sm{color:#666;font-size:10px;margin-top:2px}" +
      ".sd{width:26px;height:26px;border-radius:50%;border:none;background:transparent;color:#555;cursor:pointer;flex-shrink:0;font-size:14px;display:flex;align-items:center;justify-content:center}" +
      ".sd:hover{background:rgba(255,80,80,.18);color:#f55}" +
      "@media(max-width:440px){#mu-panel{right:4px;left:4px;width:auto;max-height:55vh;bottom:195px}}";
    d.head.appendChild(s);
  }

  // === 构建 ===
  function BU() {
    var d = D(); if (d.getElementById("mu-ball")) return;

    _r = d.createElement("div"); _r.id = "mu-ring"; d.body.appendChild(_r);

    _c = d.createElement("div"); _c.id = "mu-ctrls";
    _c.innerHTML =
      '<div class="ctitle" style="font-size:11px;color:rgba(255,255,255,.45);text-align:center;margin-bottom:6px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:200px">未播放</div>' +
      '<div style="display:flex;align-items:center;justify-content:center;gap:8px">' +
        '<button class="mu-btn" data-cmd="prev">⏮</button>' +
        '<button class="mu-btn mu-playbtn" data-cmd="toggle" style="font-size:20px;width:42px;height:42px">▶</button>' +
        '<button class="mu-btn" data-cmd="next">⏭</button>' +
      '</div>' +
      '<div style="display:flex;align-items:center;gap:6px;margin-top:8px;padding:0 2px">' +
        '<span style="color:rgba(255,255,255,.3);font-size:11px">🔈</span>' +
        '<input type="range" class="mu-vol" min="0" max="100" value="80" style="flex:1;height:3px;accent-color:#d4a843">' +
        '<span style="color:rgba(255,255,255,.3);font-size:11px">🔊</span>' +
      '</div>' +
      '<div style="text-align:center;margin-top:8px">' +
        '<button class="mu-btn" data-cmd="panel" style="font-size:12px;width:auto;height:26px;border-radius:13px;padding:0 12px">📁 歌曲管理</button>' +
      '</div>';
    d.body.appendChild(_c);

    _b = d.createElement("div"); _b.id = "mu-ball"; _b.innerHTML = "🎵"; _b.title = "音乐遥控器"; d.body.appendChild(_b);

    _p = d.createElement("div"); _p.id = "mu-panel";
    _p.innerHTML =
      '<div class="ph"><h3>🎵 共享歌单</h3><button class="pc">✕</button></div>' +
      '<div class="uzone" id="mu-uzone"><div style="font-size:30px;margin-bottom:4px">📤</div><div style="color:#999;font-size:12px">点击或拖拽音乐文件上传</div><div style="color:#555;font-size:10px;margin-top:4px">MP3 / WAV / OGG / FLAC / AAC / M4A · 单文件 ≤' + MB + 'MB</div><input type="file" id="mu-filein" accept=".mp3,.wav,.ogg,.flac,.aac,.m4a,.wma,audio/*" multiple style="display:none"></div>' +
      '<div class="uprog" id="mu-prog"><div id="mu-pname"></div></div>' +
      '<div class="queue-info" id="mu-queue"></div>' +
      '<div class="slist" id="mu-slist"><div style="text-align:center;color:#555;padding:40px 0">加载中...</div></div>';
    d.body.appendChild(_p);

    BE(); VU(); fe();
  }

  function VU() {
    if (_b) _b.style.display = S.ball ? "flex" : "none";
    if (_r) _r.style.display = S.ball ? "block" : "none";
    if (_c) { _c.style.display = (S.ball && S.ctrl) ? "block" : "none"; if (S.ball && S.ctrl) SPO(); }
    if (_p) _p.style.display = S.panel ? "flex" : "none";
  }
  function SPO() { if (!_b || !_c) return; var r = _b.getBoundingClientRect(); _c.style.left = (r.left - 72) + "px"; _c.style.top = (r.top - _c.offsetHeight - 10) + "px"; _c.style.right = "auto"; _c.style.bottom = "auto"; }

  // === 事件 ===
  function BE() {
    var d = D();
    _b.addEventListener("click", function (e) { if (_drag) return; S.ctrl = !S.ctrl; VU(); });
    _b.addEventListener("contextmenu", function (e) { e.preventDefault(); });
    _b.addEventListener("pointerdown", function (e) { if (e.pointerType === "mouse" && e.button !== 0) return; _b.setPointerCapture(e.pointerId); _drag = false; _sx = e.clientX; _sy = e.clientY; var r = _b.getBoundingClientRect(); _dx = e.clientX - r.left; _dy = e.clientY - r.top; _b.style.cursor = "grabbing"; _b.style.transition = "none"; });
    _b.addEventListener("pointermove", function (e) { if (!_sx) return; if (Math.abs(e.clientX - _sx) > 3 || Math.abs(e.clientY - _sy) > 3) _drag = true; if (!_drag) return; e.preventDefault(); _b.style.right = "auto"; _b.style.bottom = "auto"; _b.style.left = (e.clientX - _dx) + "px"; _b.style.top = (e.clientY - _dy) + "px"; if (_r) { _r.style.right = "auto"; _r.style.bottom = "auto"; _r.style.left = (e.clientX - _dx - 8) + "px"; _r.style.top = (e.clientY - _dy - 8) + "px"; } if (S.ctrl) SPO(); });
    _b.addEventListener("pointerup", function () { _sx = 0; _b.style.cursor = "pointer"; _b.style.transition = "transform .15s,box-shadow .3s"; });
    _b.addEventListener("pointercancel", function () { _sx = 0; _b.style.cursor = "pointer"; });

    _c.addEventListener("click", function (e) {
      var b = e.target.closest(".mu-btn"); if (!b) return;
      var cmd = b.getAttribute("data-cmd");
      if (cmd === "toggle") tog();
      else if (cmd === "prev" || cmd === "next") { try { if (typeof triggerSlash === "function") triggerSlash("/audioplay type=bgm"); } catch (ex) {} }
      else if (cmd === "panel") { S.panel = !S.panel; if (S.panel) fe(); VU(); }
    });

    var vs = $(".mu-vol", _c); if (vs) vs.addEventListener("input", function () { try { if (typeof setAudioSettings === "function") setAudioSettings("bgm", { volume: parseInt(vs.value, 10) }); } catch (e) {} });

    $(".pc", _p).addEventListener("click", function () { S.panel = false; VU(); });

    var uz = $("#mu-uzone"), fi = $("#mu-filein");
    uz.addEventListener("click", function () { fi.click(); });
    uz.addEventListener("dragover", function (e) { e.preventDefault(); uz.classList.add("on"); });
    uz.addEventListener("dragleave", function () { uz.classList.remove("on"); });
    uz.addEventListener("drop", function (e) { e.preventDefault(); uz.classList.remove("on"); if (e.dataTransfer.files.length) HF(e.dataTransfer.files); });
    fi.addEventListener("change", function () { if (fi.files.length) { HF(fi.files); fi.value = ""; } });

    $("#mu-slist").addEventListener("click", function (e) {
      var it = e.target.closest(".si"); if (!it) return;
      var u = it.getAttribute("data-url"), id = it.getAttribute("data-id"), t = ($(".st", it) || {}).textContent || "未知";
      if (e.target.closest(".sp")) { if (u === S.purl && S.playing) tog(); else play(u, t); }
      if (e.target.closest(".sd")) doDel({ id: id, url: u, title: t });
    });

    d.addEventListener("dragover", function (e) { e.preventDefault(); });
    d.addEventListener("drop", function (e) { e.preventDefault(); if (_p && !_p.contains(e.target) && e.dataTransfer.files.length) { S.panel = true; VU(); fe(); HF(e.dataTransfer.files); } });
  }

  // === 轮询 ===
  function PA() {
    try {
      if (typeof getCurrentAudio === "function") { var a = getCurrentAudio("bgm"); if (a && a.url) { S.purl = a.url; S.ptitle = a.title || ""; S.playing = true; } }
      if (typeof getAudioSettings === "function") { var s = getAudioSettings("bgm"); if (s && !s.enabled) S.playing = false; if (s && _c) { var v = $(".mu-vol", _c); if (v && String(v.value) !== String(s.volume)) v.value = s.volume; } }
      UP();
    } catch (e) {}
  }
  function PT() { clearInterval(_t); PA(); _t = setInterval(PA, 2000); }

  IS(); BU(); PT();
  window.MusicUploader = {
    show: function () { S.ball = true; VU(); }, hide: function () { S.ball = false; S.ctrl = false; S.panel = false; VU(); },
    toggle: function () { S.ball ? this.hide() : this.show(); }, showPanel: function () { S.ball = true; S.panel = true; VU(); fe(); },
    destroy: function () { clearInterval(_t); [_b, _r, _c, _p].forEach(function (e) { if (e && e.parentNode) e.remove(); }); }
  };
  console.log("[音乐扩展] ✅ " + API);
})();
