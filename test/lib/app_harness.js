'use strict';
// APP-HARNESS [PHASE1-LOADER-001]
//   テスト共通の「対象 HTML 全束評価」ヘルパ。
//
//   これまで各テストが自前で複製していた
//     extractScripts(RAW) → new Function('document','window',…, js+';return {…}')
//   を 1 箇所に集約する。意味論は変えない（同じ全束を 1 コンテキストで評価するだけ）。
//
//   API は「二相」を必須とする:
//     ・評価前 override … ブラウザ API の mock（document / localStorage / window / …）
//     ・評価後 stub     … アプリ自身が定義する関数の差し替え（loadBranchMaster 等）
//   アプリが定義する名前を評価前 override に渡すと、評価時に本物の定義で黙って
//   上書きされる（＝ stub が効いていないのにテストは緑）。これを機械的に防ぐため、
//   評価後に override の同一性を検証し、壊れていれば例外にする。
//
//   関数単体を空環境で評価する「隔離モード」は本ヘルパには入っていない（スライス3）。
//   詳細は test/lib/MIGRATION.md を参照。

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const APP_HARNESS_VERSION = 1;

// ---------------------------------------------------------------- script 抽出

// 対象 HTML の inline <script> を連結する。src= 付き（外部 script）は除外する。
// 既存テストの複製実装（src= を除外しない）と結果が一致することは
// assertExtractionMatchesLegacy() で検証できる。
function extractScripts(html) {
  const re = /<script([^>]*)>([\s\S]*?)<\/script>/g;
  let out = '';
  let m;
  while ((m = re.exec(html)) !== null) {
    if (/\bsrc\s*=/i.test(m[1])) continue;
    out += m[2] + '\n';
  }
  return out;
}

// 既存テストが使っている素の正規表現（src= を除外しない）。
function extractScriptsLegacy(html) {
  const re = /<script[^>]*>([\s\S]*?)<\/script>/g;
  let out = '';
  let m;
  while ((m = re.exec(html)) !== null) out += m[1] + '\n';
  return out;
}

// ---------------------------------------------------------------- DOM mock

function makeClassList(node) {
  return {
    add(...cs) {
      const cur = String(node.className || '').split(/\s+/).filter(Boolean);
      for (const c of cs) if (cur.indexOf(c) < 0) cur.push(c);
      node.className = cur.join(' ');
    },
    remove(...cs) {
      const cur = String(node.className || '').split(/\s+/).filter(Boolean);
      node.className = cur.filter((c) => cs.indexOf(c) < 0).join(' ');
    },
    toggle(c, force) {
      const has = this.contains(c);
      const want = force === undefined ? !has : !!force;
      if (want) this.add(c); else this.remove(c);
      return want;
    },
    contains(c) {
      return String(node.className || '').split(/\s+/).indexOf(c) >= 0;
    },
  };
}

function makeNode(tag) {
  const n = {
    nodeType: 1,
    tagName: String(tag || 'div').toUpperCase(),
    id: '',
    className: '',
    value: '',
    innerHTML: '',
    innerText: '',
    textContent: '',
    disabled: false,
    checked: false,
    selected: false,
    hidden: false,
    href: '',
    src: '',
    type: '',
    files: null,
    scrollTop: 0,
    offsetWidth: 0,
    offsetHeight: 0,
    style: { display: '' },
    dataset: {},
    childNodes: [],
    children: [],
    parentNode: null,
    onclick: null,
    onchange: null,
    oninput: null,
    onkeydown: null,
    _attrs: {},
    _listeners: {},
    appendChild(c) { this.childNodes.push(c); if (c && c.nodeType === 1) this.children.push(c); if (c) c.parentNode = this; return c; },
    insertBefore(c, ref) { const i = this.childNodes.indexOf(ref); if (i < 0) this.childNodes.push(c); else this.childNodes.splice(i, 0, c); if (c) c.parentNode = this; return c; },
    removeChild(c) { const i = this.childNodes.indexOf(c); if (i >= 0) this.childNodes.splice(i, 1); const j = this.children.indexOf(c); if (j >= 0) this.children.splice(j, 1); return c; },
    remove() { if (this.parentNode) this.parentNode.removeChild(this); },
    replaceChildren() { this.childNodes = []; this.children = []; },
    setAttribute(k, v) { this._attrs[k] = String(v); if (k === 'id') this.id = String(v); if (k === 'class') this.className = String(v); },
    getAttribute(k) { return (k in this._attrs) ? this._attrs[k] : null; },
    removeAttribute(k) { delete this._attrs[k]; },
    hasAttribute(k) { return k in this._attrs; },
    addEventListener(t, fn) { (this._listeners[t] = this._listeners[t] || []).push(fn); },
    removeEventListener(t, fn) { const a = this._listeners[t]; if (a) { const i = a.indexOf(fn); if (i >= 0) a.splice(i, 1); } },
    dispatchEvent(ev) { const a = this._listeners[(ev && ev.type) || ''] || []; for (const fn of a.slice()) fn.call(this, ev); return true; },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    getElementsByTagName() { return []; },
    getElementsByClassName() { return []; },
    closest() { return null; },
    contains() { return false; },
    focus() {}, blur() {}, select() {}, scrollIntoView() {},
    getBoundingClientRect() { return { top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0 }; },
    click() { if (typeof this.onclick === 'function') this.onclick(); const a = this._listeners.click || []; for (const fn of a.slice()) fn.call(this, { type: 'click', target: this, preventDefault() {}, stopPropagation() {} }); },
    submit() {},
  };
  n.classList = makeClassList(n);
  return n;
}

