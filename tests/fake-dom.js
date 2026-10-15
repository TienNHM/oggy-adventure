/* Fake DOM tối thiểu cho smoke test chạy bằng Node (không cần thư viện ngoài).
 * Đủ cho game: parse HTML (innerHTML), querySelector với selector đơn giản, event capture/bubble,
 * focus, form submit, style/classList/dataset, canvas 2D giả (Proxy), localStorage, AudioContext giả.
 * KHÔNG phải trình duyệt thật: không layout, không vẽ — chỉ để bắt lỗi runtime. */
'use strict';

// ---------------------------------------------------------------------------
// Event
// ---------------------------------------------------------------------------
class FakeEvent {
  constructor(type, init) {
    init = init || {};
    this.type = type;
    this.bubbles = init.bubbles !== false;
    this.cancelable = init.cancelable !== false;
    this.defaultPrevented = false;
    this.target = null;
    this.currentTarget = null;
    this._stop = false;
    this._stopNow = false;
    for (const k in init) if (!(k in this)) this[k] = init[k];
    if (this.repeat == null) this.repeat = false;
    if (this.clientX == null) this.clientX = 0;
    if (this.clientY == null) this.clientY = 0;
  }
  preventDefault() { if (this.cancelable) this.defaultPrevented = true; }
  stopPropagation() { this._stop = true; }
  stopImmediatePropagation() { this._stop = true; this._stopNow = true; }
}

// Lỗi trong listener được báo qua hook này (smoke test ghi nhận).
let onListenerError = (err) => { throw err; };

class FakeEventTarget {
  constructor() { this._listeners = {}; }
  addEventListener(type, fn, opts) {
    if (!fn) return;
    const capture = typeof opts === 'boolean' ? opts : !!(opts && opts.capture);
    const once = !!(opts && typeof opts === 'object' && opts.once);
    (this._listeners[type] = this._listeners[type] || []).push({ fn, capture, once });
  }
  removeEventListener(type, fn, opts) {
    const capture = typeof opts === 'boolean' ? opts : !!(opts && opts.capture);
    const arr = this._listeners[type];
    if (!arr) return;
    const i = arr.findIndex((l) => l.fn === fn && l.capture === capture);
    if (i >= 0) arr.splice(i, 1);
  }
  _fire(ev, phase) {
    const arr = (this._listeners[ev.type] || []).slice();
    for (const l of arr) {
      if (phase === 'capture' && !l.capture) continue;
      if (phase === 'bubble' && l.capture) continue;
      ev.currentTarget = this;
      if (l.once) this.removeEventListener(ev.type, l.fn, l.capture);
      try {
        if (typeof l.fn === 'function') l.fn.call(this, ev); else if (l.fn && l.fn.handleEvent) l.fn.handleEvent(ev);
      } catch (err) { onListenerError(err, ev.type); }
      if (ev._stopNow) break;
    }
  }
  // Đường đi sự kiện: [window, document, ...tổ tiên, target]
  _path() { return [this]; }
  dispatchEvent(ev) {
    ev.target = this;
    const path = this._path();
    // capture: từ ngoài vào trong (không gồm target)
    for (let i = 0; i < path.length - 1 && !ev._stop; i++) path[i]._fire(ev, 'capture');
    // target: mọi listener theo thứ tự đăng ký
    if (!ev._stop) this._fire(ev, 'target');
    // bubble
    if (ev.bubbles) for (let i = path.length - 2; i >= 0 && !ev._stop; i--) path[i]._fire(ev, 'bubble');
    return !ev.defaultPrevented;
  }
}

