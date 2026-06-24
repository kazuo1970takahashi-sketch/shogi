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
  })();

  // ===================================================== F. fetchMembersForEdit
  await (async function(){
    var c = makeClient({ selectData:[{ member_id:'m1', name:'甲', yomi:'こう', branch:'沼津', deleted_at:null }] });
    var r = await A.fetchMembersForEdit(c, CLUB);
    assert(r.ok===true && r.members.length===1, 'F1 ok 経路で members 返却');
    assert(c._calls.select[0].cols.indexOf('deleted_at')>=0 && c._calls.select[0].cols.indexOf('branch')>=0, 'F2 select に deleted_at と branch を含む（編集用）');
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

  console.log('  Stage B-5 名簿編集 テスト: PASS '+pass+'件 / FAIL '+fail+'件');
  process.exit(fail===0?0:1);
})();
