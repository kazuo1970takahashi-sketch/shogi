#!/usr/bin/env node
// APP-UX-004B（作者承認 2026-07-03）— 幹事管理の整列＋役割説明（app/auth.js + app/index.html）。
//   観点:
//     F  招待フォーム: .adm-form 化・「役割」ラベル・id/name/option の温存。
//     M  結果視認性: adminMsg はフォーム直下（org-list より前）＝スクロールせず見える。
//     R  役割説明: .role-help に4役割（オーナー/管理者/幹事/閲覧）＋「幹事の招待・管理ができる幹事」。
//     B  一覧: 役割バッジ（rb-organizer/rb-viewer）・状態（st-suspended）・act-*／data-id／最後の管理者ガード温存。
//     C  index.html: .adm-form/.role-help/.org-role-badge CSS が存在・旧 #inviteForm 行組み CSS は撤去。
//   実データ不使用（架空のみ）。supabase 非依存（builder 純関数のみ）。当日運営(shogi_v4.html)は触らない。

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

// ---- 架空データ ----
const owner = { id:'o-1', email:'owner@example.com', display_name:'架空 太郎', role:'owner',     status:'active' };
const orgzr = { id:'o-2', email:'org@example.com',   display_name:'架空 花子', role:'organizer', status:'active' };
const viewr = { id:'o-3', email:'view@example.com',  display_name:'',          role:'viewer',    status:'suspended' };
const orgs = [owner, orgzr, viewr];
const summary = { isRegistered:true, isActive:true, isAdmin:true, role:'owner', status:'active',
                  clubId:'c-1', clubName:'架空支部', displayName:'架空 太郎' };

// ---- F: 招待フォーム ----
const h = A.buildAdminPanelHtml(orgs, summary);
assert(h.indexOf('id="inviteForm" class="adm-form"') >= 0, 'F1 inviteForm は id 温存のまま .adm-form 化');
assert(h.indexOf('<label for="inviteRole">役割</label>') >= 0, 'F2 役割 select にラベル追加');
assert(h.indexOf('class="adm-fld adm-fld-role"') >= 0, 'F3 役割 select は内容幅ラッパ（adm-fld-role）');
['inviteEmail','inviteRole','inviteBtn','adminMsg','adminPanel'].forEach(function(id){
  assert(h.indexOf('id="' + id + '"') >= 0, 'F4 id 温存: ' + id);
});
['organizer','admin','viewer'].forEach(function(v){
  assert(h.indexOf('<option value="' + v + '">') >= 0, 'F5 option 温存: ' + v);
});
assert(h.indexOf('name="email"') >= 0 && h.indexOf('name="role"') >= 0, 'F6 name 属性温存（email/role）');

// ---- M: 結果視認性（adminMsg はフォーム直下・一覧より前） ----
const iForm = h.indexOf('id="inviteForm"');
const iMsg  = h.indexOf('id="adminMsg"');
const iList = h.indexOf('class="org-list"');
assert(iForm >= 0 && iMsg > iForm, 'M1 adminMsg はフォームの後');
assert(iList >= 0 && iMsg < iList, 'M2 adminMsg は org-list より前（スクロール不要位置）');

// ---- R: 役割説明 ----
assert(h.indexOf('class="role-help"') >= 0, 'R1 役割説明ボックスあり');
['オーナー','管理者','幹事','閲覧'].forEach(function(r){
  assert(h.indexOf('<dt>' + r + '</dt>') >= 0, 'R2 役割説明: ' + r);
});
assert(h.indexOf('幹事の招待・管理ができる幹事') >= 0, 'R3 管理者の説明文（作者提示の整理）');
const iHelp = h.indexOf('class="role-help"');
assert(iHelp > iMsg && iHelp < iList, 'R4 役割説明はフォーム下・一覧より前');

// ---- B: 一覧（役割バッジ・状態・既存機能温存） ----
const rowOwner = A.buildOrganizerRowHtml(owner, orgs);
const rowOrg   = A.buildOrganizerRowHtml(orgzr, orgs);
const rowView  = A.buildOrganizerRowHtml(viewr, orgs);
assert(rowOwner.indexOf('class="org-role-badge"') >= 0 && rowOwner.indexOf('オーナー') >= 0, 'B1 owner は紺バッジ');
assert(rowOrg.indexOf('org-role-badge rb-organizer') >= 0, 'B2 organizer は rb-organizer バッジ');
assert(rowView.indexOf('org-role-badge rb-viewer') >= 0, 'B3 viewer は rb-viewer バッジ');
assert(rowOwner.indexOf('class="org-status"') >= 0 && rowOwner.indexOf('有効') >= 0, 'B4 active は通常状態表示');
assert(rowView.indexOf('org-status st-suspended') >= 0, 'B5 suspended は st-suspended');
assert(rowOwner.indexOf('data-id="o-1"') >= 0, 'B6 data-id 温存');
assert(rowOwner.indexOf('act-suspend') >= 0 && rowOwner.indexOf('disabled') >= 0, 'B7 最後の管理者ガード温存（disabled）');
assert(rowOrg.indexOf('act-suspend') >= 0 && rowOrg.indexOf('act-retire') >= 0 && rowOrg.indexOf('disabled') < 0, 'B8 通常幹事は停止/退任可');
assert(rowView.indexOf('act-reactivate') >= 0, 'B9 停止中は再有効化ボタン');
assert(rowOwner.indexOf('org-meta') < 0, 'B10 幹事行の org-meta 連結表示は廃止（他画面の org-meta は非接触）');

// ---- 回帰: アプリ全体ビュー ----
const app = A.buildAppViewHtml(summary, orgs);
assert(app.indexOf('id="adminPanel"') >= 0 && app.indexOf('id="importPanel"') >= 0, 'G1 admin 画面に adminPanel + importPanel（取り込みパネル非接触）');
assert(app.indexOf('初期移行・通常は使いません') >= 0, 'G2 取り込みパネル文言不変');

// ---- C: index.html CSS ----
['.adm-form {','.adm-fld {','.role-help {','.org-role-badge {','.org-status.st-suspended {'].forEach(function(sel){
  assert(INDEX_HTML.indexOf(sel) >= 0, 'C1 CSS あり: ' + sel);
});
assert(INDEX_HTML.indexOf('#inviteForm {') < 0 && INDEX_HTML.indexOf('#inviteForm input') < 0 && INDEX_HTML.indexOf('#inviteForm select') < 0, 'C2 旧 #inviteForm 行組み CSS ルールは撤去（コメント言及は可）');
assert(INDEX_HTML.indexOf('.org-meta {') >= 0, 'C3 .org-meta CSS は温存（大会一覧/名簿で使用中）');
assert(/auth\.js\?v=(19|[2-9][0-9])/.test(INDEX_HTML), 'C4 auth.js の cache-bust ?v が 19 以上');

console.log('  APP-UX-004B テスト: PASS ' + pass + '件 / FAIL ' + fail + '件');
process.exit(fail ? 1 : 0);
