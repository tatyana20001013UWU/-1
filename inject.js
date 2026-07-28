// ============================================================
// 音乐上传扩展 — 前端注入脚本
// 由扩展 index.js 的路由 /api/plugins/music/inject.js 提供
// 加载后自动创建: 悬浮球 + 上传面板 + 歌单管理
// ============================================================
(function () {
  "use strict";

  // ============================================================
  // 配置
  // ============================================================
  var API_BASE = "/api/plugins/music";
  var BALL_SIZE = 44;
  var MAX_FILE_MB = 30;
  var ALLOWED_EXTS = [".mp3", ".wav", ".ogg", ".flac", ".aac", ".m4a", ".wma"];

  // ============================================================
  // 状态
  // ============================================================
  var _state = {
    panelVisible: false,
    ballVisible: true,
    ballExpanded: false,
    uploading: false,
    uploadQueue: [],
    songs: [],
    playingUrl: "",
    playingTitle: "",
    isPlaying: false,
  };

  var _ball = null, _ring = null, _controls = null, _panel = null;
  var _pollTimer = null;
  var _dragging = false, _dragX = 0, _dragY = 0, _startX = 0, _startY = 0;

  // ============================================================
  // 工具
  // ============================================================
  function $(sel, ctx) { return (ctx || document).querySelector(sel); }
  function getDoc() { try { return (window.parent || window).document; } catch (e) { return document; } }

  function toast(msg, type) {
    type = type || "info";
    try {
      if (typeof toastr !== "undefined" && toastr[type]) toastr[type](msg);
      else console.log("[音乐扩展] " + msg);
    } catch (e) { console.log("[音乐扩展] " + msg); }
  }

  function titleFromName(name) {
    return name.replace(/\.[^.]+$/, "").replace(/[_-]/g, " ").substring(0, 80);
  }

  function formatSize(bytes) {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / 1048576).toFixed(1) + " MB";
  }

  function formatTime(ts) {
    var d = new Date(ts);
    var pad = function (n) { return n < 10 ? "0" + n : "" + n; };
    return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()) + " " +
      pad(d.getHours()) + ":" + pad(d.getMinutes());
  }

  function escHtml(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
  function escAttr(s) { return String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }

  // ============================================================
  // API 通信
  // ============================================================
  function apiFetch(method, endpoint, body) {
    var opts = { method: method, headers: {} };
    if (body) {
      opts.headers["Content-Type"] = "application/json";
      opts.body = JSON.stringify(body);
    }
    return fetch(API_BASE + endpoint, opts).then(function (r) { return r.json(); });
  }

  function fetchSongs() {
    return apiFetch("GET", "/list").then(function (data) {
      _state.songs = (data && data.songs) ? data.songs : [];
      refreshSongListUI();
    }).catch(function (e) {
      console.error("[音乐扩展] 获取歌单失败:", e);
    });
  }

  function deleteSongFromAPI(song) {
    if (!confirm("确定删除 \"" + song.title + "\" 吗？")) return;
    var id = song.id || "";
    apiFetch("DELETE", "/delete?id=" + encodeURIComponent(id))
      .then(function (data) {
        toast("已删除: " + song.title, "success");
        fetchSongs();
      })
      .catch(function (e) {
        toast("删除失败: " + e.message, "error");
      });
  }

  // ============================================================
  // 上传处理
  // ============================================================
  function readFileAsBase64(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () { resolve(reader.result); };
      reader.onerror = function () { reject(new Error("文件读取失败")); };
      reader.readAsDataURL(file);
    });
  }

  function uploadOneFile(file) {
    showUploadProgress(file.name, "读取中...");
    return readFileAsBase64(file).then(function (base64) {
      showUploadProgress(file.name, "上传中...");
      return apiFetch("POST", "/upload", { file: base64, name: file.name });
    }).then(function (data) {
      hideUploadProgress();
      if (data && data.success) {
        if (data.warning) {
          toast(data.warning, "warning");
        } else {
          toast("上传成功: " + (data.song ? data.song.title : file.name), "success");
        }
        fetchSongs();
        // 加入酒馆播放列表
        if (data.song && data.song.url) {
          try {
            if (typeof appendAudioList === "function") {
              appendAudioList("bgm", [{ title: data.song.title, url: data.song.url }]);
            }
          } catch (e) {}
        }
      } else {
        toast("上传失败: " + ((data && data.error) || "未知错误"), "error");
      }
    }).catch(function (e) {
      hideUploadProgress();
      toast("上传失败: " + e.message, "error");
    });
  }

  function handleFiles(files) {
    var validFiles = [];
    for (var i = 0; i < files.length; i++) {
      var f = files[i];
      var nameLower = f.name.toLowerCase();
      var extOk = ALLOWED_EXTS.some(function (e) { return nameLower.endsWith(e); });
      if (!extOk) { toast("跳过非音频文件: " + f.name, "warning"); continue; }
      if (f.size > MAX_FILE_MB * 1048576) {
        toast("文件过大 (" + formatSize(f.size) + "), 限制 " + MAX_FILE_MB + "MB: " + f.name, "error");
        continue;
      }
      validFiles.push(f);
    }
    if (validFiles.length === 0) return;

    _state.uploadQueue = _state.uploadQueue.concat(validFiles);
    processQueue();
  }

  function processQueue() {
    if (_state.uploading || _state.uploadQueue.length === 0) return;
    _state.uploading = true;
    updateQueueUI();

    var file = _state.uploadQueue.shift();
    uploadOneFile(file).finally(function () {
      _state.uploading = false;
      updateQueueUI();
      processQueue();
    });
  }

  // ============================================================
  // 播放控制
  // ============================================================
  function playSong(url, title) {
    try {
      if (typeof playAudio === "function") {
        playAudio("bgm", { title: title, url: url });
        _state.playingUrl = url;
        _state.playingTitle = title;
        _state.isPlaying = true;
        updatePlayStateUI();
      }
    } catch (e) {}
  }

  function togglePlayPause() {
    try {
      if (_state.isPlaying) {
        if (typeof pauseAudio === "function") pauseAudio("bgm");
        _state.isPlaying = false;
      } else if (_state.playingUrl) {
        playSong(_state.playingUrl, _state.playingTitle);
      }
      updatePlayStateUI();
    } catch (e) {}
  }

  function playNext() {
    try { if (typeof triggerSlash === "function") triggerSlash("/audioplay type=bgm"); } catch (e) {}
  }

  function playPrev() {
    try { if (typeof triggerSlash === "function") triggerSlash("/audioplay type=bgm"); } catch (e) {}
  }

  // ============================================================
  // UI — 样式
  // ============================================================
  function injectStyles() {
    var doc = getDoc();
    if (doc.getElementById("mu-ext-styles")) return;
    var s = doc.createElement("style");
    s.id = "mu-ext-styles";
    s.textContent = [
      "#mu-ball{position:fixed;z-index:2147483645;width:" + BALL_SIZE + "px;height:" + BALL_SIZE + "px;",
      "border-radius:50%;background:rgba(10,20,50,0.9);border:1.5px solid rgba(212,168,67,0.5);",
      "color:#d4a843;font-size:20px;display:flex;align-items:center;justify-content:center;",
      "cursor:pointer;user-select:none;touch-action:none;line-height:1;",
      "box-shadow:0 0 16px rgba(212,168,67,0.3),0 4px 12px rgba(0,0,0,0.4);",
      "right:16px;bottom:100px;transition:transform 0.15s,box-shadow 0.3s}",
      "#mu-ball:hover{transform:scale(1.08);box-shadow:0 0 24px rgba(212,168,67,0.5)}",
      "#mu-ball.playing{animation:mu-ball-pulse 2s ease-in-out infinite}",
      "@keyframes mu-ball-pulse{0%,100%{box-shadow:0 0 16px rgba(212,168,67,0.3)}50%{box-shadow:0 0 28px rgba(212,168,67,0.6)}}",
      "#mu-ring{position:fixed;z-index:2147483644;width:" + (BALL_SIZE + 16) + "px;height:" + (BALL_SIZE + 16) + "px;",
      "border-radius:50%;border:2px solid rgba(212,168,67,0.4);background:transparent;pointer-events:none;",
      "right:8px;bottom:92px;opacity:0;transition:opacity 0.3s}",
      "#mu-ring.playing{opacity:1!important;animation:mu-ring-pulse 2s ease-in-out infinite}",
      "@keyframes mu-ring-pulse{0%{transform:scale(1);opacity:0.3}50%{transform:scale(1.15);opacity:0.7}100%{transform:scale(1);opacity:0.3}}",
      "#mu-ctrls{position:fixed;z-index:2147483644;right:16px;bottom:156px;padding:10px 14px;",
      "border-radius:16px;background:rgba(10,18,45,0.94);border:1px solid rgba(212,168,67,0.3);",
      "box-shadow:0 0 20px rgba(212,168,67,0.2),0 4px 16px rgba(0,0,0,0.5);",
      "display:none;min-width:180px;font-family:-apple-system,PingFang SC,Microsoft YaHei,sans-serif}",
      ".mu-btn{width:36px;height:36px;border-radius:50%;border:1px solid rgba(255,255,255,0.15);",
      "background:rgba(255,255,255,0.05);color:rgba(255,255,255,0.7);cursor:pointer;",
      "display:flex;align-items:center;justify-content:center;transition:all 0.15s;line-height:1;font-size:16px}",
      ".mu-btn:hover{background:rgba(212,168,67,0.2);border-color:rgba(212,168,67,0.5);color:#d4a843}",
      ".mu-btn:active{transform:scale(0.92)}",
      "#mu-panel{position:fixed;z-index:2147483643;right:16px;bottom:210px;width:380px;max-height:520px;",
      "border-radius:18px;background:rgba(10,18,45,0.96);border:1px solid rgba(212,168,67,0.3);",
      "box-shadow:0 0 30px rgba(0,0,0,0.6),0 0 60px rgba(212,168,67,0.15);",
      "display:none;flex-direction:column;overflow:hidden;",
      "font-family:-apple-system,PingFang SC,Microsoft YaHei,sans-serif;font-size:13px;color:#ccc}",
      "#mu-panel .ph{padding:12px 16px;background:rgba(212,168,67,0.08);",
      "border-bottom:1px solid rgba(212,168,67,0.15);display:flex;align-items:center;justify-content:space-between}",
      "#mu-panel .ph h3{margin:0;font-size:15px;color:#d4a843;font-weight:600}",
      "#mu-panel .pc{width:28px;height:28px;border-radius:50%;border:none;",
      "background:rgba(255,255,255,0.08);color:#888;cursor:pointer;font-size:16px;",
      "display:flex;align-items:center;justify-content:center}",
      "#mu-panel .pc:hover{background:rgba(255,80,80,0.3);color:#f66}",
      "#mu-panel .uzone{margin:12px 16px;padding:20px;border:2px dashed rgba(212,168,67,0.3);",
      "border-radius:12px;text-align:center;cursor:pointer;transition:all 0.2s;background:rgba(255,255,255,0.02)}",
      "#mu-panel .uzone:hover{border-color:rgba(212,168,67,0.7);background:rgba(212,168,67,0.05)}",
      "#mu-panel .uzone.dragover{border-color:#d4a843;background:rgba(212,168,67,0.1)}",
      "#mu-panel .uicon{font-size:32px;margin-bottom:6px}",
      "#mu-panel .utext{color:#999;font-size:12px}",
      "#mu-panel .uhint{color:#666;font-size:11px;margin-top:4px}",
      "#mu-panel .uprog{display:none;margin:8px 16px;padding:8px 12px;background:rgba(212,168,67,0.08);border-radius:8px}",
      "#mu-panel .pbar{height:4px;background:rgba(255,255,255,0.1);border-radius:2px;overflow:hidden;margin-top:4px}",
      "#mu-panel .pfill{height:100%;background:linear-gradient(90deg,#d4a843,#f0c060);border-radius:2px;width:0%;transition:width 0.3s}",
      "#mu-panel .pname{color:#d4a843;font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}",
      "#mu-panel .queue-info{display:none;padding:4px 16px 8px;color:#d4a843;font-size:11px}",
      "#mu-panel .slist{flex:1;overflow-y:auto;padding:0 16px 12px;min-height:0}",
      "#mu-panel .slist::-webkit-scrollbar{width:4px}",
      "#mu-panel .slist::-webkit-scrollbar-thumb{background:rgba(212,168,67,0.3);border-radius:2px}",
      "#mu-panel .sempty{text-align:center;color:#555;padding:30px 0;font-size:13px}",
      "#mu-panel .sitem{display:flex;align-items:center;gap:10px;padding:10px 12px;",
      "border-radius:10px;margin-bottom:4px;background:rgba(255,255,255,0.02);transition:background 0.15s}",
      "#mu-panel .sitem:hover{background:rgba(212,168,67,0.06)}",
      "#mu-panel .sitem.active{background:rgba(212,168,67,0.12);border:1px solid rgba(212,168,67,0.2)}",
      "#mu-panel .splay{width:32px;height:32px;border-radius:50%;border:1px solid rgba(255,255,255,0.15);",
      "background:rgba(255,255,255,0.05);color:rgba(255,255,255,0.6);cursor:pointer;flex-shrink:0;",
      "display:flex;align-items:center;justify-content:center;font-size:14px}",
      "#mu-panel .splay:hover{background:rgba(212,168,67,0.25);border-color:rgba(212,168,67,0.5);color:#d4a843}",
      "#mu-panel .sinfo{flex:1;min-width:0}",
      "#mu-panel .stitle{color:#ddd;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}",
      "#mu-panel .smeta{color:#666;font-size:10px;margin-top:2px}",
      "#mu-panel .sdel{width:28px;height:28px;border-radius:50%;border:none;",
      "background:transparent;color:#555;cursor:pointer;flex-shrink:0;font-size:14px;",
      "display:flex;align-items:center;justify-content:center}",
      "#mu-panel .sdel:hover{background:rgba(255,80,80,0.2);color:#f66}",
      "@media (max-width:420px){#mu-panel{right:4px;left:4px;width:auto;max-height:55vh;bottom:195px}}",
    ].join("");
    doc.head.appendChild(s);
  }

  // ============================================================
  // UI — 构建
  // ============================================================
  function buildUI() {
    var doc = getDoc();
    if (doc.getElementById("mu-ball")) return;

    // 音波环
    _ring = doc.createElement("div");
    _ring.id = "mu-ring";
    doc.body.appendChild(_ring);

    // 控制栏
    _controls = doc.createElement("div");
    _controls.id = "mu-ctrls";
    _controls.innerHTML =
      '<div style="font-size:11px;color:rgba(255,255,255,0.5);text-align:center;margin-bottom:6px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:200px" class="ctitle">未播放</div>' +
      '<div style="display:flex;align-items:center;justify-content:center;gap:8px">' +
        '<button class="mu-btn" data-cmd="prev" title="上一首">⏮</button>' +
        '<button class="mu-btn mu-playbtn" data-cmd="toggle" title="播放/暂停" style="font-size:22px;width:42px;height:42px">▶</button>' +
        '<button class="mu-btn" data-cmd="next" title="下一首">⏭</button>' +
      '</div>' +
      '<div style="display:flex;align-items:center;gap:6px;margin-top:8px;padding:0 4px">' +
        '<span style="color:rgba(255,255,255,0.35);font-size:11px">🔈</span>' +
        '<input type="range" class="mu-vol" min="0" max="100" value="80" style="flex:1;height:3px;accent-color:#d4a843">' +
        '<span style="color:rgba(255,255,255,0.35);font-size:11px">🔊</span>' +
      '</div>' +
      '<div style="text-align:center;margin-top:6px">' +
        '<button class="mu-btn" data-cmd="panel" style="font-size:12px;width:auto;height:24px;border-radius:12px;padding:0 10px">📁 歌曲管理</button>' +
      '</div>';
    doc.body.appendChild(_controls);

    // 悬浮球
    _ball = doc.createElement("div");
    _ball.id = "mu-ball";
    _ball.innerHTML = "🎵";
    _ball.title = "音乐遥控器";
    doc.body.appendChild(_ball);

    // 主面板
    _panel = doc.createElement("div");
    _panel.id = "mu-panel";
    _panel.innerHTML =
      '<div class="ph"><h3>🎵 音乐管理</h3><button class="pc" title="关闭">✕</button></div>' +
      '<div class="uzone" id="mu-uzone">' +
        '<div class="uicon">📤</div>' +
        '<div class="utext">点击或拖拽音乐文件到此处</div>' +
        '<div class="uhint">支持 MP3/WAV/OGG/FLAC/AAC/M4A，≤' + MAX_FILE_MB + 'MB</div>' +
        '<input type="file" id="mu-filein" accept=".mp3,.wav,.ogg,.flac,.aac,.m4a,.wma,audio/*" multiple style="display:none">' +
      '</div>' +
      '<div class="uprog" id="mu-prog">' +
        '<div class="pname" id="mu-pname"></div>' +
        '<div class="pbar"><div class="pfill" id="mu-pfill"></div></div>' +
      '</div>' +
      '<div class="queue-info" id="mu-queue"></div>' +
      '<div class="slist" id="mu-slist">' +
        '<div class="sempty">📭 加载中...</div>' +
      '</div>';
    doc.body.appendChild(_panel);

    bindEvents();
    updateVisibility();
    fetchSongs();
  }

  function destroyUI() {
    [_ball, _ring, _controls, _panel].forEach(function (el) {
      if (el && el.parentNode) el.remove();
    });
    _ball = null; _ring = null; _controls = null; _panel = null;
  }

  // ============================================================
  // UI — 更新
  // ============================================================
  function updateVisibility() {
    if (_ball) _ball.style.display = _state.ballVisible ? "flex" : "none";
    if (_ring) _ring.style.display = _state.ballVisible ? "block" : "none";
    if (_controls) {
      _controls.style.display = (_state.ballVisible && _state.ballExpanded) ? "block" : "none";
      if (_state.ballVisible && _state.ballExpanded) syncControlsPos();
    }
    if (_panel) _panel.style.display = _state.panelVisible ? "flex" : "none";
  }

  function syncControlsPos() {
    if (!_ball || !_controls) return;
    var br = _ball.getBoundingClientRect();
    _controls.style.left = (br.left - 70) + "px";
    _controls.style.top = (br.top - _controls.offsetHeight - 12) + "px";
    _controls.style.right = "auto";
    _controls.style.bottom = "auto";
  }

  function updatePlayStateUI() {
    if (_ball) {
      _ball.innerHTML = _state.isPlaying ? "🎶" : "🎵";
      _ball.classList.toggle("playing", _state.isPlaying);
    }
    if (_ring) _ring.classList.toggle("playing", _state.isPlaying);
    if (_controls) {
      var btn = $(".mu-playbtn", _controls);
      if (btn) btn.textContent = _state.isPlaying ? "⏸" : "▶";
      var t = $(".ctitle", _controls);
      if (t) t.textContent = _state.playingTitle || "未播放";
    }
    refreshSongListUI();
  }

  function showUploadProgress(name, status) {
    var prog = $("#mu-prog");
    if (!prog) return;
    prog.style.display = "block";
    var n = $("#mu-pname");
    if (n) n.textContent = status + " " + name;
    var f = $("#mu-pfill");
    if (f) f.style.width = (status === "读取中..." ? "30%" : "70%");
  }

  function hideUploadProgress() {
    var prog = $("#mu-prog");
    if (prog) prog.style.display = "none";
  }

  function updateQueueUI() {
    var q = $("#mu-queue");
    if (!q) return;
    if (_state.uploadQueue.length > 0) {
      q.style.display = "block";
      q.textContent = "⏳ 队列: " + _state.uploadQueue.length + " 个文件等待上传...";
    } else {
      q.style.display = "none";
    }
  }

  function refreshSongListUI() {
    var list = $("#mu-slist");
    if (!list) return;

    if (_state.songs.length === 0) {
      list.innerHTML = '<div class="sempty">📭 还没有上传歌曲<br><span style="font-size:11px">点击上方区域上传第一首歌</span></div>';
      return;
    }

    var html = "";
    for (var i = 0; i < _state.songs.length; i++) {
      var song = _state.songs[i];
      var active = song.url === _state.playingUrl;
      html +=
        '<div class="sitem' + (active ? " active" : "") + '" data-url="' + escAttr(song.url) + '" data-id="' + escAttr(song.id) + '">' +
          '<button class="splay">' + (active ? "⏸" : "▶") + '</button>' +
          '<div class="sinfo">' +
            '<div class="stitle" title="' + escAttr(song.title) + '">' + escHtml(song.title) + '</div>' +
            '<div class="smeta">' + formatSize(song.size || 0) + ' · ' + formatTime(song.uploadedAt || 0) + '</div>' +
          '</div>' +
          '<button class="sdel" title="删除">🗑</button>' +
        '</div>';
    }
    list.innerHTML = html;
  }

  // ============================================================
  // 事件
  // ============================================================
  function bindEvents() {
    var doc = getDoc();

    // 悬浮球点击
    _ball.addEventListener("click", function (e) {
      if (_dragging) return;
      _state.ballExpanded = !_state.ballExpanded;
      updateVisibility();
    });
    _ball.addEventListener("contextmenu", function (e) { e.preventDefault(); });

    // 悬浮球拖拽
    _ball.addEventListener("pointerdown", function (e) {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      _ball.setPointerCapture(e.pointerId);
      _dragging = false;
      _startX = e.clientX; _startY = e.clientY;
      var r = _ball.getBoundingClientRect();
      _dragX = e.clientX - r.left;
      _dragY = e.clientY - r.top;
      _ball.style.cursor = "grabbing";
      _ball.style.transition = "none";
    });
    _ball.addEventListener("pointermove", function (e) {
      if (_startX === 0) return;
      var dx = e.clientX - _startX, dy = e.clientY - _startY;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) _dragging = true;
      if (!_dragging) return;
      e.preventDefault();
      _ball.style.right = "auto"; _ball.style.bottom = "auto";
      _ball.style.left = (e.clientX - _dragX) + "px";
      _ball.style.top = (e.clientY - _dragY) + "px";
      if (_ring) {
        _ring.style.right = "auto"; _ring.style.bottom = "auto";
        _ring.style.left = (e.clientX - _dragX - 8) + "px";
        _ring.style.top = (e.clientY - _dragY - 8) + "px";
      }
      if (_state.ballExpanded) syncControlsPos();
    });
    _ball.addEventListener("pointerup", function () { _startX = 0; _ball.style.cursor = "pointer"; _ball.style.transition = "transform 0.15s, box-shadow 0.3s"; });
    _ball.addEventListener("pointercancel", function () { _startX = 0; _ball.style.cursor = "pointer"; _ball.style.transition = "transform 0.15s, box-shadow 0.3s"; });

    // 控制栏按钮
    _controls.addEventListener("click", function (e) {
      var btn = e.target.closest(".mu-btn");
      if (!btn) return;
      var cmd = btn.getAttribute("data-cmd");
      if (cmd === "toggle") togglePlayPause();
      else if (cmd === "prev") playPrev();
      else if (cmd === "next") playNext();
      else if (cmd === "panel") {
        _state.panelVisible = !_state.panelVisible;
        if (_state.panelVisible) fetchSongs();
        updateVisibility();
      }
    });

    // 音量
    var vs = $(".mu-vol", _controls);
    if (vs) {
      vs.addEventListener("input", function () {
        try {
          if (typeof setAudioSettings === "function") setAudioSettings("bgm", { volume: parseInt(vs.value, 10) });
        } catch (e) {}
      });
    }

    // 面板关闭
    var cb = $(".pc", _panel);
    if (cb) cb.addEventListener("click", function () { _state.panelVisible = false; updateVisibility(); });

    // 上传区域
    var uz = $("#mu-uzone");
    var fi = $("#mu-filein");
    if (uz && fi) {
      uz.addEventListener("click", function () { fi.click(); });
      uz.addEventListener("dragover", function (e) { e.preventDefault(); uz.classList.add("dragover"); });
      uz.addEventListener("dragleave", function () { uz.classList.remove("dragover"); });
      uz.addEventListener("drop", function (e) {
        e.preventDefault();
        uz.classList.remove("dragover");
        if (e.dataTransfer.files.length > 0) handleFiles(e.dataTransfer.files);
      });
      fi.addEventListener("change", function () {
        if (fi.files.length > 0) { handleFiles(fi.files); fi.value = ""; }
      });
    }

    // 歌曲列表（事件委托）
    var sl = $("#mu-slist");
    if (sl) {
      sl.addEventListener("click", function (e) {
        var playBtn = e.target.closest(".splay");
        var delBtn = e.target.closest(".sdel");
        var item = e.target.closest(".sitem");
        if (!item) return;

        var url = item.getAttribute("data-url");
        var id = item.getAttribute("data-id");
        var titleEl = $(".stitle", item);
        var title = titleEl ? titleEl.textContent : "未知";

        if (playBtn) {
          if (url === _state.playingUrl && _state.isPlaying) togglePlayPause();
          else playSong(url, title);
        }
        if (delBtn) {
          deleteSongFromAPI({ id: id, url: url, title: title });
        }
      });
    }

    // 全局拖放
    doc.addEventListener("dragover", function (e) { e.preventDefault(); });
    doc.addEventListener("drop", function (e) {
      e.preventDefault();
      if (_panel && !_panel.contains(e.target) && e.dataTransfer.files.length > 0) {
        _state.panelVisible = true;
        updateVisibility();
        fetchSongs();
        handleFiles(e.dataTransfer.files);
      }
    });
  }

  // ============================================================
  // 轮询同步
  // ============================================================
  function pollAudioState() {
    try {
      if (typeof getCurrentAudio === "function") {
        var a = getCurrentAudio("bgm");
        if (a && a.url) {
          _state.playingUrl = a.url;
          _state.playingTitle = a.title || "";
          _state.isPlaying = true;
        }
      }
      if (typeof getAudioSettings === "function") {
        var s = getAudioSettings("bgm");
        if (s && !s.enabled) _state.isPlaying = false;
        if (s && _controls) {
          var vs = $(".mu-vol", _controls);
          if (vs && String(vs.value) !== String(s.volume)) vs.value = s.volume;
        }
      }
      updatePlayStateUI();
    } catch (e) {}
  }

  function startPoll() {
    stopPoll();
    pollAudioState();
    _pollTimer = setInterval(pollAudioState, 2000);
  }

  function stopPoll() {
    if (_pollTimer) { clearInterval(_pollTimer); _pollTimer = null; }
  }

  // ============================================================
  // 公开 API
  // ============================================================
  var API = {
    show: function () { _state.ballVisible = true; updateVisibility(); startPoll(); },
    hide: function () { _state.ballVisible = false; _state.ballExpanded = false; _state.panelVisible = false; updateVisibility(); },
    toggle: function () { if (_state.ballVisible) API.hide(); else API.show(); },
    showPanel: function () { _state.ballVisible = true; _state.panelVisible = true; updateVisibility(); fetchSongs(); startPoll(); },
    hidePanel: function () { _state.panelVisible = false; updateVisibility(); },
    upload: function (files) { _state.panelVisible = true; updateVisibility(); handleFiles(files); },
    destroy: function () { stopPoll(); destroyUI(); },
    refresh: function () { fetchSongs(); },
  };

  // ============================================================
  // 初始化
  // ============================================================
  injectStyles();
  buildUI();
  startPoll();

  window.MusicUploader = API;
  try { if (window.parent && window.parent !== window) window.parent.MusicUploader = API; } catch (e) {}

  window.addEventListener("beforeunload", function () { API.destroy(); });
  window.addEventListener("pagehide", function () { API.destroy(); });

  console.log("[音乐扩展·前端] 已加载 — MusicUploader API 就绪");
})();