// ---------------------------------------------------------------------------
// Canvas 2D giả: mọi hàm lạ là no-op; theo dõi save/restore để kiểm tra cân bằng.
// ---------------------------------------------------------------------------
function makeCtx2d(canvas) {
  const state = {
    canvas, depth: 0, underflow: 0,
    globalAlpha: 1, lineWidth: 1, font: '10px sans-serif', textAlign: 'start', textBaseline: 'alphabetic',
    fillStyle: '#000000', strokeStyle: '#000000', globalCompositeOperation: 'source-over',
    lineCap: 'butt', lineJoin: 'miter', miterLimit: 10, lineDashOffset: 0, shadowBlur: 0, shadowColor: 'rgba(0,0,0,0)',
    shadowOffsetX: 0, shadowOffsetY: 0, imageSmoothingEnabled: true, filter: 'none', direction: 'ltr', letterSpacing: '0px'
  };
  const grad = () => ({ addColorStop() {} });
  const fns = {
    save() { state.depth++; },
    restore() { if (state.depth <= 0) state.underflow++; else state.depth--; },
    measureText(t) { const w = String(t).length * 7; return { width: w, actualBoundingBoxAscent: 8, actualBoundingBoxDescent: 2, actualBoundingBoxLeft: 0, actualBoundingBoxRight: w }; },
    createLinearGradient: grad, createRadialGradient: grad, createConicGradient: grad,
    createPattern() { return { setTransform() {} }; },
    getTransform() { return { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0, is2D: true, isIdentity: true, inverse() { return this; } }; },
    getImageData(x, y, w, h) { w = Math.max(1, w | 0); h = Math.max(1, h | 0); return { data: new Uint8ClampedArray(w * h * 4), width: w, height: h }; },
    createImageData(w, h) { w = Math.max(1, w | 0); h = Math.max(1, h | 0); return { data: new Uint8ClampedArray(w * h * 4), width: w, height: h }; },
    isPointInPath() { return false; }, isPointInStroke() { return false; },
    getLineDash() { return []; },
    getContextAttributes() { return { alpha: true }; }
  };
  const noop = function () {};
  return new Proxy(state, {
    get(t, k) {
      if (typeof k === 'symbol') return undefined;
      if (Object.prototype.hasOwnProperty.call(fns, k)) return fns[k];
      if (k in t) return t[k];
      return noop;
    },
    set(t, k, v) { t[k] = v; return true; }
  });
}

// ---------------------------------------------------------------------------
// Node / Element / Text
// ---------------------------------------------------------------------------
const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);

