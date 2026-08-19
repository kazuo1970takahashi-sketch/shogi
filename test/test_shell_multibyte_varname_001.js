#!/usr/bin/env node
// SHELL-MB-VARNAME-001 — `$var` の直後の全角文字（bash 3.2 で変数名に食われる）を機械で禁じる
// =============================================================================
// なぜ要るか（2026-08-19 実測）:
//   作者機（macOS 既定の **bash 3.2**）は UTF-8 ロケールで **高位バイトを変数名に取り込む**。
//   `say "検出 $_name（${_s2} bytes）"` は `_name` が代入済みでも `set -u` の下で
//   「`_name?`: 未割り当ての変数です」で落ちる。**cloud / CI の bash 5 では再現しない**＝
//   全量テストが緑のまま作者機だけが壊れる。`scripts/land.sh` 228 行で
//   **#909 便2 の bundle 受け渡しが実際に止まった**。
//   規約は test_bulk_inline_error_pins_887.sh のヘッダに書いてあったが、
//   **守らせる機械が無かった**ので再発した。これがその機械。
//
// =============================================================================
// ★ 設計: **シェルを解析しない。** 生の並びだけを見て、例外は行に明示させる。
// =============================================================================
//   初版は bash+awk+grep -P、2版目は Node の簡易トークナイザ（引用・ヒアドキュメントを追う）
//   だった。Codex が2巡で **10 件**の穴を出した: 多重ヒアドキュメント（`cat <<A <<B`）／
//   `$((1 << 2))` をヒアドキュメント開始と誤認／`<<E'OF'` のような混在引用の区切り語／
//   ヒアドキュメント本文の `\$`／`$(...)` の入れ子引用／`$'...'` の `\'`／
//   バックスラッシュ改行後の `#`／`x)# ...` の `#`。**どれも当たっている。**
//
//   そこで方針を変えた。**この検査に必要なのはシェルの意味論ではない。**
//     ・見逃し（false negative）＝作者機だけが壊れ、CI は緑。**気づけない**
//     ・過検出（false positive）＝赤くなって目に入る。**気づける**
//   非対称なので、**見逃しゼロを構造で保証する**側に倒す:
//
//     1. `$name` の直後が非 ASCII なら、**文脈を問わず**違反にする（解析なし＝壊れる余地なし）
//     2. 展開されない場所（単一引用符の中など）で本当に必要なら、その行の**行末に
//        `# mb-ok: <理由>`** を書いて明示的に免除する（人が1行ぶん責任を取る）
//     3. 免除した件数は**pin する**（増えたら赤・最終行にも載せる）
//
//   ★ ただし「解析しないから見逃しはゼロ」と最初に書いたのは**言い過ぎだった**。
//     3版目・4版目にも Codex が見逃しを見つけた（3巡目 P2×2・4巡目 P2×1）:
//       ・**バックスラッシュ改行**は行ごとに見るとどちらの行にも一致しない。
//         bash は引用解析の**前に**これを除去するので実質つながっている
//       ・免除マーカーを行内のどこでも認めると、**マーカーの説明を含むだけの行**が丸ごと免除される
//       ・かといって**単純に結合すると**、単一引用符の中のバックスラッシュ（継続としては働かない）
//         まで繋いでしまい、**後ろの行のマーカーが前の行の本物の違反を免除する**
//     → 物理行ごとの検査（免除はその行自身のマーカーのみ）と、継続境界をまたぐ形だけの
//        追加検査、の**2段構え**にした。詳しくは `scan` の直前のコメント。
//     見逃しゼロは「解析をやめれば自動的に手に入る」ものではなく、**入力の扱い方**と
//     **免除の厳密化**まで含めて初めて成り立つ。
//
// 使い方: node test/test_shell_multibyte_varname_001.js
// 終了コード: 0=違反なし / 1=違反あり
// 依存: node / git。network 不使用。外部コマンド（grep -P / awk / perl）に依存しない
//       ＝**作者機で「何も検査せず成功」になる分岐が存在しない**（Codex P2 r3810168495）。
// =============================================================================
'use strict';
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const REPO = path.resolve(__dirname, '..');
let pass = 0, fail = 0;
const ok = (m) => { pass++; if (process.env.VERBOSE) console.log('  ✓ ' + m); };
const ng = (m) => { fail++; console.error('  ✗ ' + m); };
const assert = (c, m) => (c ? ok(m) : ng(m));

