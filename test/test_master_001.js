#!/usr/bin/env node
// MASTER-001: 参加者名修正時の会員マスタ反映 — 単体テスト
//
// テスト観点:
//   1. findMemberCandidatesByName: 氏名一致のみ・yomi 一致は拾わない (Should Fix 2)
//   2. findMasterRenameTarget: member_id 優先 / 不存在時は氏名フォールバックしない
//   3. applyParticipantRenameOnly: shogi_v4 への保存検証 (Must Fix 1 / Should Fix 5)
//   4. applyParticipantRenameWithMaster: マスタ保存検証 / 候補1件で更新成功
//   5. クリック時再特定: 別ID/不在/複数化で candidate_changed (Should Fix 1)
//   6. 保存失敗時に成功扱いしない (Must Fix 1)
//   7. 破損マスタ / 不在マスタ / 削除済 member の保護

const fs = require('fs');

function extractScripts(path) {
  const html = fs.readFileSync(path, 'utf8');
  const scripts = [];
  const re = /<script[^>]*>([\s\S]*?)<\/script>/g;
  let m;
  while ((m = re.exec(html)) !== null) scripts.push(m[1]);
  return scripts.join('\n');
}

function makeLocalStorage() {
  return {
    _: {},
    _failOnSet: false,  // 保存失敗を強制するスイッチ
    _failOnGet: false,  // 読込失敗を強制するスイッチ
    getItem(k){
      if(this._failOnGet)throw new Error('localStorage.getItem forced failure');
      return Object.prototype.hasOwnProperty.call(this._,k)?this._[k]:null;
    },
    setItem(k,v){
      if(this._failOnSet)throw new Error('localStorage.setItem forced failure');
      this._[k]=String(v);
    },
    removeItem(k){delete this._[k];}
  };
}

function makeContext() {
  const elements = {};
  function makeElem(id) {
    return {
      id: id || '',
      _innerHTML: '',
      style: { _cssText: '', set cssText(v){this._cssText=v;}, get cssText(){return this._cssText;}, display:'' },
      className: '',
      get innerHTML(){return this._innerHTML;},
      set innerHTML(v){this._innerHTML=v;},
      addEventListener(){},
      appendChild(){},
      remove(){},
      focus(){},
      click(){},
      value: '',
      firstChild: null,
      disabled: false,
      getAttribute(){return null;},
      setAttribute(){}
    };
  }
  const docMock = {
    getElementById(id) {
      if (!elements[id]) elements[id] = makeElem(id);
      return elements[id];
    },
    createElement(){return makeElem();},
    body: { appendChild(){}, removeChild(){} },
    addEventListener(){},
    removeEventListener(){},
    querySelectorAll(){return [];}
  };
  const winMock = { innerWidth: 1024 };
  const localStorageMock = makeLocalStorage();
  const cryptoMock = {
    randomUUID(){
      const chars='abcdef0123456789';
      let s='';
      for(let i=0;i<32;i++)s+=chars[Math.floor(Math.random()*chars.length)];
      return s.slice(0,8)+'-'+s.slice(8,12)+'-'+s.slice(12,16)+'-'+s.slice(16,20)+'-'+s.slice(20,32);
    }
  };
  return { document: docMock, window: winMock, localStorage: localStorageMock, crypto: cryptoMock };
}

function loadEnv(path) {
  const ctx = makeContext();
  const js = extractScripts(path);
  const fn = new Function(
    'document','window','localStorage','crypto','alert','confirm','prompt','FileReader','Blob','URL','console','Promise',
    `${js};
     return {
       STORAGE_KEY:STORAGE_KEY,
       BRANCH_MASTER_KEY:BRANCH_MASTER_KEY,
       createEmptyBranchMaster:createEmptyBranchMaster,
       normalizePersonName:normalizePersonName,
       loadBranchMaster:loadBranchMaster,
       saveBranchMaster:saveBranchMaster,
       applyMasterMemberEdit:applyMasterMemberEdit,
       findMemberCandidatesByName:findMemberCandidatesByName,
       findMasterRenameTarget:findMasterRenameTarget,
       applyParticipantRenameOnly:applyParticipantRenameOnly,
       applyParticipantRenameWithMaster:applyParticipantRenameWithMaster,
       verifyStatePersisted:verifyStatePersisted,
       verifyMasterPersisted:verifyMasterPersisted,
       _localStorage:localStorage,
       _setState:function(s){state=s;},
       _getState:function(){return state;}
     };`
  );
  return fn(ctx.document, ctx.window, ctx.localStorage, ctx.crypto, ()=>{}, ()=>true, ()=>'', function(){}, function(){}, {createObjectURL:()=>'',revokeObjectURL:()=>{}}, console, Promise);
}

