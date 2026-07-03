#!/usr/bin/env node
// APP-MEMBER-SEARCH-001 — app/ 名簿シートの検索（氏名・ふりがな・市町村 部分一致）＋編集行フラッシュ追跡。
//   観点:
//     N  normalizeSearchText: 小文字化 / カタカナ→ひらがな / 空白（半角・全角）除去 / null 安全。
//     M  memberMatchesSearch: 氏名・ふりがな・市町村の部分一致 / 空クエリは全一致 / null 会員 false。
//     B  buildMemberSheetHtml(第3引数 query): 検索 input 出力・value は esc・絞り込み行のみ・一致件数行・
//        クリアボタンの有無・0件メッセージ・クエリ無し時は従来サマリ維持。
//     R  RAW pin: msFlashRow（scrollIntoView＋フラッシュ）/ msCommitPatch の msFlashId / composition ガード / refocus。
//   実データ不使用（架空のみ）。supabase 不要（build は純関数）。shogi_v4.html は触らない。

const fs = require('fs');
const path = require('path');
const AUTH_JS = fs.readFileSync(path.join(__dirname, '..', 'app', 'auth.js'), 'utf8');

let pass = 0, fail = 0;
function ok(m){ pass++; if(process.env.VERBOSE) console.log('  ✓ '+m); }
function ng(m){ fail++; console.error('  ✗ '+m); }
function assert(c,m){ c?ok(m):ng(m); }

function loadAuth(){
  const win = { location:{ origin:'https://app.test', pathname:'/app/' } };
  new Function('window', AUTH_JS)(win);
  return win.ShogiAuth;
}
const A = loadAuth();

// ===================================================== N. normalizeSearchText
(function(){
  assert(typeof A.normalizeSearchText === 'function', 'N1 normalizeSearchText が公開されている');
  assert(A.normalizeSearchText('サトウ') === 'さとう', 'N2 カタカナ→ひらがな');
  assert(A.normalizeSearchText('ABC') === 'abc', 'N3 小文字化');
  assert(A.normalizeSearchText(' さ とう　') === 'さとう', 'N4 半角・全角空白の除去');
  assert(A.normalizeSearchText(null) === '' && A.normalizeSearchText(undefined) === '', 'N5 null/undefined は空文字');
  assert(A.normalizeSearchText('沼津市') === '沼津市', 'N6 漢字はそのまま');
})();

// ===================================================== M. memberMatchesSearch
(function(){
  var m = { member_id:'m_x1', name:'架空太郎', yomi:'かくうたろう', city:'沼津市' };
  assert(A.memberMatchesSearch(m, '') === true, 'M1 空クエリは全一致');
  assert(A.memberMatchesSearch(m, A.normalizeSearchText('架空')) === true, 'M2 氏名の部分一致');
  assert(A.memberMatchesSearch(m, A.normalizeSearchText('タロウ')) === true, 'M3 ふりがなはカナ/かな同一視');
  assert(A.memberMatchesSearch(m, A.normalizeSearchText('沼津')) === true, 'M4 市町村の部分一致');
  assert(A.memberMatchesSearch(m, A.normalizeSearchText('三島')) === false, 'M5 不一致は false');
  assert(A.memberMatchesSearch(null, 'x') === false, 'M6 null 会員は false');
  var noYomi = { member_id:'m_x2', name:'架空次郎', yomi:null, city:null };
  assert(A.memberMatchesSearch(noYomi, A.normalizeSearchText('次郎')) === true, 'M7 yomi/city null でも氏名一致');
})();