// 変数名は [A-Za-z_][A-Za-z0-9_]* のみ。`$1（` `$@（` のような特殊パラメータは
// 名前が1文字で確定するため後続バイトを食わない＝この不具合の対象外。
const HAZARD = /\$[A-Za-z_][A-Za-z0-9_]*[^\x00-\x7F]/;
// 免除マーカー。★ Codex P2 (r3810651493): 行内のどこでもよい形にすると
//   `printf 'mb-ok: reason' "$V（"` のように**マーカーの説明や出力データを含むだけの行**が
//   丸ごと免除され、普通のメッセージを足すだけでゲートに見逃しを作れてしまう。
//   そこで「**行末の `#` コメントとして置かれた**マーカー」だけを免除にする。
//   ★ 残る限界（承知のうえ）: `echo "$V（ # mb-ok: x"` のように**二重引用符の中で
//     行末までその形を書く**と免除に化ける。これは偶然では起きず、意図的に書く必要がある。
//     ここを塞ぐにはシェルの引用解析が要り、それをやめたのがこの版の主旨なので受け入れる。
const EXEMPT = /\s#\s*mb-ok:\s*\S[^\n]*$/;

// ★ Codex P2 (r3810651486 / r3810831853): bash は**引用解析の前に**バックスラッシュ改行を
//   除去するので、行末の `\\` の先の行と実質つながる。行ごとに見ると
//   **どちらの行にも一致せず見逃す**。かといって単純に結合すると別の穴が開く（4巡目）:
//   単一引用符の中のバックスラッシュは**継続として働かない**のに結合してしまい、
//   **後ろの物理行にある免除マーカーが、前の物理行の本物の違反まで免除する**。
//
//   そこで **2段構え**にする。引用状態は相変わらず見ない:
//     ① **物理行ごと**に検査する。免除は**その物理行自身の行末マーカー**でしか効かない
//        → 別の行のマーカーが漏れてくることが原理的に起きない
//     ② **継続の境界をまたぐ形**だけを追加で検査する（結合してはじめて現れる hazard）。
//        免除は継続先の行末マーカー。3行以上の連鎖は累積して境界ごとに見る
//   ①だけでも②だけでも穴が残る。両方あって初めて塞がる。
function endsWithContinuation(line) {
  const m = /(\\+)$/.exec(line);
  return !!m && (m[1].length % 2 === 1);
}

function scan(src) {
  const phys = src.split('\n');
  const hits = [];
  let exempted = 0;

  // ① 物理行ごと（免除はその行自身のマーカーだけ）
  phys.forEach((line, i) => {
    if (!HAZARD.test(line)) return;
    if (EXEMPT.test(line)) { exempted++; return; }
    hits.push({ line: i + 1, text: line.trim() });
  });

  // ② 継続の境界をまたぐ形（結合してはじめて現れるものだけ）
  let acc = null, accStart = 0;
  for (let i = 0; i < phys.length; i++) {
    const cont = endsWithContinuation(phys[i]);
    if (acc === null) { acc = ''; accStart = i; }
    const piece = cont ? phys[i].slice(0, -1) : phys[i];
    const prev = acc;
    acc = prev + piece;
    if (prev !== '' && HAZARD.test(acc) && !HAZARD.test(prev) && !HAZARD.test(piece)) {
      if (EXEMPT.test(phys[i])) exempted++;
      else hits.push({ line: accStart + 1, text: acc.trim() });
    }
    if (!cont) acc = null;
  }
  return { hits: hits, exempted: exempted };
}

console.log('\n【SHELL-MB-VARNAME-001】$var の直後の全角文字（bash 3.2 で変数名に食われる）');

// ---- ① 追跡下の *.sh を全部走査 -------------------------------------------
let files = [];
try {
  files = execSync("git ls-files '*.sh'", { cwd: REPO, encoding: 'utf8' }).split('\n').filter(Boolean);
} catch (e) { files = []; }
if (files.length === 0) {
  console.error('  ✗ 検査対象の *.sh が 0 件（git 管理下で実行していない）＝緑と「何も検査していない」を区別できない');
  process.exit(1);
}
let viol = 0, exempted = 0;
const exemptLines = [];
for (const f of files) {
  const r = scan(fs.readFileSync(path.join(REPO, f), 'utf8'));
  for (const h of r.hits) { viol++; ng(f + ':' + h.line + ': ' + h.text.slice(0, 120)); }
  if (r.exempted) { exempted += r.exempted; exemptLines.push(f + ' ×' + r.exempted); }
}
if (viol === 0) ok('追跡下の *.sh ' + files.length + ' 本に違反なし（$var の直後は必ず ASCII か ${var}）');
// ★ 免除は黙って落とさない。件数と場所を出す。
console.log('  ・免除（# mb-ok: 付き）: ' + exempted + ' 行' + (exemptLines.length ? '  [' + exemptLines.join(' / ') + ']' : ''));
// ★ Codex P2 (r3810651500): run_tests.sh の run_suite は**成功時の出力を一時ログへ捨てて最終行だけ**
//   表示する。途中の console.log は自動発見経路のログに現れない＝「毎回表示する」が機能しない。
//   そこで (a) 件数そのものを **pin** し（増えたら赤）、(b) **最終行にも載せる**。
const EXPECT_EXEMPT = 1;   // 2026-08-19 時点で、この不具合を説明しているコメント 1 行だけ
assert(exempted === EXPECT_EXEMPT,
  '免除の件数が期待どおり（' + EXPECT_EXEMPT + ' 行）＝免除が静かに増えていない。意図した追加なら EXPECT_EXEMPT を更新すること  [実際 ' + exempted + ']');