function decodeEntities(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|nbsp|#39);/gi, (m, e) => {
    const l = e.toLowerCase();
    if (l === 'amp') return '&'; if (l === 'lt') return '<'; if (l === 'gt') return '>';
    if (l === 'quot') return '"'; if (l === 'apos' || l === '#39') return "'"; if (l === 'nbsp') return ' ';
    if (l[1] === 'x') return String.fromCodePoint(parseInt(l.slice(2), 16));
    return String.fromCodePoint(parseInt(l.slice(1), 10));
  });
}
function escText(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function escAttr(s) { return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;'); }

function camel(s) { return s.trim().replace(/-([a-z])/g, (m, c) => c.toUpperCase()); }
function makeStyle() {
  const st = {
    setProperty(k, v) { st[camel(k)] = String(v); },
    removeProperty(k) { delete st[camel(k)]; },
    getPropertyValue(k) { return st[camel(k)] || ''; }
  };
  Object.defineProperty(st, 'cssText', {
    enumerable: false,
    get() { return ''; },
    set(v) { String(v).split(';').forEach((d) => { const i = d.indexOf(':'); if (i > 0) st[camel(d.slice(0, i))] = d.slice(i + 1).trim(); }); }
  });
  ['setProperty', 'removeProperty', 'getPropertyValue'].forEach((k) => Object.defineProperty(st, k, { enumerable: false }));
  return st;
}

class FakeNode extends FakeEventTarget {
  constructor(doc) { super(); this.ownerDocument = doc; this.parentNode = null; this.childNodes = []; }
  get parentElement() { return this.parentNode && this.parentNode.nodeType === 1 ? this.parentNode : null; }
  get firstChild() { return this.childNodes[0] || null; }
  get lastChild() { return this.childNodes[this.childNodes.length - 1] || null; }
  get nextSibling() { if (!this.parentNode) return null; const a = this.parentNode.childNodes; return a[a.indexOf(this) + 1] || null; }
  get previousSibling() { if (!this.parentNode) return null; const a = this.parentNode.childNodes; return a[a.indexOf(this) - 1] || null; }
  get isConnected() { let n = this; while (n.parentNode) n = n.parentNode; return n === this.ownerDocument; }
  appendChild(c) { return this.insertBefore(c, null); }
  insertBefore(c, ref) {
    if (c.nodeType === 11) { c.childNodes.slice().forEach((x) => this.insertBefore(x, ref)); return c; }
    if (c.parentNode) c.parentNode.removeChild(c);
    const i = ref ? this.childNodes.indexOf(ref) : -1;
    if (i < 0) this.childNodes.push(c); else this.childNodes.splice(i, 0, c);
    c.parentNode = this;
    return c;
  }
  removeChild(c) {
    const i = this.childNodes.indexOf(c);
    if (i < 0) throw new Error('removeChild: không phải con');
    this.childNodes.splice(i, 1);
    c.parentNode = null;
    if (this.ownerDocument && this.ownerDocument._active && (c === this.ownerDocument._active || c.contains(this.ownerDocument._active))) this.ownerDocument._active = null;
    return c;
  }
  replaceChild(n, o) { this.insertBefore(n, o); this.removeChild(o); return o; }
  remove() { if (this.parentNode) this.parentNode.removeChild(this); }
  contains(n) { while (n) { if (n === this) return true; n = n.parentNode; } return false; }
  _path() {
    const p = [];
    let n = this;
    while (n) { p.unshift(n); n = n.parentNode; }
    if (p[0] === this.ownerDocument && this.ownerDocument.defaultView) p.unshift(this.ownerDocument.defaultView);
    return p;
  }
  get textContent() { return this.childNodes.map((c) => c.textContent).join(''); }
  set textContent(v) { this.childNodes.forEach((c) => { c.parentNode = null; }); this.childNodes = []; if (v !== '' && v != null) this.appendChild(this.ownerDocument.createTextNode(String(v))); }
}

class FakeText extends FakeNode {
  constructor(doc, text) { super(doc); this.nodeType = 3; this.nodeName = '#text'; this.data = String(text); }
  get textContent() { return this.data; }
  set textContent(v) { this.data = String(v); }
  get nodeValue() { return this.data; }
  cloneNode() { return new FakeText(this.ownerDocument, this.data); }
}

class FakeFragment extends FakeNode {
  constructor(doc) { super(doc); this.nodeType = 11; this.nodeName = '#document-fragment'; }
  querySelector(s) { return querySelectorAll(this, s)[0] || null; }
  querySelectorAll(s) { return querySelectorAll(this, s); }
}

let rectCounter = 0;

class FakeElement extends FakeNode {
  constructor(doc, tag) {
    super(doc);
    this.nodeType = 1;
    this.tagName = String(tag).toUpperCase();
    this.nodeName = this.tagName;
    this.localName = String(tag).toLowerCase();
    this.attributes = {};
    this.style = makeStyle();
    this._value = null;
    this.scrollTop = 0; this.scrollLeft = 0;
    const self = this;
    this.classList = {
      _list() { return (self.getAttribute('class') || '').split(/\s+/).filter(Boolean); },
      add(...c) { const l = this._list(); c.forEach((x) => { if (l.indexOf(x) < 0) l.push(x); }); self.setAttribute('class', l.join(' ')); },
      remove(...c) { self.setAttribute('class', this._list().filter((x) => c.indexOf(x) < 0).join(' ')); },
      contains(c) { return this._list().indexOf(c) >= 0; },
      toggle(c, force) { const has = this.contains(c); const on = force === undefined ? !has : !!force; if (on && !has) this.add(c); if (!on && has) this.remove(c); return on; },
      replace(a, b) { if (!this.contains(a)) return false; this.remove(a); this.add(b); return true; },
      get length() { return this._list().length; },
      item(i) { return this._list()[i] || null; }
    };
    this.dataset = new Proxy({}, {
      get(t, k) { if (typeof k !== 'string') return undefined; const v = self.getAttribute('data-' + k.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase())); return v == null ? undefined : v; },
      set(t, k, v) { self.setAttribute('data-' + String(k).replace(/[A-Z]/g, (m) => '-' + m.toLowerCase()), String(v)); return true; },
      deleteProperty(t, k) { self.removeAttribute('data-' + String(k).replace(/[A-Z]/g, (m) => '-' + m.toLowerCase())); return true; }
    });
    if (this.localName === 'canvas') { this._ctx = null; }
  }
  getAttribute(n) { n = String(n).toLowerCase(); return Object.prototype.hasOwnProperty.call(this.attributes, n) ? this.attributes[n] : null; }
  setAttribute(n, v) {
    n = String(n).toLowerCase(); v = String(v);
    this.attributes[n] = v;
    if (n === 'style') { this.style = makeStyle(); this.style.cssText = v; }
  }
  removeAttribute(n) { delete this.attributes[String(n).toLowerCase()]; }
  hasAttribute(n) { return Object.prototype.hasOwnProperty.call(this.attributes, String(n).toLowerCase()); }
  toggleAttribute(n, f) { const on = f === undefined ? !this.hasAttribute(n) : !!f; if (on) this.setAttribute(n, ''); else this.removeAttribute(n); return on; }
  get id() { return this.getAttribute('id') || ''; }
  set id(v) { this.setAttribute('id', v); }
  get className() { return this.getAttribute('class') || ''; }
  set className(v) { this.setAttribute('class', v); }
  get type() { return this.getAttribute('type') || (this.localName === 'button' ? 'submit' : this.localName === 'input' ? 'text' : ''); }
  set type(v) { this.setAttribute('type', v); }
  get value() { return this._value != null ? this._value : (this.getAttribute('value') || ''); }
  set value(v) { this._value = String(v); }
  get disabled() { return this.hasAttribute('disabled'); }
  set disabled(v) { this.toggleAttribute('disabled', !!v); }
  get hidden() { return this.hasAttribute('hidden'); }
  set hidden(v) { this.toggleAttribute('hidden', !!v); }
  get title() { return this.getAttribute('title') || ''; }
  set title(v) { this.setAttribute('title', v); }
  get href() { return this.getAttribute('href') || ''; }
  set href(v) { this.setAttribute('href', v); }
  get tabIndex() { const t = this.getAttribute('tabindex'); return t == null ? (/^(BUTTON|INPUT|A|SELECT|TEXTAREA)$/.test(this.tagName) ? 0 : -1) : +t; }
  set tabIndex(v) { this.setAttribute('tabindex', v); }
  get width() { const w = this.getAttribute('width'); return w == null ? 300 : +w; }
  set width(v) { this.setAttribute('width', v | 0); }
  get height() { const h = this.getAttribute('height'); return h == null ? 150 : +h; }
  set height(v) { this.setAttribute('height', v | 0); }
  get children() { return this.childNodes.filter((c) => c.nodeType === 1); }
  get childElementCount() { return this.children.length; }
  get firstElementChild() { return this.children[0] || null; }
  get lastElementChild() { const c = this.children; return c[c.length - 1] || null; }
  get nextElementSibling() { if (!this.parentNode) return null; const a = this.parentNode.children; return a[a.indexOf(this) + 1] || null; }
  get previousElementSibling() { if (!this.parentNode) return null; const a = this.parentNode.children; return a[a.indexOf(this) - 1] || null; }
  get form() { let n = this.parentNode; while (n && n.tagName !== 'FORM') n = n.parentNode; return n || null; }

  get innerHTML() { return this.childNodes.map(serialize).join(''); }
  set innerHTML(html) {
    this.childNodes.forEach((c) => { c.parentNode = null; });
    this.childNodes = [];
    parseHTML(String(html == null ? '' : html), this, this.ownerDocument);
  }
  get outerHTML() { return serialize(this); }
  get innerText() { return this.textContent; }
  set innerText(v) { this.textContent = v; }
  insertAdjacentHTML(pos, html) {
    const frag = new FakeFragment(this.ownerDocument);
    parseHTML(html, frag, this.ownerDocument);
    if (pos === 'beforeend') this.appendChild(frag);
    else if (pos === 'afterbegin') this.insertBefore(frag, this.firstChild);
    else if (pos === 'beforebegin' && this.parentNode) this.parentNode.insertBefore(frag, this);
    else if (pos === 'afterend' && this.parentNode) this.parentNode.insertBefore(frag, this.nextSibling);
  }
  append(...nodes) { nodes.forEach((n) => this.appendChild(typeof n === 'string' ? this.ownerDocument.createTextNode(n) : n)); }
  prepend(...nodes) { nodes.reverse().forEach((n) => this.insertBefore(typeof n === 'string' ? this.ownerDocument.createTextNode(n) : n, this.firstChild)); }
  replaceChildren(...nodes) { this.childNodes.forEach((c) => { c.parentNode = null; }); this.childNodes = []; this.append(...nodes); }
  cloneNode(deep) {
    const e = this.ownerDocument.createElement(this.localName);
    for (const k in this.attributes) e.setAttribute(k, this.attributes[k]);
    if (deep) this.childNodes.forEach((c) => e.appendChild(c.cloneNode(true)));
    return e;
  }

  querySelector(s) { return querySelectorAll(this, s)[0] || null; }
  querySelectorAll(s) { return querySelectorAll(this, s); }
  getElementsByTagName(t) { return querySelectorAll(this, t); }
  getElementsByClassName(c) { return querySelectorAll(this, c.split(/\s+/).map((x) => '.' + x).join('')); }
  matches(s) { return matchesSelector(this, s); }
  closest(s) { let n = this; while (n && n.nodeType === 1) { if (matchesSelector(n, s)) return n; n = n.parentNode; } return null; }

  // ---- "layout" giả ----
  _visible() {
    let n = this;
    while (n && n.nodeType === 1) {
      if (n.style.display === 'none' || n.classList.contains('hidden') || n.hasAttribute('hidden')) return false;
      n = n.parentNode;
    }
    return this.isConnected;
  }
  get offsetParent() { return this._visible() ? (this.parentNode || null) : null; }
  get offsetWidth() { return this._visible() ? 100 : 0; }
  get offsetHeight() { return this._visible() ? 40 : 0; }
  get clientWidth() { return this.offsetWidth; }
  get clientHeight() { return this.offsetHeight; }
  get scrollHeight() { return this.offsetHeight; }
  getBoundingClientRect() {
    if (this.id === 'game' || this.id === 'gameShell') return { left: 0, top: 0, right: 960, bottom: 540, width: 960, height: 540, x: 0, y: 0 };
    if (!this._rect) { const i = rectCounter++; this._rect = { left: (i % 6) * 110, top: Math.floor(i / 6) * 50 % 500, width: 100, height: 40 }; }
    const r = this._rect;
    return { left: r.left, top: r.top, right: r.left + r.width, bottom: r.top + r.height, width: r.width, height: r.height, x: r.left, y: r.top };
  }
  getClientRects() { return this._visible() ? [this.getBoundingClientRect()] : []; }
  scrollIntoView() {}
  scrollTo() {} scrollBy() {}
  focus() { if (this.isConnected) this.ownerDocument._active = this; }
  blur() { if (this.ownerDocument._active === this) this.ownerDocument._active = null; }
  select() {}
  setPointerCapture() {} releasePointerCapture() {} hasPointerCapture() { return false; }
  requestFullscreen() { return Promise.resolve(); }
  click() {
    if (this.disabled) return;
    const ev = new FakeEvent('click', { bubbles: true, cancelable: true });
    const ok = this.dispatchEvent(ev);
    // Hành vi mặc định: nút submit trong form -> phát 'submit' trên form.
    if (ok && this.tagName === 'BUTTON' && this.type === 'submit' && this.form) {
      this.form.dispatchEvent(new FakeEvent('submit', { bubbles: true, cancelable: true }));
    }
  }
  // ---- canvas ----
  getContext(kind) {
    if (this.localName !== 'canvas') return null;
    if (kind !== '2d') return null;
    if (!this._ctx) this._ctx = makeCtx2d(this);
    return this._ctx;
  }
  toDataURL() { return 'data:image/png;base64,iVBORw0KGgo='; }
  toBlob(cb, type) { const B = globalThis.Blob; cb(new B(['png'], { type: type || 'image/png' })); }
}

class FakeForm extends FakeElement {
  submit() { this.dispatchEvent(new FakeEvent('submit')); }
  requestSubmit() { this.dispatchEvent(new FakeEvent('submit')); }
  reset() {}
}

function serialize(n) {
  if (n.nodeType === 3) return escText(n.data);
  if (n.nodeType !== 1) return '';
  let s = '<' + n.localName;
  for (const k in n.attributes) s += ' ' + k + '="' + escAttr(n.attributes[k]) + '"';
  s += '>';
  if (VOID.has(n.localName)) return s;
  return s + n.childNodes.map(serialize).join('') + '</' + n.localName + '>';
}

// ---------------------------------------------------------------------------
// Parser HTML đơn giản (đủ cho chuỗi HTML do game tạo).
// ---------------------------------------------------------------------------
function parseHTML(html, root, doc) {
  const stack = [root];
  let i = 0;
  const top = () => stack[stack.length - 1];
  while (i < html.length) {
    if (html.startsWith('<!--', i)) { const e = html.indexOf('-->', i + 4); i = e < 0 ? html.length : e + 3; continue; }
    if (html[i] === '<' && html[i + 1] === '/') {
      const e = html.indexOf('>', i);
      const name = html.slice(i + 2, e).trim().toLowerCase();
      for (let k = stack.length - 1; k > 0; k--) {
        if (stack[k].localName === name) { stack.length = k; break; }
      }
      i = e + 1;
      continue;
    }
    if (html[i] === '<' && /[a-zA-Z!]/.test(html[i + 1] || '')) {
      if (html[i + 1] === '!') { const e = html.indexOf('>', i); i = e + 1; continue; } // doctype
      // Đọc tên thẻ + thuộc tính (tôn trọng dấu nháy).
      let j = i + 1;
      while (j < html.length && /[^\s/>]/.test(html[j])) j++;
      const name = html.slice(i + 1, j).toLowerCase();
      const el = doc.createElement(name);
      let selfClose = false;
      while (j < html.length) {
        while (/\s/.test(html[j])) j++;
        if (html[j] === '>') { j++; break; }
        if (html[j] === '/' && html[j + 1] === '>') { selfClose = true; j += 2; break; }
        let k = j;
        while (k < html.length && /[^\s=>/]/.test(html[k])) k++;
        const an = html.slice(j, k);
        j = k;
        while (/\s/.test(html[j])) j++;
        let av = '';
        if (html[j] === '=') {
          j++;
          while (/\s/.test(html[j])) j++;
          const q = html[j];
          if (q === '"' || q === "'") { const e = html.indexOf(q, j + 1); av = html.slice(j + 1, e); j = e + 1; }
          else { let e = j; while (e < html.length && /[^\s>]/.test(html[e])) e++; av = html.slice(j, e); j = e; }
        } else if (!an) { j++; continue; }
        if (an) el.setAttribute(an, decodeEntities(av));
      }
      top().appendChild(el);
      i = j;
      if (name === 'script' || name === 'style' || name === 'textarea') {
        const e = html.toLowerCase().indexOf('</' + name, i);
        const raw = html.slice(i, e < 0 ? html.length : e);
        if (raw) el.appendChild(doc.createTextNode(name === 'textarea' ? decodeEntities(raw) : raw));
        i = e < 0 ? html.length : html.indexOf('>', e) + 1;
        continue;
      }
      if (!selfClose && !VOID.has(name)) stack.push(el);
      continue;
    }
    let e = html.indexOf('<', i + 1);
    if (e < 0) e = html.length;
    // '<' không mở thẻ (vd "a < b") -> coi là chữ
    const text = html.slice(i, e);
    if (text) top().appendChild(doc.createTextNode(decodeEntities(text)));
    i = e;
  }
}

// ---------------------------------------------------------------------------
// Selector: nhóm (,), kết hợp con cháu (khoảng trắng) và con trực tiếp (>),
// phần tử ghép: tag, #id, .class, [attr], [attr=v], [attr^=v], [attr*=v], :nth-child(n), :not(x), :first-child
// ---------------------------------------------------------------------------
function splitTop(s, sep) {
  const out = []; let depth = 0, q = null, cur = '';
  for (const ch of s) {
    if (q) { cur += ch; if (ch === q) q = null; continue; }
    if (ch === '"' || ch === "'") { q = ch; cur += ch; continue; }
    if (ch === '[' || ch === '(') depth++;
    if (ch === ']' || ch === ')') depth--;
    if (ch === sep && depth === 0) { out.push(cur); cur = ''; continue; }
    cur += ch;
  }
  out.push(cur);
  return out;
}
const selCache = new Map();
function parseSelector(sel) {
  if (selCache.has(sel)) return selCache.get(sel);
  const groups = splitTop(sel, ',').map((g) => {
    // tách thành chuỗi [compound, combinator, compound, ...]
    const toks = [];
    let cur = '', depth = 0, q = null;
    const s = g.trim().replace(/\s*>\s*/g, ' > ');
    for (const ch of s) {
      if (q) { cur += ch; if (ch === q) q = null; continue; }
      if (ch === '"' || ch === "'") { q = ch; cur += ch; continue; }
      if (ch === '[' || ch === '(') depth++;
      if (ch === ']' || ch === ')') depth--;
      if (ch === ' ' && depth === 0) { if (cur) toks.push(cur); cur = ''; continue; }
      cur += ch;
    }
    if (cur) toks.push(cur);
    const parts = [];
    for (let i = 0; i < toks.length; i++) {
      if (toks[i] === '>') { parts.push('>'); continue; }
      if (parts.length && parts[parts.length - 1] !== '>') parts.push(' ');
      parts.push(parseCompound(toks[i]));
    }
    return parts;
  });
  selCache.set(sel, groups);
  return groups;
}
function parseCompound(s) {
  const c = { tag: null, id: null, classes: [], attrs: [], pseudos: [] };
  let i = 0;
  const m = /^[a-zA-Z*][\w-]*/.exec(s);
  if (m) { c.tag = m[0] === '*' ? null : m[0].toLowerCase(); i = m[0].length; }
  while (i < s.length) {
    const ch = s[i];
    if (ch === '#' || ch === '.') {
      const mm = /^[\w-]+/.exec(s.slice(i + 1));
      if (ch === '#') c.id = mm[0]; else c.classes.push(mm[0]);
      i += 1 + mm[0].length;
    } else if (ch === '[') {
      const e = s.indexOf(']', i);
      const body = s.slice(i + 1, e);
      const am = /^\s*([\w-]+)\s*(?:([\^$*~|]?=)\s*(?:"([^"]*)"|'([^']*)'|([^\]\s]*)))?\s*$/.exec(body);
      c.attrs.push({ name: am[1].toLowerCase(), op: am[2] || null, val: am[3] != null ? am[3] : am[4] != null ? am[4] : am[5] });
      i = e + 1;
    } else if (ch === ':') {
      const mm = /^:([\w-]+)(?:\(([^)]*)\))?/.exec(s.slice(i));
      c.pseudos.push({ name: mm[1], arg: mm[2] });
      i += mm[0].length;
    } else throw new Error('Selector không hỗ trợ: ' + s);
  }
  return c;
}
function matchCompound(el, c) {
  if (el.nodeType !== 1) return false;
  if (c.tag && el.localName !== c.tag) return false;
  if (c.id && el.id !== c.id) return false;
  for (const cl of c.classes) if (!el.classList.contains(cl)) return false;
  for (const a of c.attrs) {
    const v = el.getAttribute(a.name);
    if (v == null) return false;
    if (!a.op) continue;
    if (a.op === '=' && v !== a.val) return false;
    if (a.op === '^=' && !v.startsWith(a.val)) return false;
    if (a.op === '$=' && !v.endsWith(a.val)) return false;
    if (a.op === '*=' && v.indexOf(a.val) < 0) return false;
    if (a.op === '~=' && v.split(/\s+/).indexOf(a.val) < 0) return false;
  }
  for (const p of c.pseudos) {
    const sib = el.parentNode ? el.parentNode.children : [el];
    const idx = sib.indexOf(el) + 1;
    if (p.name === 'nth-child' && idx !== +p.arg) return false;
    else if (p.name === 'first-child' && idx !== 1) return false;
    else if (p.name === 'last-child' && idx !== sib.length) return false;
    else if (p.name === 'not' && matchesSelector(el, p.arg)) return false;
    else if (p.name === 'checked' && !el.checked) return false;
    else if (p.name === 'disabled' && !el.disabled) return false;
    else if (p.name === 'focus' && el.ownerDocument._active !== el) return false;
    else if (!/^(nth-child|first-child|last-child|not|checked|disabled|focus)$/.test(p.name)) throw new Error('Pseudo không hỗ trợ: ' + p.name);
  }
  return true;
}
function matchParts(el, parts, idx) {
  if (!matchCompound(el, parts[idx])) return false;
  if (idx === 0) return true;
  const comb = parts[idx - 1];
  if (comb === '>') return !!el.parentNode && el.parentNode.nodeType === 1 && matchParts(el.parentNode, parts, idx - 2);
  let p = el.parentNode;
  while (p && p.nodeType === 1) { if (matchParts(p, parts, idx - 2)) return true; p = p.parentNode; }
  return false;
}
function matchesSelector(el, sel) {
  return parseSelector(sel).some((parts) => matchParts(el, parts, parts.length - 1));
}
function querySelectorAll(root, sel) {
  const groups = parseSelector(sel);
  const out = [];
  (function walk(n) {
    for (const c of n.childNodes) {
      if (c.nodeType !== 1) continue;
      if (groups.some((parts) => matchParts(c, parts, parts.length - 1))) out.push(c);
      walk(c);
    }
  })(root);
  return out;
}

