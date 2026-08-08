#!/usr/bin/env node
// PHASE1-REACH-816E: 文字列リテラル内 U+2028 / U+2029 の終端退行スイープ（CI 常設）
//
//   #816 hotfix（#818 = 9d64a7e）で直した 001t 型の退行 —— JS 文字列リテラルの終端を
//   LineTerminator 4 種（LF / CR / LS / PS）で打ち切ってしまう —— の回帰検査。
//   走査そのものは `test/tools/reach_str_lt_sweep.js` の `sweep()` を **require して
//   再利用する**（child_process ではなく関数 require にした理由: ①走査ロジックの
//   二重実装をしない ②配置数・ヒット数を stdout の文言から拾い直さずに構造化された
//   値で受け取れる＝下の PLACE-1 のような pin を文言解析なしで書ける ③子プロセス起動
//   ぶんの時間を足さない）。tool 単体（既定 N=400・**全量ではなく 6.6% のサンプル**）
//   の使い方は不変。ヒット 0 の対象では tool の stdout も 816E 以前と byte 一致。
//
//   ── CI で走らせる量 ────────────────────────────────────────────────────
//   N=40 / 文字（LS・PS の 2 文字）＝ 80 配置。等間隔サンプル＝乱数なしで決定的
//   （＝同じ欠陥・同じ対象なら**どの機械でも同じヒット数**になる。機械差で数字は動かない）。
//   実行時間は cloud Linux / Node v22 で約 19 秒（緑の道）。
//   ヒット判定は「面分類の保存」と「analyze() が例外死しない」の OR（tool 側ヘッダ）。
//   注入で測った検出力: 素の 001t 型（終端 4 種化）で 80/80、面は保存されるが
//   analyze() が例外死する型で 18/80。**「必ず」ではない** —— ファイル後半だけを
//   壊す変種では 6/80 まで余裕が落ちる（赤にはなる）。
//   N を上げ下げするときは時間予算と見逃し確率の両方を数字で書くこと。
//
//   ── この 1 本が守る範囲 ────────────────────────────────────────────────
//   「JS 文字列リテラル内の LS / PS で**面レクサの終端が壊れる**」＋「同じ入力で
//   **走査が例外死する**」の 2 クラス。それ以上は守備範囲と主張しない。特に:
//   - **エスケープ復号（結線デコーダ）の到達性への影響**は判定に含めない。含めると
//     onclick 結線を持つ生きたリテラルへの挿入（＝正当な意味変化）と区別できず
//     偽赤になる（Codex 1巡目 P1・反例実測 2/80）。復号退行は兄弟の
//     `test_reachability_001.js` が別途 pin している。
//   - **テンプレートリテラル / HTML 属性値**の同型退行はサンプル対象外（0/80 緑）。
//     これらも兄弟テスト（`LT-TMPL-LS/PS`・`T[ATTR_VAL_ON]-13〜15`）が捕らえる。
//   ★ 未解決（#816 へ切り出し済み・この便では直していない）:
//     偽赤 —— 挿入点がエスケープの被エスケープ位置に落ちると正しいレクサでも赤が出る。
//     骨抜き —— 陽性対照が無いので `hit` を恒久 false にする改変が下の pin を素通りする。
//
//   ── 骨抜きを塞ぐ pin（#816 E 受け入れ基準3 ＋ Codex 1巡目 P2 対応）────────
//   (i)  TARGET 無視     … TARGET-1（sweep が読んだのは run_tests が渡したファイルか）
//                          ＋ TARGET-1b（**既定と異なる一時ファイル**でも sweep が引数へ
//                          追随するか。CI では TARGET が常に既定値と同じで TARGET-1 だけ
//                          では「既定へのハードコード」を落とせないため）
//   (ii) spans 縮退      … PLACE-1（面レクサが壊れて列挙 0 → 0/0 で緑、を落とす）
//   (iii) N 引き下げ     … PLACE-1 の下限は **リテラル 80**（N の値から導出しない）
//   (iv) 挿入文字の差替  … PLACE-2 は個数でなく **U+2028 / U+2029 の実文字**を pin する
//                          （CHARS を別の 2 文字に変えた骨抜きを落とす）
'use strict';
const fs = require('fs');
const path = require('path');
const { sweep, CHARS } = require(path.join(__dirname, 'tools', 'reach_str_lt_sweep.js'));