// ---- ② 検出装置そのものへの自己検査（毎回その場で当てる） -------------------
const FW = '（';          // 全角の開き括弧
const V = '$' + 'V';       // このファイル自身に `$V（` の並びを書かない
const CASES = [
  ['二重引用符の中は違反',                         'V=1\necho "検出 ' + V + FW + 'bytes"', true],
  ['★単一引用符の中も違反にする（過検出は仕様）',   "V=1\nprintf '%s' '" + V + FW + "'", true],
  ['★コメントの中も違反にする（解析しない）',       '  # 説明: ' + V + FW + 'コメント', true],
  ['★ヒアドキュメント本文も違反にする',             'V=1\ncat <<EOF\n# ' + V + FW + '本文\nEOF', true],
  ['mb-ok: と理由があれば免除',                     "printf '%s' '" + V + FW + "'   # mb-ok: 展開されないリテラル", false],
  ['mb-ok: に理由が無ければ免除しない',             "printf '%s' '" + V + FW + "'   # mb-ok:", true],
  ['${var} と囲めば違反ではない',                   'V=1\necho "検出 ${V}' + FW + 'bytes"', false],
  ['$var の直後が ASCII なら違反ではない',           'V=1\necho "検出 ' + V + ' bytes"', false],
  ['特殊パラメータは対象外（$1 は1文字で確定）',      'echo "検出 $1' + FW + 'bytes"', false],
  ['★バックスラッシュ改行で分断されても違反',        'V=1\necho "検出 ' + V + '\\\n' + FW + 'bytes"', true],
  ['★マーカー文字列が行内にあるだけでは免除しない',  "V=1\nprintf 'mb-ok: reason' \"" + V + FW + '"', true],
  ['行末の # コメントに置いたマーカーなら免除',      'V=1\necho "' + V + FW + '"   # mb-ok: 展開されないリテラル', false],
  // ★ Codex P2 (r3810831853): 単一引用符の中の `\` は継続として働かないのに結合すると、
  //   後ろの行の免除マーカーが前の行の本物の違反まで免除してしまう。物理行ごとの検査で塞ぐ。
  ['★後ろの行のマーカーは前の行の違反を免除しない',
   'V=1\necho "' + V + FW + '"\nprintf \'a\\\n' + V + FW + "' # mb-ok: これはリテラル", true],
  ['★継続境界にできる違反は継続先のマーカーで免除できる',
   'V=1\necho "' + V + '\\\n' + FW + '"  # mb-ok: 継続の先で閉じるリテラル', false],
];
for (const [label, src, want] of CASES) {
  const got = scan(src).hits.length > 0;
  assert(got === want, '自己検査: ' + label + (got === want ? '' : '  [期待 ' + want + ' / 実際 ' + got + ']'));
}
// 免除の計上そのものも見る（黙って捨てていない証拠）。
const exr = scan("printf '%s' '" + V + FW + "'   # mb-ok: 理由");
assert(exr.hits.length === 0 && exr.exempted === 1, '自己検査: 免除した行は件数として数える（黙って落とさない）');
// ★ 実際に起きた形をそのまま1本（land.sh 228 行の再現）。
assert(scan('_name=x\nsay "検出 $_name' + FW + '${_s2} bytes' + '）"').hits.length === 1,
  '自己検査: land.sh 228 行の形（受け渡しを止めた実物）を検出できる');

// 最終行に免除件数まで載せる（run_tests.sh はこの行しか表示しない）。
console.log('\n  SHELL-MB-VARNAME-001: PASS=' + pass + ' FAIL=' + fail + ' 免除=' + exempted + '/' + EXPECT_EXEMPT);
process.exit(fail === 0 ? 0 : 1);
