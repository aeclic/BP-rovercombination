// 蒙皮面板：只负责「把 SkinSheet 组件的数据显示出来 / 把玩家改动发回 C#」。
// 形状重建在 ECS 侧（SkinSheetSystem 监听 SkinSheet.Version），这里不碰任何网格。
(function () {
  'use strict';

  var CORNERS = ['bl', 'br', 'tr', 'tl'];
  var field = {};
  var state = null;
  var pending = 0;
  var textures = [];
  var statusEl = document.getElementById('status');
  var versionEl = document.getElementById('version');

  function $(id) { return document.getElementById(id); }

  function send(payload) {
    var text = JSON.stringify(payload);
    if (window.vuplex && window.vuplex.postMessage) {
      window.vuplex.postMessage(text);
    }
  }

  function status(text, isError) {
    statusEl.textContent = text;
    statusEl.className = isError ? 'error' : '';
  }

  function num(el) {
    var v = parseFloat(el.value);
    return isFinite(v) ? v : 0;
  }

  function readSheet() {
    var sheet = {
      bl: [num(field.blx), num(field.bly)],
      br: [num(field.brx), num(field.bry)],
      tr: [num(field.trx), num(field.try_)],
      tl: [num(field.tlx), num(field.tly)],
      curve: [num(field.cb0), num(field.cb1), num(field.cb2), num(field.cb3)],
      along: [num(field.al0), num(field.al1), num(field.al2), num(field.al3)],
      mode: $('mode-tile').checked ? 1 : 0,
      tileX: Math.max(0.01, num($('tile-x'))),
      tileY: Math.max(0.01, num($('tile-y'))),
      uvRect: readUVRect(),
      color: hexToRgba($('color').value, num($('alpha')))
    };
    return sheet;
  }

  function readUVRect() {
    var x = clamp01(num($('uv-x')), 0, 0.999);
    var y = clamp01(num($('uv-y')), 0, 0.999);
    var w = clamp01(num($('uv-w')), 0.001, 1 - x);
    var h = clamp01(num($('uv-h')), 0.001, 1 - y);
    return [x, y, w, h];
  }

  function clamp01(v, lo, hi) {
    return Math.min(hi, Math.max(lo, v));
  }

  function writeUVRect(rect) {
    $('uv-x').value = rect[0].toFixed(3);
    $('uv-y').value = rect[1].toFixed(3);
    $('uv-w').value = rect[2].toFixed(3);
    $('uv-h').value = rect[3].toFixed(3);
    paintCropRect(rect);
  }

  // UV 原点在左下，CSS 原点在左上，所以纵向要翻过来。
  function paintCropRect(rect) {
    var el = $('crop-rect');
    el.style.left = (rect[0] * 100) + '%';
    el.style.width = (rect[2] * 100) + '%';
    el.style.top = ((1 - rect[1] - rect[3]) * 100) + '%';
    el.style.height = (rect[3] * 100) + '%';
  }

  function hexToRgba(hex, a) {
    var v = hex.replace('#', '');
    return [
      parseInt(v.substring(0, 2), 16) / 255,
      parseInt(v.substring(2, 4), 16) / 255,
      parseInt(v.substring(4, 6), 16) / 255,
      a
    ];
  }

  function rgbaToHex(c) {
    function b(x) {
      var n = Math.round(Math.max(0, Math.min(1, x)) * 255).toString(16);
      return n.length === 1 ? '0' + n : n;
    }
    return '#' + b(c[0]) + b(c[1]) + b(c[2]);
  }

  function apply() {
    if (!state) return;
    var sheet = readSheet();
    status('应用…');
    send({ t: 'apply', sheet: sheet });
  }

  function queueApply() {
    // 连续输入时只在停下来之后发一次，避免每敲一个字符就重建一次 625 顶点网格。
    if (pending) clearTimeout(pending);
    pending = setTimeout(function () {
      pending = 0;
      apply();
    }, 180);
  }

  function syncFromState(sheet) {
    field.blx.value = sheet.bl[0].toFixed(3);
    field.bly.value = sheet.bl[1].toFixed(3);
    field.brx.value = sheet.br[0].toFixed(3);
    field.bry.value = sheet.br[1].toFixed(3);
    field.trx.value = sheet.tr[0].toFixed(3);
    field.try_.value = sheet.tr[1].toFixed(3);
    field.tlx.value = sheet.tl[0].toFixed(3);
    field.tly.value = sheet.tl[1].toFixed(3);

    for (var i = 0; i < 4; i++) {
      field['cb' + i].value = sheet.curve[i].toFixed(3);
      field['al' + i].value = sheet.along[i].toFixed(3);
    }

    $('mode-tile').checked = sheet.mode === 1;
    $('mode-stretch').checked = sheet.mode !== 1;
    $('tile-x').value = sheet.tileX;
    $('tile-y').value = sheet.tileY;
    $('color').value = rgbaToHex(sheet.color);
    $('alpha').value = sheet.color[3];
    writeUVRect(sheet.uvRect || [0, 0, 1, 1]);
    updateCropImage();
    versionEl.textContent = 'v' + sheet.version;
  }

  function renderTextures() {
    var host = $('textures');
    host.innerHTML = '';
    var clear = document.createElement('button');
    clear.className = 'empty' + (state && state.texture ? '' : ' active');
    clear.textContent = '无';
    clear.onclick = function () {
      send({ t: 'texture', id: '' });
    };
    host.appendChild(clear);
    textures.forEach(function (tex) {
      var b = document.createElement('button');
      b.title = tex.id.substring(0, 8);
      if (window.__skinImages && window.__skinImages[tex.id]) {
        b.style.backgroundImage = 'url("' + window.__skinImages[tex.id] + '")';
      }
      if (state && state.texture === tex.id) b.className = 'active';
      b.onclick = function () {
        send({ t: 'texture', id: tex.id });
      };
      host.appendChild(b);
    });
  }

  function updateCropImage() {
    var img = $('crop-image');
    var src = state && state.texture && window.__skinImages ? window.__skinImages[state.texture] : null;
    if (src) {
      img.src = src;
      img.style.visibility = 'visible';
    } else {
      img.removeAttribute('src');
      img.style.visibility = 'hidden';
    }
  }

  // 在图集预览上拖出一块矩形：按下 → 拖动 → 松开，松开后立刻应用。
  function bindCrop() {
    var view = $('crop-view');
    var dragging = false;
    var origin = null;

    function pointToUV(event) {
      var box = view.getBoundingClientRect();
      var x = clamp01((event.clientX - box.left) / Math.max(1, box.width), 0, 1);
      var y = 1 - clamp01((event.clientY - box.top) / Math.max(1, box.height), 0, 1);
      return [x, y];
    }

    function buildRect(start, end) {
      var dx = end[0] - start[0];
      var dy = end[1] - start[1];
      var img = $('crop-image');
      var pxW = img.naturalWidth || 1;
      var pxH = img.naturalHeight || 1;
      if ($('uv-square').checked) {
        // 方形锁定按像素算：UV 里的一格宽、一格高对应的像素数不一样。
        var side = Math.max(Math.abs(dx) * pxW, Math.abs(dy) * pxH);
        dx = Math.sign(dx || 1) * side / pxW;
        dy = Math.sign(dy || 1) * side / pxH;
      }
      var x = Math.min(start[0], start[0] + dx);
      var y = Math.min(start[1], start[1] + dy);
      var w = Math.abs(dx);
      var h = Math.abs(dy);
      x = clamp01(x, 0, 1);
      y = clamp01(y, 0, 1);
      w = clamp01(w, 0.001, 1 - x);
      h = clamp01(h, 0.001, 1 - y);
      return [x, y, w, h];
    }

    view.addEventListener('mousedown', function (event) {
      if (!state || !state.texture) return;
      dragging = true;
      origin = pointToUV(event);
      event.preventDefault();
    });

    window.addEventListener('mousemove', function (event) {
      if (!dragging || !origin) return;
      paintCropRect(buildRect(origin, pointToUV(event)));
    });

    window.addEventListener('mouseup', function (event) {
      if (!dragging || !origin) return;
      dragging = false;
      var rect = buildRect(origin, pointToUV(event));
      origin = null;
      if (rect[2] < 0.02 || rect[3] < 0.02) {
        // 误点：还原成当前值，不要发出去了
        writeUVRect(readUVRect());
        return;
      }
      writeUVRect(rect);
      apply();
    });

    $('uv-full').addEventListener('click', function () {
      writeUVRect([0, 0, 1, 1]);
      apply();
    });

    ['uv-x', 'uv-y', 'uv-w', 'uv-h'].forEach(function (id) {
      $(id).addEventListener('input', function () {
        paintCropRect(readUVRect());
        queueApply();
      });
      $(id).addEventListener('change', apply);
    });
  }

  function bind() {
    field = {
      blx: $('bl-x'), bly: $('bl-y'),
      brx: $('br-x'), bry: $('br-y'),
      trx: $('tr-x'), try_: $('tr-y'),
      tlx: $('tl-x'), tly: $('tl-y'),
      cb0: $('cb-0'), cb1: $('cb-1'), cb2: $('cb-2'), cb3: $('cb-3'),
      al0: $('al-0'), al1: $('al-1'), al2: $('al-2'), al3: $('al-3')
    };

    Object.keys(field).forEach(function (key) {
      field[key].addEventListener('input', queueApply);
      field[key].addEventListener('change', apply);
    });

    ['tile-x', 'tile-y'].forEach(function (id) {
      $(id).addEventListener('input', queueApply);
    });
    $('mode-tile').addEventListener('change', apply);
    $('mode-stretch').addEventListener('change', apply);
    $('color').addEventListener('change', apply);
    $('alpha').addEventListener('input', queueApply);
    $('close').addEventListener('click', function () {
      send({ t: 'close' });
    });

    bindCrop();
  }

  function handle(message) {
    var data;
    try {
      data = typeof message === 'string' ? JSON.parse(message) : message;
    } catch (e) {
      status('无法解析消息', true);
      return;
    }
    if (!data || !data.t) return;

    if (data.t === 'state') {
      state = data.sheet;
      state.version = data.version;
      state.texture = data.texture || '';
      window.__skinImages = window.__skinImages || {};
      (data.images || []).forEach(function (pair) {
        window.__skinImages[pair[0]] = pair[1];
      });
      textures = data.textures || [];
      syncFromState(state);
      renderTextures();
      status('就绪');
      return;
    }

    if (data.t === 'applied') {
      if (state) state.version = data.version;
      versionEl.textContent = 'v' + data.version;
      status('已应用（第 ' + data.version + ' 版）');
      return;
    }

    if (data.t === 'error') {
      status(data.message || '出错了', true);
    }
  }

  function start() {
    bind();
    if (window.vuplex && window.vuplex.addEventListener) {
      window.vuplex.addEventListener('message', function (event) {
        handle(event.data);
      });
      send({ t: 'ready' });
    } else {
      status('webview 未就绪', true);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
}());