const TARGET = process.argv[2] || 'shogi_v4.html';
const SAMPLE_N = 40;                 // 1 文字あたりのサンプル配置数
const MIN_PLACEMENTS = 80;           // = 40 × 2 文字。N を下げても勝手に緩まないようリテラルで持つ

let pass = 0;
let fail = 0;
const ok = (cond, msg) => { if (cond) { pass++; } else { fail++; console.log('  FAIL: ' + msg); } };

const r = sweep(TARGET, SAMPLE_N);
const placements = r.chars.reduce((n, c) => n + c.placements, 0);

// --- 検査が実際に走ったことの表示（run_tests の TARGET と突き合わせられる） -------
console.log(`対象: ${r.target}（${r.srcLength.toLocaleString()} 文字 / JS 文字列リテラル ${r.spanCount.toLocaleString()} 個 / 基準の関数総数 ${r.baseCount}）`);
console.log(`実行配置数: ${placements}（${SAMPLE_N} × ${r.chars.length} 文字）`);
for (const c of r.chars) console.log(`  ${c.label}: ${c.hits}/${c.placements} 配置で走査が壊れた`);

// --- TARGET-1: 渡された TARGET を実際に読んで解析したか -------------------------
//   「既定の shogi_v4.html を見ているだけで引数を無視している」を落とす。
//   sweep の申告（r.target / r.srcLength）を、このファイルが独立に読んだ実体と照合する。
{
  let actualLength = -1;
  try { actualLength = fs.readFileSync(TARGET, 'utf8').length; } catch (e) { actualLength = -1; }
  ok(r.target === TARGET && actualLength >= 0 && r.srcLength === actualLength,
    `TARGET-1 sweep が解析したのは渡された TARGET そのもの（渡した: ${TARGET} / 解析: ${r.target} / 長さ ${r.srcLength} vs 実体 ${actualLength}）`);
}

// --- TARGET-1b: 既定と異なる一時ファイルでも sweep が引数へ追随するか -----------
//   CI では TARGET が常に既定値（shogi_v4.html）なので、TARGET-1 だけでは
//   「sweep() が引数を捨てて既定へハードコードする」退行と区別が付かない。
//   実体の異なる一時ファイルを渡し、申告（target / srcLength / spanCount）が
//   その実体と一致することを見る。
//   注意2点（どちらも反証パネル 2026-08-07 の指摘）:
//   - `mkdtempSync` / `writeFileSync` は **try の中**に置く。外に出すと
//     `os.tmpdir()` が書けない CI（読み取り専用・容量ゼロ）で raw stack trace の
//     まま落ち、**本命の HIT-0 が一度も評価されない**。
//   - 判定に `totalHits` を混ぜない。混ぜると 001t 退行が入ったときに、追随は
//     完璧なのに「TARGET を無視する退行も入った」と読める FAIL が出る（誤診）。
{
  const os = require('os');
  const probe = '<!DOCTYPE html>\n<html><body><script>\n'
    + "var p0 = 'probe literal zero';\n"
    + 'var p1 = "probe literal one";\n'
    + '</scr' + 'ipt></body></html>\n';
  let tmpDir = null;
  try {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'reach816e-'));
    const tmpFile = path.join(tmpDir, 'probe.html');
    fs.writeFileSync(tmpFile, probe);
    const r2 = sweep(tmpFile, 2);
    ok(r2.target === tmpFile && r2.srcLength === probe.length && r2.srcLength !== r.srcLength
      && r2.spanCount === 2,
      `TARGET-1b 非既定の一時ファイルへ sweep が追随（解析: ${r2.target} / 長さ ${r2.srcLength}`
      + ` vs 実体 ${probe.length} / リテラル ${r2.spanCount} vs 2）`);
  } catch (e) {
    ok(false, `TARGET-1b 一時ファイルを用意できず検査できなかった（TMPDIR=${require('os').tmpdir()} / ${e && e.message}）`);
  } finally {
    if (tmpDir) { try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (e) { /* 後始末の失敗で判定を変えない */ } }
  }
}

