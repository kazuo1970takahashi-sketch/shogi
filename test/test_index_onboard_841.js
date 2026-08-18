#!/usr/bin/env node
// INDEX-ONBOARD-001 (#841): index.html の「他のクラブ・支部の方へ」導入導線のピン。
//
// 何を守るか:
//   A. 導線そのもの（新カード・アンカー・副題の可読性・適用範囲の注記）が消えたら FAIL。
//   B. 「今できること／今できないこと」の各項目が、**書いた当時のコード事実**とずれたら FAIL。
//   C. 作者決定（2026-08-09）「問い合わせ窓口は設けない」＝メールアドレスを載せない。
//
// ★ B の書き方について（2026-08-17 の反証パネルの指摘を受けた設計変更・重要）:
//   初版は `/function\s+resetAll\s*\(/` のように **関数や文字列の「存在」だけ**を見ていた。
//   これは腐り対策として機能しない。実際、初版は
//     ・項目1「全リセットで沼津の値に戻る」→ #845/#864 (CLUB-PROFILE-001/002) で**保持されるよう直っていた**
//     ・項目5「奇数のまま部分開始すると1回戦を確定できない」→ #835 (FIRSTROUND-ODD-001) で**直っていた**
//   の2件を **PASS=36/FAIL=0 のまま素通しした**（サイトが「できない」と嘘を書く状態）。
//   よってここでは **文言が依存している「振る舞いの側」をピンする**。
//   コード側が変わったらこのテストが赤くなり、サイトの文言更新が強制される。
//
// 実データ不使用・読み取り専用。docs/ と app/ と supabase/ は index.html と同じ repo 直下を見る。
const fs = require('fs');
const path = require('path');
const target = process.argv[2] || 'shogi_v4.html';
const root = path.dirname(path.resolve(target));

let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : (fail++, console.log('  FAIL: ' + m)); };

function readOrNull(rel) {
  try { return fs.readFileSync(path.join(root, rel), 'utf8'); } catch (e) { return null; }
}

const IDX = readOrNull('index.html');
ok(IDX !== null, 'A0 index.html を読めること');
if (IDX === null) { console.log('INDEX-ONBOARD-001: PASS=' + pass + ', FAIL=' + fail); process.exit(1); }
const APP = readOrNull('shogi_v4.html') || fs.readFileSync(path.resolve(target), 'utf8');

// 「今できること」節 / 「今できないこと」節をそれぞれ切り出す（項目の混同を防ぐ）。
const iCan = IDX.indexOf('今できること');
const iCant = IDX.indexOf('今できないこと');
const iWarr = IDX.indexOf('保証していないこと');
ok(iCan > 0 && iCant > iCan && iWarr > iCant, 'A0b 3節がこの順で存在する');
const CAN = IDX.slice(iCan, iCant);
const CANT = IDX.slice(iCant, iWarr);

// ---- A. 導線そのもの ---------------------------------------------------------

ok(/はじめての方へ（他のクラブ・支部の方）/.test(IDX),
   'A1 新カードの見出し「はじめての方へ（他のクラブ・支部の方）」がある');
ok(/id="for-other-clubs"/.test(IDX), 'A2 新カードに id="for-other-clubs" がある');
ok(/href="#for-other-clubs"/.test(IDX), 'A3 #for-other-clubs へのアンカーがある');
ok(IDX.indexOf('href="#for-other-clubs"') < IDX.indexOf('id="for-other-clubs"'),
   'A4 アンカーは着地点より前にある');

// アンカーで飛んだあと、フォーカスとスクリーンリーダーのカーソルがセクション本体へ移るように。
//   実ブラウザ班の実測: このカードより後ろにフォーカス可能要素が1つも無いため、tabindex が無いと
//   飛んだ直後の Tab がページ先頭のリンクへ戻り、読み位置が失われる。
ok(/id="for-other-clubs"[^>]*tabindex="-1"|tabindex="-1"[^>]*id="for-other-clubs"/.test(IDX),
   'A5 着地点に tabindex="-1" がある（飛んだ後にフォーカスがページ先頭へ戻らないため）');

// 副題に「他のクラブ・支部の方もお使いいただけます」を載せた以上、可読性の修正は必須。
//   汎用 p{color:#333} が .header{color:#fff} の継承を上書きしていた（紺地に濃灰＝実測 1.07:1）。
ok(/\.header\s+p\s*\{[^}]*color\s*:\s*#fff/i.test(IDX),
   'A6 .header p に color:#fff が明示されている（副題のコントラスト・従来からの不具合の修正）');
ok(/他のクラブ・支部の方もお使いいただけます/.test(IDX),
   'A7 ヘッダ副題に「他のクラブ・支部の方もお使いいただけます」がある');

['今できること', '今できないこと', '保証していないこと', '試すときのおすすめ'].forEach(function (h, i) {
  ok(IDX.indexOf(h) !== -1, 'A8-' + (i + 1) + ' 見出し「' + h + '」がある');
});

