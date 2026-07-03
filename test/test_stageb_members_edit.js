#!/usr/bin/env node
// DATA-PERSISTENCE-PHASE2 / Stage B-5 — app/ 名簿編集 UI（追加 / 氏名・ふりがな・支部の更新 /
//   論理削除・復元）単体テスト。正本: Stage B 設計 issue #343（名簿アーキ・app/ 名簿編集）。
//   観点:
//     N  newMemberId: 'm_' + hex12 形式 / gen 注入で決定的 / 区切り除去。
//     I  insertMember: 氏名必須 / club 必須 / 採番して insert / 空 yomi・branch は null。
//     U  updateMember: 氏名空は拒否 / name/yomi/branch を update（eq 2条件）。
//     D  setMemberDeleted: 論理削除＝deleted_at に時刻 set / 復元＝null set。
//     B  build: 並べ替え（有効先頭→削除済末尾・yomi昇順）/ 編集行 / 削除済の打消し表示 / esc。
//     F  fetchMembersForEdit: deleted_at 含む select / ok・error 経路。
//     C  controller: 追加フォーム submit → insert → 再読込。
//   実データ・実会員名簿は使わない（架空のみ）。supabase client は mock 注入。shogi_v4.html は触らない。

const fs = require('fs');
const path = require('path');
const AUTH_JS = fs.readFileSync(path.join(__dirname, '..', 'app', 'auth.js'), 'utf8');

let pass = 0, fail = 0;
function ok(m){ pass++; if(process.env.VERBOSE) console.log('  ✓ '+m); }
function ng(m){ fail++; console.error('  ✗ '+m); }
function assert(c,m){ c?ok(m):ng(m); }

function makeNode(){
  return { nodeType:1, id:'', innerHTML:'', value:'', textContent:'', disabled:false, _attrs:{}, _listeners:{},
    setAttribute(k,v){this._attrs[k]=String(v);}, getAttribute(k){return (k in this._attrs)?this._attrs[k]:null;},
    addEventListener(ev,cb){(this._listeners[ev]=this._listeners[ev]||[]).push(cb);},
    removeEventListener(){}, querySelectorAll(){return [];} };
}
function makeDoc(){
  const els = {};
  return { _els:els,
    getElementById(id){ if(!els[id]){ const n=makeNode(); n.id=id; els[id]=n; } return els[id]; },
    querySelectorAll(){ return []; },
    addEventListener(){}, removeEventListener(){} };
}
function loadAuth(extra){
  const win = Object.assign({ location:{ origin:'https://app.test', pathname:'/app/' } }, extra||{});
  new Function('window', AUTH_JS)(win);
  return win.ShogiAuth;
}

// mock supabase client。insert/update を記録、select は selectData を返す。
function makeClient(opts){
  opts = opts || {};
  const calls = { insert:[], update:[], select:[] };
  function result(data, error){ return Promise.resolve({ data: (data===undefined?null:data), error: error||null }); }
  function builder(table, op, payload, cols){
    const b = { _table:table, _op:op, _payload:payload, _cols:cols, _filters:{} };
    b.eq = function(k,v){ this._filters[k]=v; return this; };
    b.select = function(c){ if(c!==undefined) this._cols=c; return this; };
    b.then = function(res, rej){
      let out;
      if(op==='insert'){ calls.insert.push({table, payload}); out = opts.insertError?result(null,{message:opts.insertError}):result(null); }
      else if(op==='update'){ calls.update.push({table, payload, filters:b._filters}); out = opts.updateError?result(null,{message:opts.updateError}):result(null); }
      else { calls.select.push({table, cols:b._cols, filters:b._filters}); out = opts.selectError?result(null,{message:opts.selectError}):result(opts.selectData!==undefined?opts.selectData:[]); }
      return out.then(res, rej);
    };
    return b;
  }
  return { _calls: calls,
    from(table){ return { select:(c)=>builder(table,'select',null,c), insert:(p)=>builder(table,'insert',p), update:(p)=>builder(table,'update',p), delete:()=>builder(table,'delete') }; } };
}

const A = loadAuth();
const CLUB = 'cccccccc-0000-0000-0000-000000000001';