// ---------------------------------------------------------------------------
// Document
// ---------------------------------------------------------------------------
class FakeDocument extends FakeNode {
  constructor() {
    super(null);
    this.ownerDocument = this;
    this.nodeType = 9;
    this.nodeName = '#document';
    this.readyState = 'loading';
    this.hidden = false;
    this.visibilityState = 'visible';
    this._active = null;
    this.defaultView = null;
    this.documentElement = this.createElement('html');
    this.appendChild(this.documentElement);
    this.head = this.createElement('head');
    this.body = this.createElement('body');
    this.documentElement.appendChild(this.head);
    this.documentElement.appendChild(this.body);
    this.copied = [];
  }
  get activeElement() { return this._active && this._active.isConnected ? this._active : this.body; }
  createElement(tag) { tag = String(tag).toLowerCase(); return tag === 'form' ? new FakeForm(this, tag) : new FakeElement(this, tag); }
  createElementNS(ns, tag) { return this.createElement(tag); }
  createTextNode(t) { return new FakeText(this, t); }
  createDocumentFragment() { return new FakeFragment(this); }
  getElementById(id) { return querySelectorAll(this, '#' + id)[0] || null; }
  querySelector(s) { return querySelectorAll(this, s)[0] || null; }
  querySelectorAll(s) { return querySelectorAll(this, s); }
  getElementsByTagName(t) { return querySelectorAll(this, t); }
  getElementsByClassName(c) { return this.documentElement.getElementsByClassName(c); }
  execCommand(cmd) { if (cmd === 'copy') { this.copied.push(cmd); return true; } return false; }
  hasFocus() { return true; }
  elementFromPoint() { return null; }
  _path() { return this.defaultView ? [this.defaultView, this] : [this]; }
}

