#!/usr/bin/env node
// APP-MEMBER-SHEET-UX-001 — app/ 名簿シートの編集 UX 改善（作者FB 2026-07-03）。
//   (a) 区分セル（支部員/会費）のタップ循環を廃止 → セル内 select（選択肢が見える・同値選択/Escape/
//       外タップでキャンセル・▾ ヒント表示）。
//   (b) 削除済み行は既定非表示 → 「削除済みを表示（N名）」トグル（当日アプリ名簿タブと同型）。
//   観点:
//     D  builder: 4引数 showDeleted / 既定で削除済み非表示 / true で末尾表示 / トグルボタンと件数 /
//        削除済みゼロならトグル無し / 検索との複合 / 全員削除済み＋非表示の空メッセージ。
//     C  ▾ ヒント: 非削除行の kind/grade セルのみ / title は「タップで選択」。
//     R  RAW pin: 循環コードの撤去 / select エディタ（msEditKind/msEditGrade・選択肢）/ 同値キャンセル /
//        Escape キャンセル / トグル結線 / renderMemberEditor への showDeleted 引き渡し。
//   実データ不使用（架空のみ）。shogi_v4.html は触らない。

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

const MEMBERS = [
  { member_id:'m_l1', name:'架空太郎', yomi:'かくうたろう', city:'沼津市', deleted_at:null },
  { member_id:'m_l2', name:'架空次郎', yomi:'かくうじろう', city:'三島市', deleted_at:null },
  { member_id:'m_d1', name:'削除架空', yomi:'さくじょかくう', city:'長泉町', deleted_at:'2026-06-15T00:00:00Z' }
];

// ===================================================== D. 削除済み非表示＋トグル
(function(){
  var h0 = A.buildMemberSheetHtml(MEMBERS, {});
  assert(h0.indexOf('m_d1') < 0, 'D1 既定（showDeleted 省略）で削除済み行を出さない');
  assert(h0.indexOf('m_l1') >= 0 && h0.indexOf('m_l2') >= 0, 'D2 有効行は出る');
  assert(h0.indexOf('id="msShowDeletedBtn"') >= 0 && h0.indexOf('削除済みを表示（1名）') >= 0, 'D3 トグルボタン＋件数');
  assert(h0.indexOf('有効 2 名／全 3 名') >= 0, 'D4 サマリは全会員基準を維持');

  var h1 = A.buildMemberSheetHtml(MEMBERS, {}, '', true);
  assert(h1.indexOf('m_d1') >= 0 && h1.indexOf('ms-row-deleted') >= 0, 'D5 showDeleted=true で削除済み行を表示');
  assert(h1.indexOf('削除済みを隠す') >= 0, 'D6 表示中はトグルが「隠す」表記');
  assert(h1.indexOf('m_d1') > h1.indexOf('m_l2'), 'D7 削除済みは末尾');

  var h2 = A.buildMemberSheetHtml([MEMBERS[0], MEMBERS[1]], {});
  assert(h2.indexOf('msShowDeletedBtn') < 0, 'D8 削除済みゼロならトグルを出さない');

  var h3 = A.buildMemberSheetHtml(MEMBERS, {}, '削除');
  assert(h3.indexOf('m_d1') < 0 && h3.indexOf('一致する会員がいません') >= 0, 'D9 非表示中は検索にも掛からない');
  var h4 = A.buildMemberSheetHtml(MEMBERS, {}, '削除', true);
  assert(h4.indexOf('m_d1') >= 0, 'D10 表示中は検索対象になる');

  var h5 = A.buildMemberSheetHtml([MEMBERS[2]], {});
  assert(h5.indexOf('有効な会員がいません') >= 0 && h5.indexOf('<tbody>') < 0, 'D11 全員削除済み＋非表示は専用メッセージ');

  var h6 = A.buildMemberSheetHtml(MEMBERS, { m_d1: true });
  assert(h6.indexOf('復元（1名）') >= 0, 'D12 非表示中でも選択済み削除行の復元ボタンは出る（選択を暗黙解除しない）');
})();

// ===================================================== C. ▾ ヒント
(function(){
  var row = A.buildMemberSheetRowHtml(MEMBERS[0], false);
  assert((row.match(/ms-caret/g) || []).length === 2, 'C1 非削除行は kind/grade の2セルに ▾');
  assert(row.indexOf('title="タップで選択"') >= 0 && row.indexOf('タップで切替') < 0, 'C2 title は「タップで選択」に更新');
  var delRow = A.buildMemberSheetRowHtml(MEMBERS[2], false);
  assert(delRow.indexOf('ms-caret') < 0, 'C3 削除済み行に ▾ は付けない');
})();

// ===================================================== R. RAW pin（select エディタ・結線）
(function(){
  assert(AUTH_JS.indexOf("member_kind: (m.member_kind === 'other') ? 'member' : 'other'") < 0, 'R1 支部員の循環切替コードを撤去');
  assert(AUTH_JS.indexOf("(cur === 'ippan') ? 'chu' : (cur === 'chu' ? 'josei' : 'ippan')") < 0, 'R2 会費の循環切替コードを撤去');
  assert(/id="msEditKind"[\s\S]{0,300}支部員以外/.test(AUTH_JS), 'R3 支部員 select（支部員/支部員以外）');
  assert(/id="msEditGrade"[\s\S]{0,400}中学生以下[\s\S]{0,200}女性/.test(AUTH_JS), 'R4 会費 select（一般/中学生以下/女性）');
  assert(/function msBindSelectEditor/.test(AUTH_JS), 'R5 select エディタ helper が存在');
  assert(/if \(v === initial\) \{ msEditing = null; renderMemberEditor\(\); return; \}/.test(AUTH_JS), 'R6 同値選択は書き込まずキャンセル');
  assert(/msBindSelectEditor[\s\S]{0,900}Escape/.test(AUTH_JS), 'R7 Escape でキャンセル');
  assert(/msCommitPatch\(id, \{ member_kind: v \}\)/.test(AUTH_JS) && /msCommitPatch\(id, \{ grade: v \}\)/.test(AUTH_JS), 'R8 保存経路は従来の msCommitPatch（フラッシュ追跡が効く）');
  assert(/msShowDeleted = !msShowDeleted; renderMemberEditor\(\)/.test(AUTH_JS), 'R9 トグル結線');
  // APP-UX-004C: 第5引数 msAddOpen が増えたため pin 更新（showDeleted 引き渡し自体は不変）。
  assert(/buildMemberSheetHtml\(membersForEdit, memberSheetSelected, msSearchQuery, msShowDeleted, msAddOpen\)/.test(AUTH_JS), 'R10 描画に showDeleted を引き渡す');
  // L3 P2-1 (#517): iOS ピッカーの多重 change 対策＝one-shot ガード（commit 後の change/keydown/focusout を無視）。
  assert(/var committed = false;/.test(AUTH_JS) && (AUTH_JS.match(/if \(committed\) return;/g) || []).length >= 3, 'R11 select エディタに one-shot commit ガード');
})();

console.log('APP-MEMBER-SHEET-UX-001: PASS='+pass+' FAIL='+fail);
process.exit(fail===0?0:1);