function makeDocument(record) {
  const els = Object.create(null);
  const doc = {
    nodeType: 9,
    readyState: 'complete',
    title: '',
    cookie: '',
    _listeners: {},
    getElementById(id) {
      if (!els[id]) { const x = makeNode('div'); x.id = id; els[id] = x; }
      return els[id];
    },
    createElement(t) { const n = makeNode(t); record.createElement.push(String(t || 'div')); return n; },
    createTextNode(t) { return { nodeType: 3, textContent: String(t == null ? '' : t) }; },
    createDocumentFragment() { return makeNode('fragment'); },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    getElementsByTagName() { return []; },
    getElementsByClassName() { return []; },
    getElementsByName() { return []; },
    addEventListener(t, fn) { (this._listeners[t] = this._listeners[t] || []).push(fn); },
    removeEventListener(t, fn) { const a = this._listeners[t]; if (a) { const i = a.indexOf(fn); if (i >= 0) a.splice(i, 1); } },
    dispatchEvent() { return true; },
    execCommand() { return true; },
  };
  doc.body = makeNode('body');
  doc.head = makeNode('head');
  doc.documentElement = makeNode('html');
  doc.activeElement = null;
  doc._els = els;
  return doc;
}

function makeLocalStorage(record, label) {
  const store = Object.create(null);
  return {
    _store: store,
    get length() { return Object.keys(store).length; },
    key(i) { return Object.keys(store)[i] || null; },
    getItem(k) { return (k in store) ? store[k] : null; },
    setItem(k, v) { store[k] = String(v); record[label + 'SetItem'].push([String(k), String(v)]); },
    removeItem(k) { delete store[k]; record[label + 'RemoveItem'].push(String(k)); },
    clear() { for (const k of Object.keys(store)) delete store[k]; },
  };
}

// ---------------------------------------------------------------- 既定 mock

