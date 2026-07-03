#!/usr/bin/env node
// APP-UX-004C — app/ 全体ポリッシュ第3弾（作者承認 2026-07-03・モック承認済み）。
//   ① 大会一覧の行カード化（日付/名称/年度/状態バッジをボタン内へ・行全体タップ・.cloud-tnt 単独クラス維持）
//   ② 名簿上部の整理（検索先頭→サマリ＋削除済みトグル1行→「＋会員を追加」details・ラベル付き・開閉保持）
//   ③ メッセージ色分け（setMsg kind: ok=緑/err=赤/省略=中立紺・className 再構成）
//   実データ不使用（架空のみ）。shogi_v4.html は触らない。

const fs = require('fs');
const path = require('path');
const AUTH_JS = fs.readFileSync(path.join(__dirname, '..', 'app', 'auth.js'), 'utf8');
const INDEX_HTML = fs.readFileSync(path.join(__dirname, '..', 'app', 'index.html'), 'utf8');

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

// ===================================================== T. ① 大会一覧
(function(){
  const tl = A.buildTournamentListHtml([
    { id:'t1', name:'六月例会', date:'2026-06-14', season:'2026年度', status:'confirmed' },
    { id:'t2', name:'五月例会', date:'2026-05-10', season:'2026年度', status:'draft' },
    { id:'t3', name:'取込大会', date:'2026-04-12', season:'2026年度', status:'synced' }
  ]);
  assert(tl.indexOf('<ul class="tnt-list">')>=0, 'T1 tnt-list コンテナ');
  assert(tl.indexOf('class="cloud-tnt"')>=0 && tl.indexOf('cloud-tnt tnt-')<0, 'T2 button クラスは cloud-tnt 単独（bind の className リセット互換）');
  assert(tl.indexOf('data-id="t1"')>=0, 'T3 data-id 温存');
  assert(tl.indexOf('<span class="tnt-date">2026-06-14</span>')>=0, 'T4 日付 span');
  assert(tl.indexOf('<span class="tnt-name">六月例会</span>')>=0, 'T5 名称 span');
  assert(tl.indexOf('<span class="tnt-season">2026年度</span>')>=0, 'T6 年度 span');
  assert(tl.indexOf('<span class="tnt-status">確定</span>')>=0, 'T7 確定は緑バッジ（ts-other なし）');
  assert(tl.indexOf('<span class="tnt-status ts-other">下書き</span>')>=0, 'T8 下書きは ts-other');
  assert(tl.indexOf('<span class="tnt-status">同期済み</span>')>=0, 'T9 同期済みも緑');
  assert(tl.indexOf('org-row')<0 && tl.indexOf('org-meta')<0, 'T10 旧 org-* を使わない');
  // バッジ・年度はボタン内（行全体タップ）
  const btnEnd = tl.indexOf('</button>');
  assert(tl.indexOf('tnt-status') < btnEnd, 'T11 バッジはボタン内');
  const xs = A.buildTournamentListHtml([{ id:'x', name:'<img>', date:'', season:'', status:'zzz' }]);
  assert(xs.indexOf('<img>')<0 && xs.indexOf('&lt;img&gt;')>=0, 'T12 名称は esc 経由（XSS）');
  assert(xs.indexOf('ts-other')>=0, 'T13 未知 status は ts-other');
  assert(A.buildTournamentListHtml([]).indexOf('クラウドに大会がありません')>=0, 'T14 空状態不変');
})();