// --- PLACE-1: 実行配置数の下限（spans 縮退・N 引き下げ・文字の間引きを一括で落とす） ---
ok(placements >= MIN_PLACEMENTS,
  `PLACE-1 実行配置数 ${placements} < ${MIN_PLACEMENTS}（面レクサの退行で JS 文字列が列挙できていない／サンプル数が下げられている）`);

// --- PLACE-2: 挿入文字は U+2028 / U+2029 の実文字か -----------------------------
//   個数比較（=== 2）だけでは CHARS を別の 2 文字（極端には空文字）へ差し替えても
//   通ってしまう。モジュールの CHARS と、sweep が「実際に挿入した」と申告する
//   r.chars[].ch の両方を、実文字コードポイントで pin する。
{
  const LS = String.fromCharCode(0x2028); // 生文字もエスケープも置かない（転送・整形での不可視破損を防ぐ）
  const PS = String.fromCharCode(0x2029);
  const codes = (xs) => xs.map((c) => 'U+' + c.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0')).join(',');
  const moduleChars = CHARS.map((c) => c[1]);
  const usedChars = r.chars.map((c) => c.ch);
  ok(moduleChars.length === 2 && moduleChars[0] === LS && moduleChars[1] === PS
    && usedChars.length === 2 && usedChars[0] === LS && usedChars[1] === PS,
    `PLACE-2 挿入文字は実文字 U+2028 / U+2029 の 2 種（CHARS: ${codes(moduleChars)} / 実挿入: ${codes(usedChars)}）`);
}

// --- HIT-0: 誤検知 0（現行 lib ＋ 原本ならヒット 0） -----------------------------
ok(r.totalHits === 0,
  `HIT-0 文字列リテラルへ LS / PS を 1 文字入れただけで走査が壊れた配置が ${r.totalHits} 件ある`
  + `（001t 型の終端退行。詳細は node test/tools/reach_str_lt_sweep.js ${TARGET} 400）`);
if (r.totalHits > 0) {
  for (const c of r.chars) {
    if (!c.hits) continue;
    // 例外死は面オラクルとは別経路なので分けて出す。混ぜると「関数総数 580 → 580 /
    // 到達不能 0 本」だけが並んで、何も起きていないように読める（反証パネル指摘）。
    if (c.throws > 0) {
      console.log(`  ${c.label}: analyze() が例外死した配置 ${c.throws}/${c.placements}`
        + `（初出 L${c.firstThrow.line} 付近: ${c.firstThrow.message}）`);
    }
    if (c.faceHits > 0) {
      // 到達性の値は analyze() が成功した配置がある場合だけ出す。`worst` の初期値は
      // sentinel（baseCount / L0）なので、面は崩れたが全配置で analyze() も例外死した
      // ケースでこれを出すと測っていない値を実測のように書くことになる（Codex 2巡目 P2）。
      console.log(`  ${c.label}: 面分類が崩れた配置 ${c.faceHits}/${c.placements}`
        + (c.diagSamples > 0
          ? `／最悪の配置で関数総数 ${r.baseCount} → ${c.worst.count}（挿入行 L${c.worst.line} 付近）`
            + `／「到達不能」へ落ちた生きた関数 ${c.killed.length} 本`
            + (c.killed.length ? `（例: ${c.killed.slice(0, 8).join(', ')}）` : '')
          : '／到達性の診断は取れず（該当配置ではすべて analyze() が例外死）'));
    }
  }
}

console.log(`PHASE1-REACH-816E: PASS=${pass} FAIL=${fail} 対象=${r.target} 配置=${placements} ヒット=${r.totalHits}`);
process.exit(fail === 0 ? 0 : 1);
