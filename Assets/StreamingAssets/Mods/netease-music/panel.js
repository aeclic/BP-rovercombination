// 网易云音乐 · 网页面板（真正的播放由 Unity 宿主完成）
//
// 页面本身跑在 CEF 里、内容是用 LoadHtml 塞进来的 data: 页面 —— 既没有 baseUrl 也没有
// 本地文件权限，<audio> 既读不到 Mod 目录里的歌、也不方便直连 CDN。所以音频解码/输出
// 全部交给宿主（Bpsim.Mods.ModPanelAudio，走 UnityWebRequest + AudioSource），
// 页面只负责 UI 与指令：
//
//   页面 → 宿主  {"type":"audio","op":"listLocal"}
//                {"type":"audio","op":"playLocal","path":"…","title":"…"}
//                {"type":"audio","op":"play","url":"https://…","title":"…"}
//                {"type":"audio","op":"pause"|"resume"|"stop"}
//                {"type":"audio","op":"seek","position":12.3}
//   宿主 → 页面  window.__bpsimHost({type:"audio",op:"state",playing,loading,position,duration,title,error,volume})
//                window.__bpsimHost({type:"audio",op:"localList",items:[{name,path}],dirs:[…]})

(function () {
  "use strict";

  var $ = function (id) { return document.getElementById(id); };

  var coverEl = $("cover");
  var titleEl = $("song-title");
  var artistEl = $("song-artist");
  var progressEl = $("progress");
  var curTimeEl = $("cur-time");
  var totalTimeEl = $("total-time");
  var playBtn = $("play");
  var prevBtn = $("prev");
  var nextBtn = $("next");
  var listEl = $("playlist");
  var countEl = $("list-count");
  var searchEl = $("search");
  var closeBtn = $("close");
  var urlEl = $("url");
  var urlBtn = $("play-url");
  var statusEl = $("status");

  var state = {
    items: [],        // [{name, path}]
    dirs: [],         // 宿主扫描过的目录，用来给用户提示
    index: -1,
    playing: false,
    loading: false,
    position: 0,
    duration: 0,
    filter: "",
    error: "",
    title: ""
  };
  var dragging = false;   // 用户正在拖进度条时不回写位置

  // ── 与宿主通信 ──
  function post(payload) {
    try {
      if (window.vuplex && window.vuplex.postMessage) {
        window.vuplex.postMessage(JSON.stringify(payload));
      }
    } catch (e) { /* 独立浏览器里忽略 */ }
  }

  function audio(op, extra) {
    var msg = { type: "audio", op: op };
    if (extra) { for (var k in extra) { if (extra.hasOwnProperty(k)) msg[k] = extra[k]; } }
    post(msg);
  }

  // 宿主 → 页面
  window.__bpsimHost = function (msg) {
    if (!msg || msg.type !== "audio") return;
    if (msg.op === "state") { applyState(msg); return; }
    if (msg.op === "localList") { applyList(msg); return; }
  };

  function applyState(m) {
    state.playing = !!m.playing;
    state.loading = !!m.loading;
    state.position = Number(m.position) || 0;
    state.duration = Number(m.duration) || 0;
    state.error = m.error || "";
    if (typeof m.title === "string" && m.title) { state.title = m.title; }
    renderTransport();
  }

  function applyList(m) {
    state.items = Array.isArray(m.items) ? m.items : [];
    state.dirs = Array.isArray(m.dirs) ? m.dirs : [];
    renderList();
    renderTransport();
  }

  // ── 格式化 ──
  function fmt(sec) {
    sec = Math.max(0, Math.floor(sec || 0));
    var m = Math.floor(sec / 60);
    var s = sec % 60;
    return (m < 10 ? "0" : "") + m + ":" + (s < 10 ? "0" : "") + s;
  }

  function escapeHtml(t) {
    return String(t).replace(/[&<>"']/g, function (c) {
      return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c];
    });
  }

  function visibleItems() {
    var f = state.filter.trim().toLowerCase();
    if (!f) return state.items;
    return state.items.filter(function (it) {
      return it.name.toLowerCase().indexOf(f) >= 0;
    });
  }

  // ── 渲染 ──
  function renderList() {
    var items = visibleItems();
    countEl.textContent = "(" + items.length + ")";
    listEl.innerHTML = "";
    if (items.length === 0) {
      var li = document.createElement("li");
      li.className = "empty";
      var where = state.dirs.length ? state.dirs[0] : "Mods/netease-music/music";
      li.innerHTML = state.filter
        ? "没有找到匹配的歌曲"
        : "曲库为空<br><span class=\"hint\">把 .mp3 / .ogg / .wav 放进：<br>" + escapeHtml(where) + "</span>";
      listEl.appendChild(li);
      return;
    }
    items.forEach(function (it, i) {
      var realIndex = state.items.indexOf(it);
      var li = document.createElement("li");
      li.className = "item" + (realIndex === state.index ? " active" : "");
      li.setAttribute("data-index", String(realIndex));
      li.innerHTML =
        '<span class="idx">' + (i + 1) + '</span>' +
        '<span class="name">' + escapeHtml(it.name) + '</span>';
      li.addEventListener("click", function () { select(realIndex, true); });
      listEl.appendChild(li);
    });
  }

  function paintCover(seed) {
    if (seed == null) {
      coverEl.style.background = "linear-gradient(135deg,#3a3d46,#22242a)";
      return;
    }
    var h = 0;
    for (var i = 0; i < seed.length; i++) { h = (h * 31 + seed.charCodeAt(i)) % 360; }
    coverEl.style.background =
      "linear-gradient(135deg, hsl(" + h + ",55%,42%), hsl(" + ((h + 40) % 360) + ",60%,22%))";
  }

  function renderTransport() {
    playBtn.textContent = state.loading ? "…" : (state.playing ? "⏸" : "▶");
    coverEl.classList.toggle("playing", state.playing);
    titleEl.textContent = state.title || "未在播放";
    artistEl.textContent = state.loading ? "正在加载…" : (state.playing ? "正在播放" : "选择一首歌开始");
    if (!dragging) {
      curTimeEl.textContent = fmt(state.position);
      progressEl.value = state.duration > 0 ? (state.position / state.duration) * 100 : 0;
    }
    totalTimeEl.textContent = fmt(state.duration);
    if (state.error) {
      statusEl.textContent = state.error;
      statusEl.className = "status error";
    } else {
      statusEl.textContent = "";
      statusEl.className = "status";
    }
    paintCover(state.title || null);
    // 强调当前项
    var listItems = listEl.querySelectorAll(".item");
    for (var i = 0; i < listItems.length; i++) {
      listItems[i].classList.toggle("active",
        Number(listItems[i].getAttribute("data-index")) === state.index);
    }
  }

  // ── 操作 ──
  function select(index, autoplay) {
    if (index < 0 || index >= state.items.length) return;
    state.index = index;
    state.title = state.items[index].name;
    state.position = 0;
    state.duration = 0;
    renderTransport();
    renderList();
    if (autoplay) { audio("playLocal", { path: state.items[index].path, title: state.items[index].name }); }
  }

  function play() {
    if (state.loading) return;
    if (state.index < 0 && state.items.length > 0) { select(0, true); return; }
    if (state.playing) { audio("pause"); return; }
    if (state.duration > 0 || state.position > 0) { audio("resume"); return; }
    if (state.index >= 0) { select(state.index, true); }
  }

  function toggle() { state.playing ? audio("pause") : play(); }

  function next() {
    if (state.items.length === 0) return;
    var i = state.index < 0 ? 0 : (state.index + 1) % state.items.length;
    select(i, true);
  }

  function prev() {
    if (state.items.length === 0) return;
    if (state.position > 3) { audio("seek", { position: 0 }); return; }
    var i = (state.index - 1 + state.items.length) % state.items.length;
    select(i, true);
  }

  function playUrl() {
    var url = (urlEl.value || "").trim();
    if (!url) { state.error = "先填一个音频直链（.mp3 / .m4a / .ogg）"; renderTransport(); return; }
    var title = url.split("/").pop().split("?")[0] || "网络音频";
    state.title = title;
    state.index = -1;
    renderTransport();
    audio("play", { url: url, title: title });
  }

  function closePanel() {
    post({ type: "close", panel: "player" });
    if (!(window.vuplex && window.vuplex.postMessage)) {
      document.getElementById("app").style.opacity = "0.15";
    }
  }

  // ── 事件 ──
  playBtn.addEventListener("click", toggle);
  nextBtn.addEventListener("click", next);
  prevBtn.addEventListener("click", prev);
  closeBtn.addEventListener("click", closePanel);
  urlBtn.addEventListener("click", playUrl);
  urlEl.addEventListener("keydown", function (e) {
    if (e.key === "Enter") { e.preventDefault(); playUrl(); }
  });

  progressEl.addEventListener("input", function () {
    dragging = true;
    var pos = state.duration > 0 ? (progressEl.value / 100) * state.duration : 0;
    curTimeEl.textContent = fmt(pos);
  });
  progressEl.addEventListener("change", function () {
    dragging = false;
    var pos = state.duration > 0 ? (progressEl.value / 100) * state.duration : 0;
    audio("seek", { position: pos });
  });

  searchEl.addEventListener("input", function () {
    state.filter = searchEl.value;
    renderList();
  });

  document.addEventListener("keydown", function (e) {
    if (e.target === searchEl || e.target === urlEl) return;
    if (e.code === "Space") { e.preventDefault(); toggle(); }
    else if (e.code === "ArrowRight") next();
    else if (e.code === "ArrowLeft") prev();
  });

  // ── 启动 ──
  renderList();
  paintCover(null);
  renderTransport();
  audio("listLocal");
})();