// ===================================================== M. ② 名簿上部
(function(){
  const members = [
    { member_id:'m1', name:'沼津太郎', yomi:'ぬまづたろう', city:'沼津市', member_kind:'member', grade:'ippan' },
    { member_id:'m2', name:'三島花子', yomi:'みしまはなこ', city:'三島市', member_kind:'member', grade:'josei', deleted_at:'2026-06-01T00:00:00Z' }
  ];
  const h = A.buildMemberSheetHtml(members, {}, '', false);
  const iSearch = h.indexOf('id="msSearchInput"');
  const iMeta = h.indexOf('class="ms-meta-row"');
  const iDet = h.indexOf('id="msAddDetails"');
  const iForm = h.indexOf('id="memberAddForm"');
  const iTable = h.indexOf('ms-table');
  assert(iSearch>=0 && iMeta>iSearch && iDet>iMeta && iTable>iDet, 'M1 並び＝検索→メタ行→追加details→表');
  assert(iForm>iDet && iForm<iTable, 'M2 追加フォームは details 内');
  assert(h.indexOf('<summary>＋ 会員を追加</summary>')>=0, 'M3 summary 文言');
  assert(!/id="msAddDetails" open|id="msAddDetails"[^>]*\sopen/.test(h.slice(iDet-60,iDet+60)), 'M4 既定は閉');
  const h2 = A.buildMemberSheetHtml(members, {}, '', false, true);
  assert(/<details class="ms-add-details" id="msAddDetails" open>/.test(h2), 'M5 addOpen=true で open 復元');
  assert(h.indexOf('<label for="memberAddName">氏名（必須）</label>')>=0 &&
         h.indexOf('<label for="memberAddYomi">ふりがな</label>')>=0 &&
         h.indexOf('<label for="memberAddCity">市町村</label>')>=0, 'M6 ラベル3つ');
  ['memberAddForm','memberAddName','memberAddYomi','memberAddCity','memberAddBtn','msSearchInput','msShowDeletedBtn'].forEach(function(id){
    assert(h.indexOf('id="'+id+'"')>=0, 'M7 id 温存: '+id);
  });
  const iTog = h.indexOf('id="msShowDeletedBtn"');
  const iMetaEnd = h.indexOf('</div>', iMeta);
  assert(iTog>iMeta, 'M8 削除済みトグルはメタ行内（サマリと同一行）');
  const empty = A.buildMemberSheetHtml([], {}, '', false);
  assert(empty.indexOf('「＋ 会員を追加」から追加できます')>=0, 'M9 空状態文言（フォームは下の details）');
  const q = A.buildMemberSheetHtml(members, {}, 'ぬまづ', false);
  assert(q.indexOf('id="msSearchCount"')>=0 && q.indexOf('id="msSearchClear"')>=0, 'M10 検索時のカウント・クリア不変');
})();

// ===================================================== S. ③ setMsg kind（RAW pin＋DOM モック）
(function(){
  assert(/function setMsg\(id, text, kind\)/.test(AUTH_JS), 'S1 setMsg が kind を受ける');
  assert(/el\.className = 'msg' \+ \(kind === 'ok' \? ' msg-ok' : \(kind === 'err' \? ' msg-err' : ''\)\)/.test(AUTH_JS), 'S2 className 再構成（msg 基底維持）');
  const kindCalls = (AUTH_JS.match(/setMsg\('[A-Za-z]+', [^;]*r\.ok \? 'ok' : 'err'/g) || []).length;
  assert(kindCalls >= 7, 'S3 成否既知の呼び出しに kind 付与（'+kindCalls+'件≧7）');
  assert(/setMsg\('loginMsg', r\.message, 'err'\)/.test(AUTH_JS), 'S4 ログイン失敗は err');
  assert(/取り込み完了[^;]*'ok'\)/.test(AUTH_JS), 'S5 取り込み完了は ok');
  assert(/取り込み失敗[^;]*'err'\)/.test(AUTH_JS), 'S6 取り込み失敗は err');
  assert(/完全削除に失敗しました。'， ?/.test(AUTH_JS) === false, 'S7 全角カンマ混入なし（タイポ検知）');
  assert(/\(r && r\.ok\) \? 'ok' : 'err'/.test(AUTH_JS), 'S8 完全削除結果も kind 付与');
  // 進行中メッセージは kind なし（中立）
  assert(/setMsg\('memberEditMsg', '保存中…'\)/.test(AUTH_JS), 'S9 進行中は中立（保存中…）');
  assert(/setMsg\('memberEditMsg', '追加中…'\)/.test(AUTH_JS), 'S10 進行中は中立（追加中…）');
})();

// ===================================================== D. ② 開閉保持の結線（RAW pin）
(function(){
  assert(/var msAddOpen = false;/.test(AUTH_JS), 'D1 msAddOpen 状態変数');
  assert(/buildMemberSheetHtml\(membersForEdit, memberSheetSelected, msSearchQuery, msShowDeleted, msAddOpen\)/.test(AUTH_JS), 'D2 render が msAddOpen を渡す');
  assert(/msAddDetails\.addEventListener\('toggle', function \(\) \{ msAddOpen = !!msAddDetails\.open; \}\)/.test(AUTH_JS), 'D3 toggle で状態同期');
})();

// ===================================================== C. index.html CSS
(function(){
  ['\.tnt-list \{','\.tnt-status \{','\.tnt-status\.ts-other','\.tnt-list \.cloud-tnt\.active','\.cloud-tnt\.active \.tnt-name',
   '\.ms-add-details summary','\.ms-meta-row \{','\.member-add \.fld \{','\.msg\.msg-ok','\.msg\.msg-err'].forEach(function(p){
    assert(new RegExp(p).test(INDEX_HTML), 'C1 CSS: '+p);
  });
  assert(INDEX_HTML.indexOf('auth.js?v=20')>=0, 'C2 cache-bust ?v=20（orphan 系譜）');
  assert(INDEX_HTML.indexOf('APP-UX-004C')>=0, 'C3 004C コメントマーカー');
})();

console.log('APP-UX-004C: PASS=' + pass + ' FAIL=' + fail);
process.exit(fail === 0 ? 0 : 1);