// ---------------------------------------------------------------------------
// localStorage + AudioContext giả
// ---------------------------------------------------------------------------
function makeStorage() {
  const m = new Map();
  return {
    getItem(k) { return m.has(String(k)) ? m.get(String(k)) : null; },
    setItem(k, v) { m.set(String(k), String(v)); },
    removeItem(k) { m.delete(String(k)); },
    clear() { m.clear(); },
    key(i) { return Array.from(m.keys())[i] || null; },
    get length() { return m.size; },
    _map: m
  };
}

function makeAudioContextClass(clock) {
  function param(v) {
    const p = { value: v, defaultValue: v, minValue: -3.4e38, maxValue: 3.4e38 };
    ['setValueAtTime', 'linearRampToValueAtTime', 'exponentialRampToValueAtTime', 'setTargetAtTime',
      'cancelScheduledValues', 'cancelAndHoldAtTime', 'setValueCurveAtTime'].forEach((k) => {
      p[k] = function (val, t) {
        if (k === 'exponentialRampToValueAtTime' && !(val > 0 || val < 0)) throw new RangeError('exponentialRamp tới 0 / NaN');
        if (typeof t === 'number' && !isFinite(t)) throw new TypeError(k + ': thời gian không hữu hạn');
        return p;
      };
    });
    return p;
  }
  function node(extra) {
    const n = Object.assign({
      connect(d) { if (!d) throw new TypeError('connect(undefined)'); return d; }, disconnect() {},
      start(t) { if (n._started) throw new Error('InvalidStateError: start() hai lần'); n._started = true; }, stop() {},
      addEventListener() {}, removeEventListener() {}, onended: null, numberOfInputs: 1, numberOfOutputs: 1,
      channelCount: 2, setPeriodicWave() {}, getFloatFrequencyData() {}, getByteFrequencyData() {}, getByteTimeDomainData() {}
    }, extra || {});
    return new Proxy(n, {
      get(t, k) {
        if (typeof k === 'symbol') return undefined;
        if (k in t) return t[k];
        if (k === 'then') return undefined;
        t[k] = param(0); // mọi thuộc tính lạ là AudioParam (frequency, gain, detune, Q, pan...)
        return t[k];
      }
    });
  }
  return class FakeAudioContext {
    constructor() {
      this.state = 'running';
      this.sampleRate = 44100;
      this.destination = node({ maxChannelCount: 2 });
      this.listener = node();
      this.onstatechange = null;
      FakeAudioContext.instances = (FakeAudioContext.instances || 0) + 1;
      const self = this;
      return new Proxy(this, {
        get(t, k) {
          if (k in t) return t[k];
          if (typeof k === 'string' && /^create/.test(k)) return function () { return node({ context: self }); };
          return undefined;
        }
      });
    }
    get currentTime() { return clock.t; }
    createBuffer(ch, len, sr) {
      if (!(len > 0)) throw new Error('NotSupportedError: buffer rỗng');
      return { numberOfChannels: ch, length: len, sampleRate: sr, duration: len / sr, getChannelData() { return new Float32Array(len); } };
    }
    createPeriodicWave() { return {}; }
    decodeAudioData() { return Promise.reject(new Error('không hỗ trợ')); }
    resume() { this.state = 'running'; return Promise.resolve(); }
    suspend() { this.state = 'suspended'; return Promise.resolve(); }
    close() { this.state = 'closed'; return Promise.resolve(); }
    addEventListener() {} removeEventListener() {}
  };
}

module.exports = {
  FakeEvent, FakeEventTarget, FakeDocument, FakeElement, parseHTML, makeStorage, makeAudioContextClass, makeCtx2d,
  setListenerErrorHandler(fn) { onListenerError = fn; }
};