function makeDefaults(record) {
  const doc = makeDocument(record);
  const localStorage = makeLocalStorage(record, 'local');
  const sessionStorage = makeLocalStorage(record, 'session');

  const location = {
    href: 'http://localhost/shogi_v4.html',
    origin: 'http://localhost',
    protocol: 'http:',
    host: 'localhost',
    hostname: 'localhost',
    pathname: '/shogi_v4.html',
    search: '',
    hash: '',
    reload() {}, assign() {}, replace() {},
    toString() { return this.href; },
  };

  const win = {
    innerWidth: 1024,
    innerHeight: 768,
    scrollX: 0,
    scrollY: 0,
    devicePixelRatio: 1,
    document: doc,
    location,
    localStorage,
    sessionStorage,
    _listeners: {},
    addEventListener(t, fn) { (this._listeners[t] = this._listeners[t] || []).push(fn); },
    removeEventListener(t, fn) { const a = this._listeners[t]; if (a) { const i = a.indexOf(fn); if (i >= 0) a.splice(i, 1); } },
    dispatchEvent() { return true; },
    scrollTo() {}, scrollBy() {}, focus() {}, close() {}, print() {},
    matchMedia() { return { matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }; },
    getComputedStyle() { return { getPropertyValue() { return ''; } }; },
    open() { return { focus() {}, print() {}, close() {}, addEventListener() {}, document: { write() {}, close() {} } }; },
    alert() {}, confirm() { return true; }, prompt() { return ''; },
  };

  const setTimeoutMock = function (cb, ms) { record.timers.push({ cb, ms }); return record.timers.length; };
  const setIntervalMock = function (cb, ms) { record.intervals.push({ cb, ms }); return record.intervals.length; };

  function Blob(parts, opts) { this.parts = parts || []; this.type = (opts && opts.type) || ''; this.size = 0; }
  function FileReader() {
    this.result = null; this.onload = null; this.onerror = null;
    this.readAsText = function () { record.fileReads.push('readAsText'); };
    this.readAsDataURL = function () { record.fileReads.push('readAsDataURL'); };
  }

  return {
    document: doc,
    window: win,
    localStorage,
    sessionStorage,
    location,
    navigator: { onLine: true, userAgent: 'node-test', language: 'ja-JP', clipboard: { writeText() { return Promise.resolve(); } }, share: undefined },
    crypto: { randomUUID() { return '0'; }, getRandomValues(a) { return a; } },
    alert(msg) { record.alert.push(String(msg == null ? '' : msg)); },
    confirm(msg) { record.confirm.push(String(msg == null ? '' : msg)); return true; },
    prompt(msg) { record.prompt.push(String(msg == null ? '' : msg)); return ''; },
    console: {
      log(...a) { record.console.push(['log', a.map(String).join(' ')]); },
      warn(...a) { record.console.push(['warn', a.map(String).join(' ')]); },
      error(...a) { record.console.push(['error', a.map(String).join(' ')]); },
      info(...a) { record.console.push(['info', a.map(String).join(' ')]); },
      debug() {}, table() {}, group() {}, groupEnd() {}, trace() {},
    },
    setTimeout: setTimeoutMock,
    clearTimeout() {},
    setInterval: setIntervalMock,
    clearInterval() {},
    requestAnimationFrame(cb) { record.timers.push({ cb, ms: 0 }); return record.timers.length; },
    cancelAnimationFrame() {},
    Blob,
    FileReader,
    URL: { createObjectURL() { return 'blob:0'; }, revokeObjectURL() {} },
    fetch(url, init) { record.fetch.push([String(url), init || null]); return Promise.resolve({ ok: true, status: 200, json() { return Promise.resolve({}); }, text() { return Promise.resolve(''); } }); },
  };
}

function makeRecord() {
  return {
    localSetItem: [], localRemoveItem: [],
    sessionSetItem: [], sessionRemoveItem: [],
    alert: [], confirm: [], prompt: [],
    console: [], fetch: [], timers: [], intervals: [],
    createElement: [], fileReads: [],
    calls: Object.create(null),
  };
}

// ---------------------------------------------------------------- loadApp

const sourceCache = new Map();

function readSource(target) {
  const abs = path.isAbsolute(target) ? target : path.resolve(process.cwd(), target);
  if (!sourceCache.has(abs)) {
    const html = fs.readFileSync(abs, 'utf8');
    sourceCache.set(abs, { html, code: extractScripts(html) });
  }
  return sourceCache.get(abs);
}

// 既定の対象。テストは `node test/test_X.js <TARGET>` で起動されるので
// process.argv[2] を既定にする（run_tests.sh が渡す）。
function defaultTarget() {
  return process.argv[2] || 'shogi_v4.html';
}

// 対象 HTML の生ソース（評価はしない）。RAW に対する静的アサートで使う。
function readHtml(target) {
  return readSource(target || defaultTarget()).html;
}