const targetPath = process.argv[2];
if (!targetPath) {
  console.error('Usage: node test_master_001.js <html>');
  process.exit(1);
}

let pass=0, fail=0;
function ok(){pass++;}
function ng(msg){fail++; console.error('  ✗ '+msg);}
function assert(cond,msg){if(cond)ok(); else ng(msg);}
function assertEq(a,b,msg){if(JSON.stringify(a)===JSON.stringify(b))ok(); else ng(msg+': expected '+JSON.stringify(b)+' got '+JSON.stringify(a));}

function makeMember(id,name,yomi){
  return {id:id,name:name,yomi:yomi||'',last_class:null,last_attended:'2026-01-01',first_attended:'2026-01-01',attendance_count:0,tournament_ids:[],deleted:false,deleted_at:null,note:'',member:'member',grade:'ippan',city:''};
}

function makePlayer(id,name,opts){
  return Object.assign({id:id,name:name,cls:(opts&&opts.cls)||'A',member:'member',grade:'ippan',member_id:(opts&&opts.member_id)||undefined,yomi:(opts&&opts.yomi)||undefined},opts||{});
}

// ============================================================
// 1. findMemberCandidatesByName: 氏名一致のみ（Should Fix 2）
// ============================================================
{
  const env = loadEnv(targetPath);
  const master = env.createEmptyBranchMaster();
  master.members.push(makeMember('m_a','山田 太郎','やまだたろう'));
  master.members.push(makeMember('m_b','佐藤 花子','さとうはなこ'));
  master.members.push(makeMember('m_c','山田 太郎','やまだたろう'));  // 同名

  const a = env.findMemberCandidatesByName('山田 太郎',master);
  assert(a.length===2, '1-1 findMemberCandidatesByName: 同名2件ヒット');

  const b = env.findMemberCandidatesByName('佐藤 花子',master);
  assert(b.length===1 && b[0].id==='m_b', '1-2 findMemberCandidatesByName: 一意一致');

  const c = env.findMemberCandidatesByName('存在しない名前',master);
  assert(c.length===0, '1-3 findMemberCandidatesByName: 一致なしは空配列');

  // yomi 一致のみでは拾わない（rename 用途）
  const d = env.findMemberCandidatesByName('やまだたろう',master);  // 氏名としては未一致
  assert(d.length===0, '1-4 findMemberCandidatesByName: yomi 一致のみでは拾わない (Should Fix 2)');

  // 削除済は除外
  master.members.push(makeMember('m_d','削除 太郎',''));
  master.members[master.members.length-1].deleted=true;
  const e = env.findMemberCandidatesByName('削除 太郎',master);
  assert(e.length===0, '1-5 findMemberCandidatesByName: deleted=true は除外');
}