// 沼津固有カード直前の「ここから下は当てはまりません」注記。他クラブの方が読み飛ばすと
// 参加費表を自分たちのものと誤読するので、AA を満たす色でなければならない。
const scopeNote = /ここから下は沼津支部の運営情報です[^<]*<\/p>/.test(IDX);
ok(scopeNote, 'A9 沼津固有カードの前に適用範囲の注記がある');
// ★ Codex P2 (r3796685726): 「#888 を禁止」では #999 や低 opacity が素通りする。
//   実際の前景色と背景色を CSS から解決して **WCAG のコントラスト比を計算**する。
function hex2rgb(h) {
  h = h.replace('#', '');
  if (h.length === 3) h = h.split('').map(c => c + c).join('');
  return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16));
}
function relLum(rgb) {
  const c = rgb.map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
function contrast(fg, bg) {
  const [a, b] = [relLum(hex2rgb(fg)), relLum(hex2rgb(bg))].sort((x, y) => y - x);
  return (a + 0.05) / (b + 0.05);
}
// ★ Codex P2 (r3799347840): opacity を合成していないと `opacity:0.4` で実効 1.88:1 まで落ちても緑。
//   前景を背景の上に alpha 合成してから比を出す。
function composite(fgHex, bgHex, alpha) {
  const f = hex2rgb(fgHex), b = hex2rgb(bgHex);
  return [0, 1, 2].map(i => f[i] * alpha + b[i] * (1 - alpha));
}
function contrastRgb(fgRgb, bgRgb) {
  const [a, b] = [relLum(fgRgb), relLum(bgRgb)].sort((x, y) => y - x);
  return (a + 0.05) / (b + 0.05);
}
// class 規則とインラインの両方から color と opacity を取る（インラインが勝つ）。
function styleProp(rule, inline, prop) {
  const re = new RegExp(prop + '\\s*:\\s*([^;"}]+)');
  const mi = inline.match(re), mr = rule.match(re);
  return (mi ? mi[1] : (mr ? mr[1] : '')).trim();
}
// ★ Codex P2 (r3799468511 / r3799706698): 最初の1タグ・最初の1規則だけ見ると、
//   後続タグの個別 opacity や、より詳細度の高い規則（`.card .scope-note{opacity:.4}`）、
//   祖先の opacity が素通りする。
//   → (1) `<style>` 内の**全規則**を走査し、`.scope-note` に当たる規則を**ソース順で畳む**
//     (2) 祖先（body / .container / .card / p / *）の opacity を**掛け合わせる**
//     (3) 各タグのインライン指定を最後に重ねる
//   （静的解決なので厳密な詳細度計算ではない。「後に書いた宣言が勝つ」＝実運用の書き方に対して
//     保守的に効く。実ブラウザでの computed style は check スクリプト側で別途全数測定している。）
const STYLE_BLOCK = (IDX.match(/<style>([\s\S]*?)<\/style>/) || ['', ''])[1];
function cssRules(css) {
  const out = [];
  const re = /([^{}]+)\{([^}]*)\}/g;
  let m;
  while ((m = re.exec(css)) !== null) {
    out.push({ sel: m[1].replace(/\/\*[\s\S]*?\*\//g, '').trim(), body: m[2] });
  }
  return out;
}
const RULES = cssRules(STYLE_BLOCK.replace(/\/\*[\s\S]*?\*\//g, ''));
function declOf(body, prop) {
  const m = body.match(new RegExp('(?:^|;)\\s*' + prop + '\\s*:\\s*([^;]+)'));
  return m ? m[1].trim() : null;
}
// scope-note 自身に当たる規則（末尾が .scope-note のセレクタ、または裸の p）
function hitsScopeNote(sel) {
  return sel.split(',').some(one => {
    const t = one.trim();
    return /\.scope-note\s*$/.test(t) || t === 'p' || t === '*';
  });
}
// scope-note の祖先に当たる規則（opacity は祖先ぶんも掛かる）
function hitsAncestor(sel) {
  return sel.split(',').some(one => {
    const t = one.trim();
    return t === 'body' || t === 'html' || t === '*' || t === '.container' ||
           t === '.card' || t === '.card-intro' || /\.card\s*$/.test(t);
  });
}
let ruleColor = null, ruleOpacity = 1, ancestorOpacity = 1;
RULES.forEach(r => {
  if (hitsScopeNote(r.sel)) {
    const c = declOf(r.body, 'color'); if (c) ruleColor = c;              // 後に書いた方が勝つ
    const o = declOf(r.body, 'opacity'); if (o) ruleOpacity = Number(o);
  }
  if (hitsAncestor(r.sel)) {
    const o = declOf(r.body, 'opacity'); if (o) ancestorOpacity *= Number(o);
  }
});
const scopeTagsAll = IDX.match(/<p[^>]*class="scope-note"[^>]*>/g) || [];
const cardBg = (IDX.match(/\.card\s*\{[^}]*background\s*:\s*(#[0-9a-fA-F]{3,6})/) || [])[1];
const noteResults = scopeTagsAll.map((tag, n) => {
  const inlineC = (tag.match(/color\s*:\s*(#[0-9a-fA-F]{3,6})/) || [])[1];
  const inlineO = (tag.match(/opacity\s*:\s*([0-9.]+)/) || [])[1];
  const fg = inlineC || ruleColor;
  const op = (inlineO !== undefined ? Number(inlineO) : ruleOpacity) * ancestorOpacity;
  const ratio = (fg && cardBg && isFinite(op))
    ? contrastRgb(composite(fg, cardBg, op), hex2rgb(cardBg)) : 0;
  return { n: n + 1, fg, op, ratio };
});
ok(scopeTagsAll.length >= 3, 'A9b 適用範囲の注記が3箇所以上ある（実測 ' + scopeTagsAll.length + '箇所）');
const noteBad = noteResults.filter(r => !(r.ratio >= 4.5));
ok(cardBg !== undefined && noteResults.length > 0 && noteBad.length === 0,
   'A10 ★実測: **全ての**注記が実効コントラスト 4.5:1 以上（全 CSS 規則＋祖先 opacity＋インライン込み）' +
   '（実測: ' + noteResults.map(r => '#' + r.n + ' ' + r.fg + '@' + r.op.toFixed(2) + '=' + r.ratio.toFixed(2)).join(' / ') + '）');
const appSrcForColor = readOrNull('shogi_v4.html') || '';
const newColors = Array.from(new Set(noteResults.map(r => r.fg))).filter(c => c && appSrcForColor.indexOf(c) === -1);
ok(newColors.length === 0,
   'A10b 注記の色はすべて既存値の流用（新色: ' + (newColors.join(',') || 'なし') + '）');
const noteFg = noteResults.length ? noteResults[0].fg : undefined;

// 導線リンクも同じ計算で見る（class 化したので CSS から取れる）。
const linkRule = (IDX.match(/\.onboard-link\s*\{([^}]*)\}/) || ['', ''])[1];
const linkFg = (linkRule.match(/color\s*:\s*(#[0-9a-fA-F]{3,6})/) || [])[1];
const linkBg = (linkRule.match(/background\s*:\s*(#[0-9a-fA-F]{3,6})/) || [])[1];
const linkOpacityRaw = (linkRule.match(/opacity\s*:\s*([^;}]+)/) || ['', ''])[1].trim();
const linkOpacity = linkOpacityRaw === '' ? 1 : Number(linkOpacityRaw);
const linkRatio = (linkFg && linkBg && isFinite(linkOpacity))
  ? contrastRgb(composite(linkFg, linkBg, linkOpacity), hex2rgb(linkBg)) : 0;
ok(linkRatio >= 4.5,
   'A11 ★実測: 導線リンクのコントラスト比が WCAG AA 以上' +
   '（前景 ' + linkFg + ' / 背景 ' + linkBg + ' = ' + linkRatio.toFixed(2) + ':1）');

// ★ Codex P2 (r3796685745): STYLE-GUIDE §1「色の指定は class で行う（インライン style での
//   新規色指定は禁止）」・§2.2-4「インライン style は position/margin 等のみ」。
//   本スライスが足した2要素に色・枠・フォントのインライン指定が無いこと。
const onboardTag = (IDX.match(/<a[^>]*class="onboard-link"[^>]*>/) || [''])[0];
const scopeTags = IDX.match(/<p[^>]*class="scope-note"[^>]*>/g) || [];
const inlineOffenders = [onboardTag].concat(scopeTags)
  .filter(t => /style="[^"]*(color|background|border|font|opacity)/.test(t));
ok(inlineOffenders.length === 0,
   'A12 本スライスが足した要素にインラインの色/枠/フォント/opacity 指定が無い（STYLE-GUIDE §1・§2.2-4）' +
   '（違反: ' + inlineOffenders.join(' / ') + '）');
ok(/\.onboard-link\s*\{/.test(IDX) && /\.scope-note\s*\{/.test(IDX),
   'A13 .onboard-link / .scope-note が class として定義されている');

// ★ Codex P2 (r3799468521): 注記内のインラインリンクは実効高 約22px で STYLE-GUIDE §10.3（44×44px・
//   現在は例外なし）に違反していた。直下がその「はじめての方へ」カードなのでリンクは冗長 → 文言だけにした。
//   タップ標的になりうる要素を .scope-note の中に置かないことを pin する（実寸は実ブラウザ側で測る）。
// ★ Codex P2 (r3799706708): a / button だけでは input・select・textarea・summary・
//   tabindex/role 付き要素を見逃す。注記内の**対話要素を全部**列挙する。
const INTERACTIVE = /<(a\b|button\b|input\b|select\b|textarea\b|summary\b|details\b|label\b)|(<[a-z]+[^>]*\s(?:tabindex|role|onclick)\s*=)/i;
const scopeTappable = (IDX.match(/<p[^>]*class="scope-note"[^>]*>[\s\S]*?<\/p>/g) || [])
  .filter(block => INTERACTIVE.test(block));
ok(scopeTappable.length === 0,
   'A14 適用範囲の注記の中に対話要素（a/button/input/select/textarea/summary/tabindex/role）を置いていない（§10.3 の 44px を満たせないため）' +
   '（実測: ' + (scopeTappable.length ? scopeTappable[0].slice(0, 80) : 'なし') + '）');

// ---- B. 各項目 ⇔ コード事実 --------------------------------------------------
//
// ★★ このセクションの書き方は2回作り直している（経緯を残す。3回目をやらないため）:
//   第1版: `/function\s+resetAll\s*\(/` — **関数の存在**だけを見た。
//          → 反証パネルが検出: 項目1（#845/#864 で解決済）・項目5（#835 で解決済）を
//            PASS=36/FAIL=0 のまま素通しした。
//   第2版: `APP.indexOf('クラブ既定…は保持されます')` — **確認ダイアログの文字列**を見た。
//          → Codex が検出 (P1 r3796685716): `resetAll` を factoryClasses/factoryReport から
//            組み直す変異、`submitRound` に旧ガードを戻す変異を独立に当てても **PASS=61 のまま**。
//            文字列やコメント中の識別子は、振る舞いを変えても残るから。
//   第3版（現在）: 次の3つを併用する。
//          (1) **関数を切り出して実際に呼ぶ**（fixture を与えて戻り値を検査）
//          (2) **関数本体の制御フロー**を見る（`resetAll` の state 構築が profile 由来か等）
//          (3) 集合を丸ごと固定する（app/ が使う RPC 名の集合など。1本足されたら赤）
//
// ★★ 第4版（2026-08-18・Codex P1 r3799347837）:
//   第3版の「制御フロー検査」も破られた。**期待する式を resetAll に残したまま、直後に別関数から
//   factory 値で state を上書きする**変異で PASS=83/FAIL=0 だった。ソースの形を見ている限り、
//   形を保ったまま振る舞いを足せる。→ **本番の coordinator を fixture 上で実行して結果を見る**。
//   test/lib/app_harness.js（既存・test_reset_menu.js 等が使用）でアプリ全体を評価し、
//   resetAll() / submitRound() を**実際に呼んで** state を検査する。
//   ⚠ fixture は本番の受理条件を満たすこと。clubProfile は `schema_version:1` が無いと
//     sanitizeClubProfileObject が null を返し、factory にフォールバックする（実際に一度踏んだ）。
let loadApp = null;
try { loadApp = require('./lib/app_harness').loadApp; } catch (e) { loadApp = null; }

function bootApp(clubProfile) {
  const app = loadApp(path.join(root, 'shogi_v4.html'));
  const ctx = app.ctx;
  if (clubProfile) ctx.localStorage.setItem('shogi_club_profile', JSON.stringify(clubProfile));
  // 画面描画は本筋でないので黙らせる（評価後 stub＝harness の作法）。
  //   ★ Codex P1 (r3799468516): **save() は stub しない**。本番の submitRound は必ず save() を通るので、
  //     stub すると「save() が state を壊す」変異を検出できない（実際にその変異で緑のままだった）。
  //     save() は localStorage へ書くだけなので harness の mock でそのまま走る。
  ['render', 'renderAll', 'saveBranchMaster', 'renderPairings', 'renderStandings']
    .forEach(n => { if (typeof ctx[n] === 'function') app.stub(n, function () {}); });
  app.stub('appConfirm', function (msg, cb) { cb(true); });   // 破壊操作の確認は「はい」
  return app;
}

// 関数を1本だけ切り出す（brace matching）。DOM を要求しない純粋関数にだけ使う。
function extractFn(src, name) {
  const head = 'function ' + name + '(';
  const at = src.indexOf(head);
  if (at < 0) return null;
  let i = src.indexOf('{', at), depth = 0;
  for (let k = i; k < src.length; k++) {
    if (src[k] === '{') depth++;
    else if (src[k] === '}') { depth--; if (depth === 0) return src.slice(at, k + 1); }
  }
  return null;
}
function extractVar(src, name) {
  const m = src.match(new RegExp('var\\s+' + name + '\\s*=\\s*[^;]+;'));
  return m ? m[0] : null;
}

// --- B1 クラブ既定（#845/#864 CLUB-PROFILE-001/002）＝「今できること」側 -------

ok(/クラブの既定/.test(CAN) && /💾 この設定をクラブの既定として保存/.test(CAN),
   'B1a 「今できること」にクラブ既定の保存が書かれている');
ok(!/沼津支部の値に戻ります/.test(CANT),
   'B1b 「今できないこと」に旧記述「沼津支部の値に戻ります」が残っていない');

// (1) 実際に呼ぶ: 保存済み profile があるとき、生成系が **factory ではなく profile** を返すこと。
const profSrc = ['factoryReport', 'factoryClasses', 'profileReport', 'profileClasses', 'profileRounds']
  .map(n => extractFn(APP, n));
const profVars = ['FACTORY_ROUNDS', 'CLUB_PROFILE_REPORT_KEYS'].map(n => extractVar(APP, n));
ok(profSrc.every(Boolean) && profVars.every(Boolean),
   'B1c クラブ既定の生成系5関数と定数2本を切り出せる' +
   '（欠けたら名前が変わった＝index.html の記述を見直すこと）');

let profBehavior = null;
if (profSrc.every(Boolean) && profVars.every(Boolean)) {
  try {
    const vm = require('vm');
    const sandbox = {};
    vm.createContext(sandbox);
    vm.runInContext(profVars.join('\n') + '\n' + profSrc.join('\n') + '\n' +
      'var clubProfile=null;' +
      'function run(p){clubProfile=p;return {rep:profileReport(),cls:profileClasses(),rnd:profileRounds()};}',
      sandbox);
    const saved = {
      report: { title: '架空クラブ月例戦', organizer: '架空将棋クラブ', place: '架空市民会館', prize: 3000 },
      classes: [{ id: 'A', name: '上級' }, { id: 'B', name: '初級' }, { id: 'C', name: '入門' }],
      rounds: 6,
    };
    profBehavior = { withProfile: sandbox.run(saved), withoutProfile: sandbox.run(null) };
  } catch (e) { profBehavior = { err: String(e) }; }
}

ok(profBehavior && !profBehavior.err &&
   profBehavior.withProfile.rep.title === '架空クラブ月例戦' &&
   profBehavior.withProfile.rep.organizer === '架空将棋クラブ' &&
   profBehavior.withProfile.rep.place === '架空市民会館' &&
   profBehavior.withProfile.rep.prize === 3000,
   'B1d ★振る舞い: 保存済み profile があると大会名・主催者・会場・賞金額が **その値** で返る' +
   '（実測: ' + (profBehavior && !profBehavior.err
     ? JSON.stringify({ t: profBehavior.withProfile.rep.title, o: profBehavior.withProfile.rep.organizer })
     : (profBehavior && profBehavior.err)) + '）');

ok(profBehavior && !profBehavior.err &&
   profBehavior.withProfile.cls.length === 3 &&
   profBehavior.withProfile.cls.map(c => c.id).join(',') === 'A,B,C' &&
   profBehavior.withProfile.rnd === 6,
   'B1e ★振る舞い: クラス構成（3クラス）と回戦数（6）も profile の値で返る＝**A・B へ戻らない**');

ok(profBehavior && !profBehavior.err &&
   profBehavior.withoutProfile.rep.title === '沼津支部月例将棋大会' &&
   profBehavior.withoutProfile.cls.map(c => c.id).join(',') === 'A,B',
   'B1f ★振る舞い: profile 未保存の端末は従来どおり沼津 factory（＝サイトの但し書きが要る側）');

// (2) ★本番の coordinator を実行する: resetAll() を**実際に呼んで**、残った state を見る。
//     Codex の変異「期待する式は残したまま別関数から factory で state を上書き」は、
//     最終状態を見るここで赤くなる（式の有無ではなく結果を見ているため）。
ok(loadApp !== null, 'B1g test/lib/app_harness.js を読み込める');

const savedProfile = {
  schema_version: 1,                                   // ← 本番の受理条件（無いと factory へ落ちる）
  report: { title: '架空クラブ月例戦', organizer: '架空将棋クラブ', place: '架空市民会館', prize: 3000 },
  classes: [{ id: 'A', name: '上級' }, { id: 'B', name: '初級' }, { id: 'C', name: '入門' }],
  rounds: 6,
};
let afterReset = null, afterResetNoProfile = null;
if (loadApp) {
  try {
    const a = bootApp(savedProfile);
    a.ctx.resetAll();
    const st = a.ctx.state;
    afterReset = {
      title: st.report.title, organizer: st.report.organizer, place: st.report.place,
      prize: st.report.prize, classes: st.classes.map(c => c.id + ':' + c.name).join(','),
      rounds: st.rounds,
    };
  } catch (e) { afterReset = { err: String(e).slice(0, 200) }; }
  try {
    const b = bootApp(null);
    b.ctx.resetAll();
    const st = b.ctx.state;
    afterResetNoProfile = { title: st.report.title, classes: st.classes.map(c => c.id).join(',') };
  } catch (e) { afterResetNoProfile = { err: String(e).slice(0, 200) }; }
}

ok(afterReset && !afterReset.err &&
   afterReset.title === '架空クラブ月例戦' && afterReset.organizer === '架空将棋クラブ' &&
   afterReset.place === '架空市民会館' && afterReset.prize === 3000,
   'B1h ★実挙動: resetAll() を実行した**あと**の state.report が保存済みクラブ既定のまま' +
   '（実測: ' + JSON.stringify(afterReset) + '）');

ok(afterReset && !afterReset.err &&
   afterReset.classes === 'A:上級,B:初級,C:入門' && afterReset.rounds === 6,
   'B1i ★実挙動: resetAll() のあとも3クラス・6回戦のまま＝**A・Bへ戻らない**' +
   '（サイトの「翌月もそのまま残ります」の直接の裏付け）');

ok(afterResetNoProfile && !afterResetNoProfile.err &&
   afterResetNoProfile.title === '沼津支部月例将棋大会' && afterResetNoProfile.classes === 'A,B',
   'B1j ★実挙動: 既定未保存の端末は従来どおり沼津 factory・A/B へ戻る' +
   '（実測: ' + JSON.stringify(afterResetNoProfile) + '）');

// --- B2 参加費は変えられない ---------------------------------------------------

ok(/参加費の金額は変えられません/.test(CANT), 'B2a 項目「参加費の金額は変えられません」がある');

// (1) 実際に呼ぶ: getFee が固定額を返し、設定を参照していないこと。
const feeSrc = extractFn(APP, 'getFee');
ok(feeSrc !== null, 'B2b getFee を切り出せる');
let fee = null;
if (feeSrc) {
  try {
    const vm = require('vm');
    const sb = {}; vm.createContext(sb);
    // 実運用の呼び出し形（shogi_v4.html:1452 等）と同じく **文字列** を渡す。
    vm.runInContext(feeSrc + '\nvar out={mi:getFee("member","ippan"),oi:getFee("other","ippan"),' +
      'mc:getFee("member","chu"),oc:getFee("other","chu"),' +
      'mj:getFee("member","josei"),oj:getFee("other","josei")};', sb);
    fee = sb.out;
  } catch (e) { fee = { err: String(e) }; }
}
ok(fee && !fee.err && fee.mi === 500 && fee.oi === 1000 && fee.mc === 0 && fee.oc === 500 &&
   fee.mj === 0 && fee.oj === 500,
   'B2c ★振る舞い: getFee が沼津の固定額を返す（支部員500/一般1000・中学生以下と女性は0/500）' +
   '（実測: ' + JSON.stringify(fee) + '）');
ok(feeSrc !== null && !/clubProfile|profileReport|localStorage|state\./.test(feeSrc),
   'B2d ★制御フロー: getFee が設定・保存値を一切参照していない（参照し出したら記述を書き直すこと）');

const cprk = extractVar(APP, 'CLUB_PROFILE_REPORT_KEYS');
ok(cprk !== null && !/fee/i.test(cprk),
   'B2e ★制御フロー: クラブ既定の保存対象に参加費キーが無い（実測: ' + String(cprk).slice(0, 90) + '）');

// --- B3 クラウド系は現在この1クラブ専用（最重要）--------------------------------

ok(/現在この1クラブ専用/.test(CANT), 'B3a 項目3が「現在この1クラブ専用」と書いている');
ok(/アカウントを作る仕組みが、?\s*まだアプリにありません/.test(CANT),
   'B3b 項目3が「アカウントを作る仕組みがまだアプリにない」と書いている');
ok(/送信先クラブを一意に特定できません/.test(CANT), 'B3c 項目3が実挙動を引用している');
ok(APP.indexOf('送信先クラブを一意に特定できません') !== -1,
   'B3d そのメッセージが shogi_v4.html に実在する');

const AUTH = readOrNull('app/auth.js');
ok(AUTH !== null, 'B3e 根拠ファイル app/auth.js を読めること');
ok(AUTH !== null && /幹事登録がありません/.test(AUTH),
   'B3f app/auth.js に未登録メールの行き止まり文がある');

// (3) 集合ごと固定する。Codex 指摘 (P1 r3796685716):
//     「既存のメッセージと seed を残したまま RPC でクラブ作成経路を足す」と、
//     個別の文言ピンは全部通ってしまう。**app/ が呼ぶ RPC 名の集合そのもの**を固定すれば、
//     1本でも足された時点で赤くなる。
// ★ Codex P1 (r3799347837): 「変数で指定した provisioning RPC ＋ 新規 SECURITY DEFINER migration」
//   で回避された。よって (a) app/ 全ファイルを見る (b) **非リテラル引数の .rpc( を検出する**
//   (c) migration 側の SECURITY DEFINER 関数名の集合も固定する ―― の3点に広げる。
function listAppJs() {
  try {
    return fs.readdirSync(path.join(root, 'app'))
      .filter(f => /\.js$/.test(f)).sort()
      .map(f => ({ f: 'app/' + f, src: fs.readFileSync(path.join(root, 'app', f), 'utf8') }));
  } catch (e) { return null; }
}
const appJs = listAppJs();
ok(appJs !== null && appJs.length > 0, 'B3g app/ 配下の .js を列挙できる（実測: ' +
   (appJs ? appJs.map(x => x.f).join(',') : 'なし') + '）');

const rpcCalls = [], rpcDynamic = [];
(appJs || []).forEach(({ f, src }) => {
  const re = /\.rpc\(\s*([^)]*?)[,)]/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    const arg = m[1].trim();
    const lit = arg.match(/^['"]([A-Za-z0-9_]+)['"]$/);
    if (lit) rpcCalls.push(lit[1]);
    else rpcDynamic.push(f + ': ' + arg.slice(0, 40));      // ← 変数経由はここで捕まる
  }
});
ok(rpcDynamic.length === 0,
   'B3h ★app/ の .rpc( はすべて文字列リテラル（変数経由の provisioning を素通りさせない）' +
   '（実測: ' + (rpcDynamic.join(' / ') || 'なし') + '）');
const rpcSet = Array.from(new Set(rpcCalls)).sort();
ok(rpcSet.join(',') === 'app_hard_delete_members,claim_organizer_seat',
   'B3i ★集合のピン: app/ が呼ぶ RPC は既知の2本だけ' +
   '（1本でも足されたら赤＝項目3を書き直すこと。実測: ' + rpcSet.join(',') + '）');

// migration 側: SECURITY DEFINER 関数の集合を固定する（新規追加＝新しい特権経路）。
function listMigrations() {
  try {
    const d = path.join(root, 'supabase', 'migrations');
    return fs.readdirSync(d).filter(f => /\.sql$/.test(f)).sort()
      .map(f => ({ f: 'supabase/migrations/' + f, src: fs.readFileSync(path.join(d, f), 'utf8') }));
  } catch (e) { return null; }
}
const migs = listMigrations();
ok(migs !== null && migs.length > 0, 'B3j migration を列挙できる（実測 ' + (migs ? migs.length : 0) + '本）');
const secDef = [];
(migs || []).forEach(({ src }) => {
  const re = /create\s+(?:or\s+replace\s+)?function\s+([a-zA-Z0-9_.]+)([\s\S]*?)(?=create\s+(?:or\s+replace\s+)?function|$)/gi;
  let m;
  while ((m = re.exec(src)) !== null) {
    if (/security\s+definer/i.test(m[2])) secDef.push(m[1].replace(/^public\./, ''));
  }
});
const secDefSet = Array.from(new Set(secDef)).sort();
// 実測で確定した現在の集合（2026-08-18）。※ app_hard_delete_members は `security invoker` なので
//   ここには入らない（RPC 側の集合 B3i で見ている）。
const SEC_DEF_EXPECTED = ['app_is_active_member', 'app_is_active_organizer', 'app_is_admin',
  'app_live_operator_club', 'claim_organizer_seat', 'get_live_snapshot', 'live_slug_is_public',
  'prevent_last_admin_removal', 'publish_live_snapshot', 'start_live_session', 'stop_live_session',
  'tg_public_live_snapshot_broadcast'].join(',');
ok(secDefSet.join(',') === SEC_DEF_EXPECTED,
   'B3k ★集合のピン: SECURITY DEFINER 関数は既知の12本だけ' +
   '（provisioning 用が足されたら赤。実測: ' + secDefSet.join(',') + '）');

// ★ Codex P1 (r3799468505): 「最初の RLS migration だけ読む」「.insert() だけ見る」では、
//   後続 migration の `create policy ... on public.clubs for insert` ＋ `from('clubs').upsert(...)`
//   の組で素通りした。→ (a) **全** migration の clubs 向け書込ポリシー (b) **行を作りうる全 API** を走査。

// (a) 全 migration を走査。clubs に対する insert / all / update の policy を集める。
const clubsWritePolicies = [];
(migs || []).forEach(({ f, src }) => {
  const re = /create\s+policy\s+([^\s]+)[\s\S]{0,400}?on\s+(?:public\.)?clubs\b([\s\S]{0,200}?)(?:;|$)/gi;
  let m;
  while ((m = re.exec(src)) !== null) {
    const forClause = (m[2].match(/for\s+(insert|update|delete|all|select)/i) || [])[1] || 'select';
    if (/^(insert|update|delete|all)$/i.test(forClause)) {
      clubsWritePolicies.push(f + ': ' + m[1] + ' for ' + forClause.toLowerCase());
    }
  }
});
// 既知の書込ポリシーは「update（管理者による改名）」1本だけ。insert/delete/all が生えたら赤。
const clubsCreatePolicies = clubsWritePolicies.filter(x => !/ for update$/.test(x));
ok(clubsCreatePolicies.length === 0,
   'B3l ★全 migration 走査: clubs に insert/delete/all の policy が無い' +
   '（生えたら他クラブ作成が可能になる＝項目3を書き直すこと。実測 書込ポリシー: ' +
   (clubsWritePolicies.join(' / ') || 'なし') + '）');

// (b) 行を作りうるクライアント API を全部見る。insert だけでなく upsert も（PostgREST は upsert で行を作る）。
const clubsRowWrites = [];
(appJs || []).concat(APP ? [{ f: 'shogi_v4.html', src: APP }] : []).forEach(({ f, src }) => {
  const re = /from\(\s*['"]clubs['"]\s*\)([\s\S]{0,200})/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    const w = (m[1].match(/\.(insert|upsert|update|delete)\(/) || [])[1];
    if (w) clubsRowWrites.push(f + ': .' + w + '()');
  }
  if (/insert\s+into\s+(public\.)?clubs/i.test(src)) clubsRowWrites.push(f + ': insert into clubs');
});
(migs || []).forEach(({ f, src }) => {
  if (/insert\s+into\s+(public\.)?clubs/i.test(src)) clubsRowWrites.push(f + ': insert into clubs');
});
ok(clubsRowWrites.length === 0,
   'B3m ★全走査: clubs へ行を作る呼び出しが app/ にも shogi_v4.html にも migration にも無い' +
   '（insert / upsert / update / delete のいずれも。実測: ' + (clubsRowWrites.join(' / ') || 'なし') + '）');

const SEED = readOrNull('supabase/seed.example.sql');
ok(SEED !== null && /insert\s+into\s+(public\.)?clubs/i.test(SEED),
   'B3n clubs 行は seed の直接 SQL でしか作られない（＝運用者の手作業）');

ok(/スマホ星取表/.test(CANT) && /同じ端末の別タブ/.test(CANT) && /インターネット不要/.test(CANT),
   'B3q 但し書きが「同じ端末の別タブ」と明記している');
ok(/mobile-standings/.test(APP), 'B3r mobile-standings 経路が実在する');

// --- ★ B3n Codex P1 (r3796685734): 後半セクションとの整合 -----------------------
//   「当日の流れ」「注意事項」はクラウド/ライブを但し書きなしで案内していた＝新しい読者を
//   失敗する操作へ誘導していた。適用範囲の注記が**それらより前に**あることを要求する。
const iFlow = IDX.indexOf('当日の流れ');
const iCaution = IDX.indexOf('注意事項');
const scopeNotes = [];
let sIdx = -1;
while ((sIdx = IDX.indexOf('沼津支部のアカウント', sIdx + 1)) !== -1) scopeNotes.push(sIdx);
const iSwiss = IDX.indexOf('スイス式トーナメントのルール');   // ※「スイス式」単体は導入カード本文にも出る
ok(iFlow > 0 && iSwiss > iFlow && scopeNotes.some(n => n > iFlow && n < iSwiss),
   'B3s ★「当日の流れ」の中に、クラウド/ライブの適用範囲を断る注記がある');
ok(iCaution > 0 && scopeNotes.some(n => n > iCaution),
   'B3t ★「注意事項」の中に、クラウド/ライブの適用範囲を断る注記がある');
ok(scopeNotes.some(n => n < iFlow),
   'B3u ★機能バッジ（☁/📡）の直後にも適用範囲の注記がある');

// --- B4 「沼津支部」の表示が残る＋会員区分の語彙も固定 ---------------------------

ok(/画面の一部に「沼津支部」の表示が残ります/.test(CANT), 'B4a 項目4がある');
ok(/支部員／支部員以外/.test(CANT), 'B4b 会員区分の語彙固定にも触れている');
const kindSrc = extractFn(APP, 'memberKindLabelJa');
ok(kindSrc !== null && /沼津支部員/.test(kindSrc),
   'B4c ★制御フロー: memberKindLabelJa が「沼津支部員」を返す（改名 UI が入ったら記述を見直す）');

// --- B5 クラブ既定は端末ごと ---------------------------------------------------

ok(/この端末のブラウザの中だけ/.test(CANT), 'B5a 「クラブ既定は端末ごと」の項目がある');
const keySrc = extractVar(APP, 'CLUB_PROFILE_KEY');
ok(keySrc !== null && /localStorage|shogi_club_profile/.test(keySrc + APP.slice(APP.indexOf('function readClubProfileRaw'), APP.indexOf('function readClubProfileRaw') + 600)),
   'B5b ★制御フロー: クラブ既定の保存先が localStorage（端末ローカル）');

// --- B6 A・Bクラスは削除できない -----------------------------------------------

ok(/A・Bクラスは削除できません/.test(CANT), 'B6a 項目がある');
const delSrc = extractFn(APP, 'canDeleteClass');
ok(delSrc !== null, 'B6b canDeleteClass を切り出せる');
let del = null;
if (delSrc) {
  try {
    const vm = require('vm');
    const sb = {}; vm.createContext(sb);
    vm.runInContext(delSrc +
      '\nfunction isClassStarted(){return false;}function classHasPlayers(){return false;}' +
      '\nvar out={A:canDeleteClass("A"),B:canDeleteClass("B"),C:canDeleteClass("C")};', sb);
    del = sb.out;
  } catch (e) { del = { err: String(e) }; }
}
ok(del && !del.err && del.A.ok === false && del.A.reason === 'builtin' &&
   del.B.ok === false && del.B.reason === 'builtin' && del.C.ok === true,
   'B6c ★振る舞い: 空・未開始でも A/B は削除不可（reason=builtin）・C は可' +
   '（実測: ' + JSON.stringify(del) + '）');

// --- B7 空欄にすると既定が復活（空欄可は3キーだけ）------------------------------

ok(/空欄のままにすると、沼津支部の既定値が入ります/.test(CANT), 'B7a 項目がある');
const emptySrc = extractFn(APP, 'isClubProfileEmptyable');
const emptyVar = extractVar(APP, 'CLUB_PROFILE_EMPTYABLE_KEYS');
let emptyable = null;
if (emptySrc && emptyVar) {
  try {
    const vm = require('vm');
    const sb = {}; vm.createContext(sb);
    vm.runInContext(emptyVar + '\n' + emptySrc +
      '\nvar out={fax:isClubProfileEmptyable("fax"),office:isClubProfileEmptyable("officeName"),' +
      'acc:isClubProfileEmptyable("accountingNote"),title:isClubProfileEmptyable("title"),' +
      'place:isClubProfileEmptyable("place"),organizer:isClubProfileEmptyable("organizer"),' +
      'prize:isClubProfileEmptyable("prize"),n:CLUB_PROFILE_EMPTYABLE_KEYS.length};', sb);
    emptyable = sb.out;
  } catch (e) { emptyable = { err: String(e) }; }
}
ok(emptyable && !emptyable.err && emptyable.n === 3 &&
   emptyable.fax && emptyable.office && emptyable.acc &&
   !emptyable.title && !emptyable.place && !emptyable.organizer && !emptyable.prize,
   'B7b ★振る舞い: 空欄可は fax / officeName / accountingNote の3つだけ。' +
   '大会名・会場・主催者・賞金額は空欄不可＝既定が入る（実測: ' + JSON.stringify(emptyable) + '）');

// --- B8 奇数クラス＝「今できること」側（#835 FIRSTROUND-ODD-001）----------------

ok(/人数が奇数のクラスも、そのまま始められます/.test(CAN),
   'B8a 「今できること」に奇数クラスが書かれている');
ok(!/1回戦を確定できなくなります/.test(CANT),
   'B8b 「今できないこと」に旧記述が残っていない');

// ★本番の coordinator を実行する: 奇数3名・1回戦・部分開始で1卓（1名未割当）の状態から
//   submitRound() を**実際に呼んで**、回戦が確定する（results に1件積まれる）ことを見る。
//   Codex の変異「submitRound から別関数を呼んで未割当者を拒否する」は、ここで赤くなる。
let oddSubmit = null;
if (loadApp) {
  try {
    const a = bootApp(null);
    const ctx = a.ctx;
    const alerts = [];
    ctx.alert = function (m) { alerts.push(String(m)); };
    ctx.state.classes = [{ id: 'A', name: 'Aクラス', started: true }, { id: 'B', name: 'Bクラス', started: false }];
    ctx.state.players = { A: [{ id: 'p1', name: '架空太郎' }, { id: 'p2', name: '架空次郎' }, { id: 'p3', name: '架空三郎' }], B: [] };
    ctx.state.pairings = { A: [{ p1: 'p1', p2: 'p2', winner: 'p1', lastModifiedBy: null }], B: [] };   // 1卓のみ＝p3 は待機
    ctx.state.results = { A: [], B: [] };
    ctx.state.started = true;
    ctx.submitRound('A');
    // ★メモリ上の state と、save() が localStorage へ書いた state の**両方**を見る。
    let persisted = null;
    try {
      const key = ctx.STORAGE_KEY;
      const raw = ctx.localStorage.getItem(key);
      persisted = raw ? JSON.parse(raw) : null;
    } catch (e) { persisted = null; }
    oddSubmit = {
      rounds: ctx.state.results.A.length,
      alerts: alerts,
      persistedRounds: (persisted && persisted.results && persisted.results.A) ? persisted.results.A.length : -1,
    };
  } catch (e) { oddSubmit = { err: String(e).slice(0, 200) }; }
}
ok(oddSubmit && !oddSubmit.err && oddSubmit.rounds === 1 && oddSubmit.alerts.length === 0 &&
   oddSubmit.persistedRounds === 1,
   'B8c ★実挙動: 奇数3名・未割当1名のまま submitRound() が1回戦を確定し、' +
   '**save() 実行後の永続化状態にも残る**（警告も出ない）' +
   '（サイトの「奇数のクラスもそのまま始められます」の直接の裏付け・実測: ' +
   JSON.stringify(oddSubmit) + '）');

// #272 の保護（参加者がいるのに0卓＝退行的な空回戦）は残っていること。ここが消えると別の壊れ方をする。
let emptyGuard = null;
if (loadApp) {
  try {
    const a = bootApp(null);
    const ctx = a.ctx;
    const alerts = [];
    ctx.alert = function (m) { alerts.push(String(m)); };
    ctx.state.classes = [{ id: 'A', name: 'Aクラス', started: true }, { id: 'B', name: 'Bクラス', started: false }];
    ctx.state.players = { A: [{ id: 'p1', name: '架空太郎' }], B: [] };
    ctx.state.pairings = { A: [], B: [] };                                   // 0卓
    ctx.state.results = { A: [], B: [] };
    ctx.state.started = true;
    ctx.submitRound('A');
    emptyGuard = { rounds: ctx.state.results.A.length, alerts: alerts.length };
  } catch (e) { emptyGuard = { err: String(e).slice(0, 200) }; }
}
ok(emptyGuard && !emptyGuard.err && emptyGuard.rounds === 0 && emptyGuard.alerts === 1,
   'B8d ★実挙動: 参加者がいるのに0卓のときは確定せず警告（#272 の保護が健在）' +
   '（実測: ' + JSON.stringify(emptyGuard) + '）');

// ★ Codex P1 (r3799706701): 「待機者は次の回戦で戻ります」を検査していなかった（配列長だけ見ていた）。
//   1回戦で未割当だった p3 が、**次の回戦の組み合わせに実際に入る**ことを、メモリと永続化の両方で見る。
let leftoverBack = null;
if (loadApp) {
  try {
    const a = bootApp(null);
    const ctx = a.ctx;
    const alerts = [];
    ctx.alert = function (m) { alerts.push(String(m)); };
    ctx.state.classes = [{ id: 'A', name: 'Aクラス', started: true }, { id: 'B', name: 'Bクラス', started: false }];
    ctx.state.players = { A: [{ id: 'p1', name: '架空太郎' }, { id: 'p2', name: '架空次郎' }, { id: 'p3', name: '架空三郎' }], B: [] };
    ctx.state.pairings = { A: [{ p1: 'p1', p2: 'p2', winner: 'p1', lastModifiedBy: null }], B: [] };
    ctx.state.results = { A: [], B: [] };
    ctx.state.started = true;
    ctx.submitRound('A');                 // 1回戦確定（p3 は待機）
    ctx.generatePairing('A');             // 2回戦の組み合わせを生成
    const ids = (ctx.state.pairings.A || []).reduce((acc, m) => acc.concat([m.p1, m.p2]), []);
    let persistedIds = [];
    try {
      const raw = ctx.localStorage.getItem(ctx.STORAGE_KEY);
      const st = raw ? JSON.parse(raw) : null;
      persistedIds = ((st && st.pairings && st.pairings.A) || [])
        .reduce((acc, m) => acc.concat([m.p1, m.p2]), []);
    } catch (e) { persistedIds = []; }
    leftoverBack = {
      inMemory: ids.indexOf('p3') !== -1,
      inPersisted: persistedIds.indexOf('p3') !== -1,
      tables: (ctx.state.pairings.A || []).length,
      ids: ids.join(','),
      persisted: persistedIds.join(','),
    };
  } catch (e) { leftoverBack = { err: String(e).slice(0, 200) }; }
}
ok(leftoverBack && !leftoverBack.err && leftoverBack.inMemory === true,
   'B8f ★実挙動: 1回戦で待機だった p3 が **次の回戦の組み合わせに入る**' +
   '（サイトの「次の回戦で戻ります」の直接の裏付け・実測: ' +
   (leftoverBack && !leftoverBack.err ? leftoverBack.ids : (leftoverBack && leftoverBack.err)) + '）');
ok(leftoverBack && !leftoverBack.err && leftoverBack.inPersisted === true,
   'B8g ★実挙動: 次の回戦の組み合わせは **永続化された state にも** p3 を含む' +
   '（実測: ' + (leftoverBack && !leftoverBack.err ? leftoverBack.persisted : 'n/a') + '）');

ok(/部分開始/.test(APP), 'B8h 「部分開始」が実在する');

// --- B9 回戦数は 3〜7 ----------------------------------------------------------

ok(/3〜7/.test(CAN), 'B9a 「今できること」が回戦数の範囲 3〜7 を書いている');
ok(/var\s+nums\s*=\s*\[3,\s*4,\s*5,\s*6,\s*7\]/.test(APP),
   'B9b ★制御フロー: 回戦数の選択肢が [3,4,5,6,7]');

// --- B10 📥 まとめて登録は会員名簿に書かない ------------------------------------

ok(/「📥 まとめて登録」だけでは会員名簿には入りません/.test(IDX),
   'B10a 📥 だけでは名簿に入らないと明記している');
ok(/📋 参加者を名簿に反映/.test(IDX), 'B10b 名簿へ入れる正しい経路を案内している');
ok(APP.indexOf('ここで登録した参加者は名簿（会員名簿）には登録されません。') !== -1,
   'B10c アプリ側も「名簿には登録されません」と言っている');
ok(APP.indexOf('📋 参加者を名簿に反映') !== -1, 'B10d 反映ボタンが実在する');

// --- B11 オフライン利用には初回のオンライン起動が要る（Codex P1 r3796685708）-----

ok(/初回だけは、大会前に一度オンラインで開いて/.test(CAN),
   'B11a 「インターネットが無い会場でも動きます」に初回オンラインの前提が添えてある');
// ★ Codex P1 (r3799706714): sw.js の install は c.add() の失敗を握り潰して正常完了するので、
//   「10秒待つ」だけでは shogi_v4.html が未キャッシュのまま成功したように見える。
//   → **機内モードでの起動確認**まで案内していることを要求する。
ok(/機内モード/.test(CAN) && /確か/.test(CAN),
   'B11a2 オフラインの案内に「機内モードで一度開いて確かめる」まで書いてある');
const SW_FOR_FAILSOFT = readOrNull('sw.js') || '';
ok(/c\.add\(u\)\.catch\(/.test(SW_FOR_FAILSOFT.replace(/\s+/g, '')) ||
   /add\([^)]*\)\.catch\(/.test(SW_FOR_FAILSOFT),
   'B11a3 ★根拠: sw.js の precache は個別失敗を握り潰す（fail-soft）＝成功表示を信用できない' +
   '（この fail-soft が無くなったら機内モード確認の案内を見直してよい）');
const SW = readOrNull('sw.js');
ok(SW !== null && /addEventListener\(\s*['"]install['"]/.test(SW) && /PRECACHE/.test(SW),
   'B11b ★制御フロー: sw.js は install 時にだけ資産を precache する' +
   '（＝一度オンラインで開かないとオフラインで起動できない）');
const GUIDE = readOrNull('docs/install_guide.html');
ok(GUIDE !== null && /一度インターネットにつないだ状態で/.test(GUIDE),
   'B11c インストールガイドも同じ前提を書いている（案内先として整合）');

// ---- C. 作者決定: 問い合わせ窓口は設けない -----------------------------------

const mails = IDX.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g) || [];
ok(mails.length === 0,
   'C1 index.html にメールアドレスを載せていない（作者決定 2026-08-09・収集ロボット対策）' +
   '（検出: ' + mails.join('・') + '）');
ok(!/ご相談ください/.test(IDX),
   'C2 「ご相談ください」で終わらせていない（窓口が無いため・作者決定 2026-08-17）');

// ---- D. 沼津固有の集約 --------------------------------------------------------

ok(/沼津支部 月例将棋大会について/.test(IDX), 'D1 沼津固有をまとめたカードの見出しがある');
ok(IDX.indexOf('id="for-other-clubs"') < IDX.indexOf('沼津支部 月例将棋大会について'),
   'D2 沼津固有カードは「はじめての方へ」より後ろにある');

// ---- E. 触っていないことのピン ------------------------------------------------

ok(/shogi_v4\.html\?v=\d+/.test(IDX), 'E1 アプリへの導線 shogi_v4.html?v=N が残っている');
['docs/install_guide.html', 'docs/manual_sp.html', 'docs/manual_print.html'].forEach(function (h, i) {
  ok(IDX.indexOf(h) !== -1, 'E2-' + (i + 1) + ' 既存の導線 ' + h + ' が残っている');
});

console.log('INDEX-ONBOARD-001: PASS=' + pass + ', FAIL=' + fail);
process.exit(fail === 0 ? 0 : 1);