function loadApp(target, opts) {
  if (target && typeof target === 'object' && opts === undefined) { opts = target; target = undefined; }
  opts = opts || {};
  const tgt = target || opts.target || defaultTarget();
  const src = readSource(tgt);

  const record = makeRecord();
  const defaults = makeDefaults(record);
  const overrides = opts.overrides || {};

  const sandbox = {};
  for (const k of Object.keys(defaults)) sandbox[k] = defaults[k];
  for (const k of Object.keys(overrides)) sandbox[k] = overrides[k];
  // window 越しの参照が既定 mock を指したままにならないよう、差し替えを追従させる。
  if (!('window' in overrides) && sandbox.window) {
    if ('document' in overrides) sandbox.window.document = sandbox.document;
    if ('localStorage' in overrides) sandbox.window.localStorage = sandbox.localStorage;
    if ('location' in overrides) sandbox.window.location = sandbox.location;
  }
  if (opts.globals) for (const k of Object.keys(opts.globals)) sandbox[k] = opts.globals[k];

  // 評価前に渡した名前と値を控える（評価後の同一性検証に使う）。
  const preNames = Object.keys(sandbox);
  const preValues = new Map();
  for (const k of preNames) preValues.set(k, sandbox[k]);

  vm.createContext(sandbox);
  if (src.code.length === 0) {
    throw new Error('[app_harness] ' + tgt + ' から <script> を1本も抽出できなかった（抽出器の破損）');
  }
  vm.runInContext(src.code, sandbox, { filename: tgt + '#scripts', displayErrors: true });

  // --- 評価前 override の clobber 検出 -------------------------------------
  // アプリ自身が同名のトップレベル関数/変数を定義していると、評価時に本物の定義で
  // 上書きされる。stub のつもりで渡した関数が黙って無効化される事故を機械的に潰す。
  const clobbered = [];
  for (const k of preNames) {
    if (sandbox[k] !== preValues.get(k)) {
      clobbered.push({ name: k, byUser: Object.prototype.hasOwnProperty.call(overrides, k) });
    }
  }
  if (clobbered.length) {
    const userSide = clobbered.filter((c) => c.byUser).map((c) => c.name);
    const defSide = clobbered.filter((c) => !c.byUser).map((c) => c.name);
    const lines = [];
    lines.push('[app_harness] 評価前 override がアプリ自身の定義で上書きされた（黙って無効化される）');
    if (userSide.length) lines.push('  overrides で渡した名前: ' + userSide.join(', '));
    if (defSide.length) lines.push('  既定 mock の名前: ' + defSide.join(', '));
    lines.push('  → アプリが定義する関数の差し替えは評価後 stub（harness.stub(name, fn)）を使うこと');
    throw new Error(lines.join('\n'));
  }

  // --- harness -------------------------------------------------------------
  const appNames = Object.keys(sandbox).filter((k) => preValues.has(k) === false);

  const harness = {
    APP_HARNESS_VERSION,
    target: tgt,
    ctx: sandbox,
    html: src.html,
    source: src.code,
    record,
    document: sandbox.document,
    window: sandbox.window,
    localStorage: sandbox.localStorage,
    els: (sandbox.document && sandbox.document._els) || Object.create(null),
    appNames,

    has(name) { return Object.prototype.hasOwnProperty.call(sandbox, name); },
    get(name) {
      if (!harness.has(name)) throw new Error('[app_harness] 未定義のグローバル: ' + name);
      return sandbox[name];
    },
    set(name, v) { sandbox[name] = v; return harness; },
    fn(name) {
      const v = sandbox[name];
      if (typeof v !== 'function') throw new Error('[app_harness] 関数ではない/未定義: ' + name + ' (typeof=' + typeof v + ')');
      return v;
    },
    call(name, ...args) { return harness.fn(name).apply(sandbox, args); },
    el(id) { return sandbox.document.getElementById(id); },

    // 評価後 stub: アプリが定義した名前だけ差し替えられる（typo を弾く）。
    stub(name, impl) {
      if (!harness.has(name)) throw new Error('[app_harness] stub 対象がアプリに存在しない: ' + name);
      const prev = sandbox[name];
      sandbox[name] = impl;
      return function restore() { sandbox[name] = prev; };
    },
    // 呼び出し記録つきの通過 stub。record.calls[name] に引数配列が積まれる。
    spy(name, options) {
      const passthrough = !(options && options.passthrough === false);
      const orig = harness.fn(name);
      const log = (record.calls[name] = record.calls[name] || []);
      sandbox[name] = function (...args) {
        log.push(args);
        return passthrough ? orig.apply(this, args) : undefined;
      };
      return log;
    },
    calls(name) { return record.calls[name] || []; },

    // 既定 setTimeout は発火しない（既存テストの cb=>0 と同じ）。明示的に流したいとき用。
    flushTimers() {
      const t = record.timers.splice(0, record.timers.length);
      for (const x of t) { if (typeof x.cb === 'function') x.cb(); }
      return t.length;
    },
  };

  Object.defineProperty(harness, 'state', {
    get() { return sandbox.state; },
    set(v) { sandbox.state = v; },
    enumerable: true,
  });

  return harness;
}

// 抽出器の等価確認（既存テストの素の正規表現と結果が一致するか）。
function assertExtractionMatchesLegacy(target) {
  const tgt = target || defaultTarget();
  const abs = path.isAbsolute(tgt) ? tgt : path.resolve(process.cwd(), tgt);
  const html = fs.readFileSync(abs, 'utf8');
  const a = extractScripts(html);
  const b = extractScriptsLegacy(html);
  return { equal: a === b, newLen: a.length, legacyLen: b.length };
}

module.exports = {
  APP_HARNESS_VERSION,
  loadApp,
  readHtml,
  extractScripts,
  extractScriptsLegacy,
  assertExtractionMatchesLegacy,
  makeNode,
  defaultTarget,
};