// ============================================================
// 2. findMasterRenameTarget: member_id 優先 / 氏名フォールバック禁止
// ============================================================
{
  const env = loadEnv(targetPath);
  const master = env.createEmptyBranchMaster();
  master.members.push(makeMember('m_a','山田 太郎',''));
  master.members.push(makeMember('m_b','佐藤 花子',''));

  // member_id 一致
  const r1 = env.findMasterRenameTarget({name:'山田 太郎',member_id:'m_a'},master);
  assert(r1.status==='by_member_id' && r1.member && r1.member.id==='m_a', '2-1 findMasterRenameTarget: member_id で特定');

  // member_id ありだが該当不在 → 氏名フォールバックしない
  const r2 = env.findMasterRenameTarget({name:'山田 太郎',member_id:'m_unknown'},master);
  assert(r2.status==='none' && r2.member===null, '2-2 findMasterRenameTarget: member_id 不在時は氏名フォールバックしない');

  // member_id なし、旧氏名で1件
  const r3 = env.findMasterRenameTarget({name:'山田 太郎'},master);
  assert(r3.status==='unique' && r3.member && r3.member.id==='m_a', '2-3 findMasterRenameTarget: 氏名一致1件');

  // 同名複数件
  master.members.push(makeMember('m_c','山田 太郎',''));
  const r4 = env.findMasterRenameTarget({name:'山田 太郎'},master);
  assert(r4.status==='multi' && r4.member===null, '2-4 findMasterRenameTarget: 同名複数件');

  // 氏名不一致
  const r5 = env.findMasterRenameTarget({name:'存在しない'},master);
  assert(r5.status==='none' && r5.member===null, '2-5 findMasterRenameTarget: 氏名不一致は none');

  // master 不在
  const r6 = env.findMasterRenameTarget({name:'山田 太郎'},null);
  assert(r6.status==='no_master', '2-6 findMasterRenameTarget: master 不在は no_master');
}

// ============================================================
// 3. applyParticipantRenameOnly: shogi_v4 保存検証 (Must Fix 1 §6-7)
// ============================================================
{
  const env = loadEnv(targetPath);
  const p = makePlayer('p_1','山田 太郎',{cls:'A'});
  env._setState({players:{A:[p],B:[]},rounds:4,pairings:{A:[],B:[]},results:{A:[],B:[]},started:false,report:{date:'',place:'',start:'',end:'',sei:'',fuku:'',note:''}});

  const r = env.applyParticipantRenameOnly(p,'山田 太朗');
  assert(r.success===true, '3-1 applyParticipantRenameOnly: success=true');
  assert(r.persisted===true, '3-2 applyParticipantRenameOnly: 保存検証 true');
  assert(p.name==='山田 太朗', '3-3 applyParticipantRenameOnly: in-memory p.name 更新');

  // 保存失敗を強制した場合
  env._localStorage._failOnSet = true;
  const r2 = env.applyParticipantRenameOnly(p,'山田 太郎');
  assert(r2.success===true, '3-4 applyParticipantRenameOnly: 失敗時も in-memory rename は success');
  assert(r2.persisted===false, '3-5 applyParticipantRenameOnly: setItem 例外時は persisted=false');
}

// ============================================================
// 4. applyParticipantRenameWithMaster: 候補1件 → マスタ更新 + 検証
// ============================================================
{
  const env = loadEnv(targetPath);
  const master = env.createEmptyBranchMaster();
  master.members.push(makeMember('m_a','山田 太郎','やまだたろう'));
  env.saveBranchMaster(master);

  const p = makePlayer('p_1','山田 太郎',{cls:'A'});
  env._setState({players:{A:[p],B:[]},rounds:4,pairings:{A:[],B:[]},results:{A:[],B:[]},started:false,report:{date:'',place:'',start:'',end:'',sei:'',fuku:'',note:''}});

  const r = env.applyParticipantRenameWithMaster(p,'山田 太朗','m_a','山田 太郎');
  assert(r.success===true, '4-1 applyParticipantRenameWithMaster: success=true');
  assert(r.masterPersisted===true, '4-2 applyParticipantRenameWithMaster: masterPersisted=true');

  // localStorage を再読込してマスタが永続化されているか
  const persisted = env.verifyMasterPersisted('m_a','山田 太朗');
  assert(persisted===true, '4-3 verifyMasterPersisted: localStorage 再読込で確認');

  // ふりがなは変更されていないこと
  const reload = env.loadBranchMaster();
  const m = reload.members.find(x=>x.id==='m_a');
  assert(m && m.yomi==='やまだたろう', '4-4 ふりがなは保持される（範囲外）');
}