// ===================================================== B. buildMemberSheetHtml
(function(){
  var members = [
    { member_id:'m_a1', name:'架空太郎', yomi:'かくうたろう', city:'沼津市' },
    { member_id:'m_a2', name:'架空次郎', yomi:'かくうじろう', city:'三島市' },
    { member_id:'m_a3', name:'別姓花子', yomi:'べっせいはなこ', city:'長泉町' }
  ];
  var h0 = A.buildMemberSheetHtml(members, {});
  assert(h0.indexOf('id="msSearchInput"') >= 0, 'B1 クエリ無しでも検索 input を出力');
  assert(h0.indexOf('id="msSearchClear"') < 0, 'B2 クエリ無しではクリアボタンなし');
  assert(h0.indexOf('有効 3 名／全 3 名') >= 0, 'B3 クエリ無しは従来サマリ文言を維持');
  assert(h0.indexOf('m_a1') >= 0 && h0.indexOf('m_a2') >= 0 && h0.indexOf('m_a3') >= 0, 'B4 クエリ無しは全行出力');

  var h1 = A.buildMemberSheetHtml(members, {}, '架空');
  assert(h1.indexOf('m_a1') >= 0 && h1.indexOf('m_a2') >= 0, 'B5 氏名部分一致の2行が出る');
  assert(h1.indexOf('m_a3') < 0, 'B6 不一致行は出ない');
  assert(h1.indexOf('id="msSearchCount"') >= 0 && h1.indexOf('2名が一致') >= 0, 'B7 一致件数行');
  assert(h1.indexOf('id="msSearchClear"') >= 0, 'B8 クエリありでクリアボタン');
  assert(h1.indexOf('value="架空"') >= 0, 'B9 input value にクエリ保持');

  var h2 = A.buildMemberSheetHtml(members, {}, 'タロウ');
  assert(h2.indexOf('m_a1') >= 0 && h2.indexOf('m_a2') < 0, 'B10 ふりがなカナ検索で絞り込み');

  var h3 = A.buildMemberSheetHtml(members, {}, '存在しない人');
  assert(h3.indexOf('一致する会員がいません') >= 0, 'B11 0件メッセージ');
  assert(h3.indexOf('<tbody>') < 0, 'B12 0件ではテーブルを出さない');

  var h4 = A.buildMemberSheetHtml(members, { m_a3: true }, '架空');
  assert(h4.indexOf('1名 選択中') >= 0, 'B13 絞り込みで隠れた選択もツールバー件数に含む（暗黙解除しない）');

  var h5 = A.buildMemberSheetHtml(members, {}, '"><i>x</i>');
  assert(h5.indexOf('"><i>x</i>') < 0 && h5.indexOf('&quot;&gt;&lt;i&gt;') >= 0, 'B14 クエリは esc 経由（XSS 安全）');

  var h6 = A.buildMemberSheetHtml(members, {}, '架空 太郎');
  assert(h6.indexOf('m_a1') >= 0, 'B15 クエリ内の空白は無視して一致');
})();

// ===================================================== R. RAW pin（結線・フラッシュ）
(function(){
  assert(/function msFlashRow/.test(AUTH_JS), 'R1 msFlashRow が存在');
  assert(/msFlashRow[\s\S]{0,600}scrollIntoView/.test(AUTH_JS), 'R2 フラッシュはスクロール追従を含む');
  assert(/#fff3bf/.test(AUTH_JS), 'R3 フラッシュ色は当日アプリ MASTER-SHEET-003 と同色');
  assert(/msFlashId = id; reloadMembers\(\)/.test(AUTH_JS), 'R4 msCommitPatch 成功時にフラッシュ対象を記録');
  assert(/msSearchInput[\s\S]{0,800}compositionstart/.test(AUTH_JS), 'R5 検索 input に composition ガード');
  assert(/setSelectionRange/.test(AUTH_JS), 'R6 再描画後の refocus（カーソル末尾）');
  // APP-MEMBER-SHEET-UX-001: 第4引数 msShowDeleted が増えたため pin 更新（クエリ引き渡し自体は不変）。
  assert(/buildMemberSheetHtml\(membersForEdit, memberSheetSelected, msSearchQuery, msShowDeleted\)/.test(AUTH_JS), 'R7 描画にクエリを引き渡す');
  assert(/msSearchClear/.test(AUTH_JS) && /msSearchQuery = ''; renderMemberEditor\(\)/.test(AUTH_JS), 'R8 クリアで解除');
})();

console.log('APP-MEMBER-SEARCH-001: PASS='+pass+' FAIL='+fail);
process.exit(fail===0?0:1);