(async function(){
  // ===================================================== N. newMemberId
  (function(){
    var id = A.newMemberId(function(){ return 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'; });
    assert(id === 'm_aaaaaaaabbbb', 'N1 newMemberId は m_ + 区切り除去 hex 先頭12（gen 注入で決定的）');
    assert(/^m_[0-9a-f]{12}$/.test(id), 'N2 newMemberId は m_ + hex12 形式');
    var threw=false; try { A.newMemberId(); } catch(e){ threw = /randomUUID/.test(e.message); }
    // 注: node にも crypto があるため throw しないこともある。injected gen が本筋。
    assert(typeof A.newMemberId === 'function', 'N3 newMemberId が公開されている');
  })();

  // ===================================================== I. insertMember
  await (async function(){
    var r1 = await A.insertMember(makeClient(), CLUB, { name:'' });
    assert(r1.ok===false && /氏名/.test(r1.message), 'I1 氏名空は拒否');
    var r2 = await A.insertMember(makeClient(), '', { name:'甲' });
    assert(r2.ok===false && /クラブ/.test(r2.message), 'I2 club 空は拒否');
    var c = makeClient();
    var r3 = await A.insertMember(c, CLUB, { name:' 架空太郎 ', yomi:'', branch:'' }, function(){ return 'dddddddd-eeee-ffff-0000-111111111111'; });
    assert(r3.ok===true && r3.member_id==='m_ddddddddeeee', 'I3 採番して insert・氏名 trim');
    assert(c._calls.insert.length===1, 'I4 members.insert が1回呼ばれる');
    var pay = c._calls.insert[0].payload;
    assert(pay.club_id===CLUB && pay.name==='架空太郎', 'I5 insert payload に club_id と trim 済 name');
    assert(pay.yomi===null && pay.branch===null, 'I6 空 yomi/branch は null（DB に空文字でなく NULL）');
    var c2 = makeClient({ insertError:'duplicate key' });
    var r4 = await A.insertMember(c2, CLUB, { name:'甲' }, function(){ return '11111111-2222-3333-4444-555555555555'; });
    assert(r4.ok===false && /追加できません/.test(r4.message), 'I7 insert エラーは ok:false で通知');
  })();

  // ===================================================== U. updateMember
  await (async function(){
    var r1 = await A.updateMember(makeClient(), CLUB, 'm_x', { name:'  ' });
    assert(r1.ok===false && /氏名/.test(r1.message), 'U1 氏名空は拒否');
    var c = makeClient();
    var r2 = await A.updateMember(c, CLUB, 'm_x', { name:'乙', yomi:'おつ', branch:'三島' });
    assert(r2.ok===true, 'U2 更新成功');
    assert(c._calls.update.length===1, 'U3 members.update が1回');
    var u = c._calls.update[0];
    assert(u.payload.name==='乙' && u.payload.yomi==='おつ' && u.payload.branch==='三島', 'U4 update payload に name/yomi/branch');
    assert(u.filters.club_id===CLUB && u.filters.member_id==='m_x', 'U5 eq(club_id) と eq(member_id) の2条件で限定');
    var c2 = makeClient();
    var r3 = await A.updateMember(c2, CLUB, 'm_y', { name:'丙', yomi:'', branch:'' });
    assert(c2._calls.update[0].payload.yomi===null && c2._calls.update[0].payload.branch===null, 'U6 空 yomi/branch は null');
    var c3 = makeClient({ updateError:'rls' });
    var r4 = await A.updateMember(c3, CLUB, 'm_z', { name:'丁' });
    assert(r4.ok===false && /更新できません/.test(r4.message), 'U7 update エラーは ok:false');
  })();

  // ===================================================== D. setMemberDeleted
  await (async function(){
    var c = makeClient();
    var r1 = await A.setMemberDeleted(c, CLUB, 'm_x', true);
    assert(r1.ok===true && /論理削除/.test(r1.message), 'D1 論理削除 成功メッセージ');
    var del = c._calls.update[0].payload.deleted_at;
    assert(typeof del==='string' && !isNaN(Date.parse(del)), 'D2 deleted_at に ISO 時刻を set（update）');
    assert(c._calls.update[0].filters.club_id===CLUB && c._calls.update[0].filters.member_id==='m_x', 'D3 club_id+member_id で限定');
    var c2 = makeClient();
    var r2 = await A.setMemberDeleted(c2, CLUB, 'm_x', false);
    assert(r2.ok===true && /復元/.test(r2.message), 'D4 復元 成功メッセージ');
    assert(c2._calls.update[0].payload.deleted_at===null, 'D5 復元は deleted_at=null');
    var r3 = await A.setMemberDeleted(makeClient(), '', 'm_x', true);
    assert(r3.ok===false, 'D6 club 空は拒否');
  })();

  // ===================================================== B. build
  (function(){
    var members = [
      { member_id:'m1', name:'乙', yomi:'おつ' },
      { member_id:'m2', name:'甲', yomi:'こう', branch:'沼津' },
      { member_id:'m3', name:'削除太郎', yomi:'あ', deleted_at:'2026-06-24T00:00:00Z' }
    ];
    var sorted = A.sortMembersForEdit(members);
    assert(sorted[0].member_id==='m1' && sorted[1].member_id==='m2', 'B1 有効は yomi 昇順（おつ→こう）');
    assert(sorted[2].member_id==='m3', 'B2 削除済は yomi が先頭でも末尾に回る');
    var panel = A.buildMemberEditPanelHtml(members, null);
    assert(panel.indexOf('id="memberAddForm"')>=0 && panel.indexOf('id="memberAddName"')>=0, 'B3 追加フォームを含む');
    assert(panel.indexOf('有効 2 名／全 3 名')>=0, 'B4 有効数/全数を表示');
    assert(panel.indexOf('class="m-edit"')>=0 && panel.indexOf('class="m-delete"')>=0, 'B5 有効行に 編集/論理削除 ボタン');
    assert(panel.indexOf('class="m-restore"')>=0 && panel.indexOf('member-deleted')>=0, 'B6 削除済行に 復元 ボタン＋打消し表示');
    assert(panel.indexOf('（削除済）')>=0, 'B7 削除済タグ');
    var editRow = A.buildMemberEditRowHtml(members[1], 'm2');
    assert(editRow.indexOf('class="m-edit-name"')>=0 && editRow.indexOf('class="m-save"')>=0 && editRow.indexOf('class="m-cancel"')>=0, 'B8 編集中行はインライン入力＋保存/取消');
    assert(editRow.indexOf('value="甲"')>=0 && editRow.indexOf('value="沼津"')>=0, 'B9 編集行に現在値を流し込む');
    var xss = A.buildMemberEditRowHtml({ member_id:'mX', name:'<b>tag</b>', yomi:'"q"' }, null);
    assert(xss.indexOf('<b>tag</b>')<0 && xss.indexOf('&lt;b&gt;')>=0, 'B10 esc で XSS 安全');
    assert(A.buildMemberEditPanelHtml([], null).indexOf('名簿が空です')>=0, 'B11 空名簿の案内');
    // 論理削除の確認メッセージ（誤操作防止）
    var cmsg = A.memberDeleteConfirmMessage('山田太郎');
    assert(cmsg.indexOf('山田太郎')>=0 && cmsg.indexOf('論理削除')>=0 && cmsg.indexOf('復元')>=0, 'B12 確認メッセージに氏名・論理削除・復元の語');
    assert(A.memberDeleteConfirmMessage('').indexOf('この会員')>=0, 'B13 氏名空は「この会員」にフォールバック');
  })();

  // ===================================================== F. fetchMembersForEdit
  await (async function(){
    var c = makeClient({ selectData:[{ member_id:'m1', name:'甲', yomi:'こう', branch:'沼津', deleted_at:null }] });
    var r = await A.fetchMembersForEdit(c, CLUB);
    assert(r.ok===true && r.members.length===1, 'F1 ok 経路で members 返却');
    // APP-UX-002/CLOUD-MEMBER-FIELDS-001: 明示列挙→'*'（member_kind/grade/city などスキーマ追補に自動追従）。
    assert(c._calls.select[0].cols==='*', 'F2 select は *（deleted_at/branch/member_kind/grade/city を含む全列）');
    assert(c._calls.select[0].filters.club_id===CLUB, 'F3 club_id で限定');
    var c2 = makeClient({ selectError:'rls' });
    var r2 = await A.fetchMembersForEdit(c2, CLUB);
    assert(r2.ok===false && r2.members.length===0, 'F4 error 経路は ok:false・空配列');
  })();

  // ===================================================== C. controller（追加フォーム）
  await (async function(){
    const doc = makeDoc();
    const client = makeClient({ selectData:[] });
    // 実ブラウザでは window.crypto.randomUUID で採番。テスト用 window に注入。
    const Ac = loadAuth({ crypto:{ randomUUID:function(){ return 'abcdabcd-1111-2222-3333-444444444444'; } } });
    const ctrl = Ac.makeController({ client, document: doc });
    // app ビューを直接描画（active organizer 想定）
    ctrl.showApp({ isRegistered:true, isActive:true, isAdmin:false, role:'organizer', clubId:CLUB, clubName:'沼津支部', displayName:'幹事' }, []);
    // loadMemberEditor の fetch→render→bind（非同期）を待つ
    await new Promise(function(r){ setTimeout(r, 0); });
    const form = doc.getElementById('memberAddForm');
    assert(form && (form._listeners.submit||[]).length===1, 'C1 追加フォームに submit ハンドラが結線される（描画後）');
    // 追加フォームに値を入れて submit
    doc.getElementById('memberAddName').value = '新規 花子';
    doc.getElementById('memberAddYomi').value = 'しんき はなこ';
    await form._listeners.submit[0]({ preventDefault(){} });
    await new Promise(function(r){ setTimeout(r, 0); });
    assert(client._calls.insert.length===1 && client._calls.insert[0].payload.name==='新規 花子', 'C2 submit で members.insert（trim 済 name）');
  })();

  // ===================================================== S. APP-UX-002 シート型名簿
  await (async function(){
    var row = A.buildMemberSheetRowHtml({ member_id:'m1', name:'架空太郎', yomi:'かくうたろう', member_kind:'other', grade:'josei', city:'沼津市', branch:'沼津', deleted_at:null }, false);
    assert(row.indexOf('かくうたろう')>=0 && row.indexOf('かくうたろう')<row.indexOf('架空太郎</span>'), 'S1 ふりがなは氏名の上（ルビ位置・checkbox aria-label は除外して比較）');
    // APP-MEMBER-SHEET-UX-001: 区分セルに ▾ ヒントが付いたため '>女性<' → '>女性 ' に pin 更新（表示自体は不変）。
    assert(row.indexOf('mk-other')>=0 && row.indexOf('>女性 ')>=0 && row.indexOf('沼津市')>=0, 'S2 区分バッジ・会費・市町村を表示');
    assert(row.indexOf('ms-name-cell')>=0 && row.indexOf('ms-kind-cell')>=0 && row.indexOf('ms-grade-cell')>=0 && row.indexOf('ms-check')>=0, 'S3 編集セル class＋選択 checkbox');
    assert(row.indexOf('m-edit')<0 && row.indexOf('m-delete')<0, 'S4 行の編集/削除ボタンは無い');
    var delRow = A.buildMemberSheetRowHtml({ member_id:'m2', name:'削除架空', yomi:'さくじょ', deleted_at:'2026-06-15T00:00:00Z' }, true);
    assert(delRow.indexOf('ms-row-deleted')>=0 && delRow.indexOf('（削除済）')>=0 && delRow.indexOf('ms-name-cell')<0 && delRow.indexOf(' checked')>=0, 'S5 削除済み行＝取り消し系・編集不可・選択は可（復元用）');
    var p0 = A.buildMemberSheetHtml([{ member_id:'m1', name:'甲', yomi:'こ', deleted_at:null }], {});
    assert(p0.indexOf('msToolbar')<0 && p0.indexOf('memberAddForm')>=0 && p0.indexOf('ms-table')>=0, 'S6 未選択＝ツールバー非表示・追加フォーム/表あり');
    var p1 = A.buildMemberSheetHtml([
      { member_id:'m1', name:'甲', yomi:'こ', deleted_at:null },
      { member_id:'m2', name:'乙', yomi:'お', deleted_at:'2026-06-15T00:00:00Z' }
    ], { m1:true, m2:true });
    assert(p1.indexOf('2名 選択中')>=0 && p1.indexOf('論理削除（1名）')>=0 && p1.indexOf('復元（1名）')>=0 && p1.indexOf('msClearBtn')>=0, 'S7 選択時ツールバー＝削除/復元/解除の出し分け');
    var cU = makeClient({});
    var rU = await A.updateMemberFields(cU, CLUB, 'm1', { name:'  新名  ', yomi:'  ', city:'' });
    assert(rU.ok===true && cU._calls.update[0].payload.name==='新名' && cU._calls.update[0].payload.yomi===null && cU._calls.update[0].payload.city===null, 'S8 部分更新＝trim・空は null 化');
    assert(cU._calls.update[0].filters.club_id===CLUB && cU._calls.update[0].filters.member_id==='m1', 'S9 club_id＋member_id で限定');
    var rU2 = await A.updateMemberFields(makeClient({}), CLUB, 'm1', { name:'  ' });
    assert(rU2.ok===false, 'S10 氏名空は拒否');
    var cK = makeClient({});
    await A.updateMemberFields(cK, CLUB, 'm1', { member_kind:'other' });
    assert(cK._calls.update[0].payload.member_kind==='other' && !('name' in cK._calls.update[0].payload), 'S11 区分のみの patch は他列を触らない');
    function makeInClient(){
      var calls={update:[]};
      function builder(payload){
        var b={_payload:payload,_filters:{},_in:null};
        b.eq=function(k,v){this._filters[k]=v;return this;};
        b['in']=function(k,vals){this._in={col:k,vals:vals};return this;};
        b.then=function(res,rej){calls.update.push({payload:payload,filters:b._filters,inq:b._in});return Promise.resolve({data:null,error:null}).then(res,rej);};
        return b;
      }
      return {_calls:calls,from:function(){return {update:function(p){return builder(p);}};}};
    }
    var cB=makeInClient();
    var rB=await A.setMembersDeletedBulk(cB, CLUB, ['m1','m2'], true);
    assert(rB.ok===true && cB._calls.update[0].inq.col==='member_id' && cB._calls.update[0].inq.vals.length===2 && typeof cB._calls.update[0].payload.deleted_at==='string', 'S12 まとめ削除＝.in 1リクエスト・deleted_at=時刻');
    var cB2=makeInClient();
    await A.setMembersDeletedBulk(cB2, CLUB, ['m2'], false);
    assert(cB2._calls.update[0].payload.deleted_at===null, 'S13 まとめ復元＝deleted_at=null');
    var rB3=await A.setMembersDeletedBulk(makeInClient(), CLUB, [], true);
    assert(rB3.ok===false, 'S14 空選択は拒否');
    var cm=A.memberBulkConfirmMessage(2,'甲、乙',true);
    assert(cm.indexOf('2名')>=0 && cm.indexOf('論理削除')>=0 && cm.indexOf('復元できます')>=0 && cm.indexOf('よろしいですか')>=0, 'S15 削除 confirm＝件数・危険語・復元可・確認文体');
  })();

  // ===================================================== U16-U19. CITY-UNIFY-001（市町村を city 列に一本化）
  await (async function(){
    var row = A.buildMemberSheetRowHtml({ member_id:'m1', name:'架空太郎', yomi:'かくうたろう', city:'沼津市', branch:'（旧市町村データ）', deleted_at:null }, false);
    assert(row.indexOf('ms-branch-cell')<0 && row.indexOf('（旧市町村データ）')<0, 'U16 シート行に支部セルは無い（branch は表示しない）');
    var sheet = A.buildMemberSheetHtml([{ member_id:'m1', name:'甲', yomi:'こ', deleted_at:null }], {});
    assert(sheet.indexOf('<th>支部</th>')<0 && sheet.indexOf('<th>市町村</th>')>=0, 'U17 ヘッダは市町村のみ（支部列撤去）');
    assert(sheet.indexOf('memberAddCity')>=0 && sheet.indexOf('memberAddBranch')<0 && sheet.indexOf('placeholder="市町村"')>=0, 'U18 追加フォームは市町村入力（branch 入力撤去）');
    var cI = makeClient({});
    await A.insertMember(cI, CLUB, { name:'新規 花子', yomi:'', city:' 三島市 ' }, function(){ return 'dddddddd-eeee-ffff-0000-111111111111'; });
    var payI = cI._calls.insert[0].payload;
    assert(payI.city==='三島市' && payI.branch===null, 'U19 追加は city へ保存（trim・branch は書かない）');
  })();

  console.log('  Stage B-5 名簿編集 テスト: PASS '+pass+'件 / FAIL '+fail+'件');
  process.exit(fail===0?0:1);
})();