// ============================================================
// 5. クリック時再特定: 候補が消えた場合 → candidate_changed (Should Fix 1)
// ============================================================
{
  const env = loadEnv(targetPath);
  const master = env.createEmptyBranchMaster();
  master.members.push(makeMember('m_a','山田 太郎',''));
  env.saveBranchMaster(master);

  const p = makePlayer('p_1','山田 太郎');
  env._setState({players:{A:[p],B:[]},rounds:4,pairings:{A:[],B:[]},results:{A:[],B:[]},started:false,report:{date:'',place:'',start:'',end:'',sei:'',fuku:'',note:''}});

  // モーダル open 時の候補は m_a (status='unique')
  // クリック前にマスタが書き換わって m_a が消えるシナリオ
  const corrupted = env.createEmptyBranchMaster();
  corrupted.members.push(makeMember('m_x','別人 二郎',''));
  env.saveBranchMaster(corrupted);

  const r = env.applyParticipantRenameWithMaster(p,'山田 太朗','m_a','山田 太郎');
  assert(r.success===false, '5-1 候補消失: success=false');
  assert(r.error==='candidate_changed_none' || r.error==='candidate_changed', '5-2 候補消失: candidate_changed 系エラー');
}

// クリック時再特定: 候補が増えた場合 (multi)
{
  const env = loadEnv(targetPath);
  const master = env.createEmptyBranchMaster();
  master.members.push(makeMember('m_a','山田 太郎',''));
  env.saveBranchMaster(master);

  const p = makePlayer('p_1','山田 太郎');
  // モーダル open 後にマスタへ同名2件目が追加される
  master.members.push(makeMember('m_c','山田 太郎',''));
  env.saveBranchMaster(master);

  const r = env.applyParticipantRenameWithMaster(p,'山田 太朗','m_a','山田 太郎');
  assert(r.success===false, '5-3 候補増加: success=false');
  assert(r.error==='candidate_changed_multi', '5-4 候補増加: candidate_changed_multi');
}

// member_id 優先パス: 該当 member が消えた場合
{
  const env = loadEnv(targetPath);
  const master = env.createEmptyBranchMaster();
  master.members.push(makeMember('m_a','山田 太郎',''));
  env.saveBranchMaster(master);

  const p = makePlayer('p_1','山田 太郎',{member_id:'m_a'});
  // member_id 不在に書き換え
  const empty = env.createEmptyBranchMaster();
  env.saveBranchMaster(empty);

  const r = env.applyParticipantRenameWithMaster(p,'山田 太朗','m_a','山田 太郎');
  assert(r.success===false, '5-5 member_id 消失: success=false');
  assert(typeof r.error==='string' && r.error.indexOf('candidate_changed')===0, '5-6 member_id 消失: candidate_changed 系');
}

// ============================================================
// 6. 保存失敗時に成功扱いしない (Must Fix 1 §2-4)
// ============================================================
{
  const env = loadEnv(targetPath);
  const master = env.createEmptyBranchMaster();
  master.members.push(makeMember('m_a','山田 太郎',''));
  env.saveBranchMaster(master);

  const p = makePlayer('p_1','山田 太郎');
  env._setState({players:{A:[p],B:[]},rounds:4,pairings:{A:[],B:[]},results:{A:[],B:[]},started:false,report:{date:'',place:'',start:'',end:'',sei:'',fuku:'',note:''}});

  env._localStorage._failOnSet = true;  // 保存を強制的に失敗させる

  const r = env.applyParticipantRenameWithMaster(p,'山田 太朗','m_a','山田 太郎');
  assert(r.success===true, '6-1 保存失敗: edit 自体は通る');
  assert(r.masterPersisted===false, '6-2 保存失敗: masterPersisted=false で「成功」と扱わせない');
}

// ============================================================
// 7. 破損マスタ / 削除済 member の保護
// ============================================================
{
  // 削除済 member
  const env = loadEnv(targetPath);
  const master = env.createEmptyBranchMaster();
  const dm = makeMember('m_a','山田 太郎','');
  dm.deleted = true;
  master.members.push(dm);
  env.saveBranchMaster(master);

  const p = makePlayer('p_1','山田 太郎',{member_id:'m_a'});
  const r = env.applyParticipantRenameWithMaster(p,'山田 太朗','m_a','山田 太郎');
  assert(r.success===false, '7-1 削除済 member: success=false');
}

// ============================================================
// 結果
// ============================================================
console.log('\n  MASTER-001 単体テスト: PASS '+pass+'件 / FAIL '+fail+'件');
process.exit(fail===0?0:1);
