#!/usr/bin/env node
// A-5.1-NUM-001: クラス別採番 欠番維持原則 — 単体テスト
//
// 観点（A-5.1 設計メモ §11.8 / 依頼書 §5.1〜§5.4 準拠）:
//   1. Aクラス欠番維持: 削除後も既存番号が変わらない
//   2. Aクラス新規追加: 欠番を再利用せず max(entry_no)+1 で採番
//   3. Bクラス独立性: Aクラスの削除がBクラス番号に影響しない
//   4. 既存番号の不変性: 名前修正・クラス変更等で他者の番号が変わらない
//   5. normalizeState legacy backfill: entry_no 不在の旧データは index+1 で補完
//   6. nextEntryNoForClass: legacy + 新規混在ケース

const fs = require('fs');

function extractScripts(path) {
  const html = fs.readFileSync(path, 'utf8');
  const scripts = [];
  const re = /<script[^>]*>([\s\S]*?)<\/script>/g;
  let m;
  while ((m = re.exec(html)) !== null) scripts.push(m[1]);
  return scripts.join('\n');
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
  const localStorageMock = {_:{}, getItem(k){return Object.prototype.hasOwnProperty.call(this._,k)?this._[k]:null;}, setItem(k,v){this._[k]=String(v);}, removeItem(k){delete this._[k];}};
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
       normalizeState:normalizeState,
       entryNoOf:entryNoOf,
       nextEntryNoForClass:nextEntryNoForClass,
       addPlayerFromMaster:addPlayerFromMaster,
       changePlayerClass:changePlayerClass,
       createEmptyBranchMaster:createEmptyBranchMaster,
       _setState:function(s){state=s;},
       _getState:function(){return state;}
     };`
  );
  return fn(ctx.document, ctx.window, ctx.localStorage, ctx.crypto, ()=>{}, ()=>true, ()=>'', function(){}, function(){}, {createObjectURL:()=>'',revokeObjectURL:()=>{}}, console, Promise);
}

const targetPath = process.argv[2];
if (!targetPath) {
  console.error('Usage: node test_a5_1_num_001.js <html>');
  process.exit(1);
}

let pass=0, fail=0;
function ok(){pass++;}
function ng(msg){fail++; console.error('  ✗ '+msg);}
function assert(cond,msg){if(cond)ok(); else ng(msg);}
function assertEq(a,b,msg){if(JSON.stringify(a)===JSON.stringify(b))ok(); else ng(msg+': expected '+JSON.stringify(b)+' got '+JSON.stringify(a));}

function makeEmptyState(){
  return {players:{A:[],B:[]},rounds:4,pairings:{A:[],B:[]},results:{A:[],B:[]},started:false,report:{date:'',place:'',start:'',end:'',sei:'',fuku:'',note:''}};
}

function makePlayer(id,name,cls,entryNo){
  var p={id:id,name:name,cls:cls,member:'member',grade:'ippan'};
  if(typeof entryNo==='number')p.entry_no=entryNo;
  return p;
}

// ============================================================
// §5.1 Aクラス欠番維持: 削除後も既存番号が変わらない
// ============================================================
{
  const env = loadEnv(targetPath);
  const s = makeEmptyState();
  s.players.A = [
    makePlayer('p1','田中',  'A', 1),
    makePlayer('p2','佐藤',  'A', 2),
    makePlayer('p3','鈴木',  'A', 3),
  ];
  env._setState(s);

  // 削除前の表示確認
  assertEq(env.entryNoOf('A','p1'), '01', '5.1-pre p1 = 01');
  assertEq(env.entryNoOf('A','p2'), '02', '5.1-pre p2 = 02');
  assertEq(env.entryNoOf('A','p3'), '03', '5.1-pre p3 = 03');

  // p2 を削除（removePlayer と同じ filter 操作）
  s.players.A = s.players.A.filter(function(p){return p.id!=='p2';});

  // 削除後: p1 は 01 のまま、p3 は 03 のまま（02 が欠番）
  assertEq(env.entryNoOf('A','p1'), '01', '5.1-post p1 = 01 (unchanged)');
  assertEq(env.entryNoOf('A','p3'), '03', '5.1-post p3 = 03 (gap maintained, NOT shifted to 02)');
  assertEq(env.entryNoOf('A','p2'), '--', '5.1-post p2 = -- (removed)');
}

// ============================================================
// §5.2 Aクラス新規追加: 欠番を再利用せず max+1 で採番
// ============================================================
{
  const env = loadEnv(targetPath);
  const s = makeEmptyState();
  // A-1, A-3 が存在し A-2 は欠番
  s.players.A = [
    makePlayer('p1','田中',  'A', 1),
    makePlayer('p3','鈴木',  'A', 3),
  ];
  env._setState(s);

  // nextEntryNoForClass は max(entry_no)+1 = 4
  assertEq(env.nextEntryNoForClass('A',s), 4, '5.2 next A = 4 (gap not reused)');

  // addPlayerFromMaster で実際に新規追加
  const master = env.createEmptyBranchMaster();
  master.members.push({id:'m_new',name:'高橋',yomi:'',last_class:null,last_attended:'',first_attended:'',attendance_count:0,tournament_ids:[],deleted:false,deleted_at:null,note:'',member:'member',grade:'ippan'});
  const r = env.addPlayerFromMaster('m_new','A',master,s);
  assert(r.success, '5.2 addPlayerFromMaster success');
  assertEq(r.player.entry_no, 4, '5.2 new player.entry_no = 4');
  assertEq(env.entryNoOf('A',r.player.id), '04', '5.2 display 04 (not 02)');
}

// ============================================================
// §5.3 Bクラス独立性: Aクラスの削除がBクラス番号に影響しない
// ============================================================
{
  const env = loadEnv(targetPath);
  const s = makeEmptyState();
  s.players.A = [
    makePlayer('pa1','田中A','A', 1),
    makePlayer('pa2','佐藤A','A', 2),
  ];
  s.players.B = [
    makePlayer('pb1','田中B','B', 1),
    makePlayer('pb2','佐藤B','B', 2),
  ];
  env._setState(s);

  assertEq(env.entryNoOf('A','pa2'), '02', '5.3-pre A pa2 = 02');
  assertEq(env.entryNoOf('B','pb2'), '02', '5.3-pre B pb2 = 02');

  // Aクラスから1人削除
  s.players.A = s.players.A.filter(function(p){return p.id!=='pa1';});

  // Bクラスの番号は不変
  assertEq(env.entryNoOf('B','pb1'), '01', '5.3-post B pb1 = 01 (unaffected)');
  assertEq(env.entryNoOf('B','pb2'), '02', '5.3-post B pb2 = 02 (unaffected)');

  // Bクラスへの新規追加は B 内 max+1 = 3
  assertEq(env.nextEntryNoForClass('B',s), 3, '5.3 next B = 3 (B-internal max+1)');

  // Aクラスへの新規追加は A 内 max+1 = 3（欠番 01 を再利用しない）
  assertEq(env.nextEntryNoForClass('A',s), 3, '5.3 next A = 3 (A gap 01 not reused)');
}

// ============================================================
// §5.4 既存番号の不変性: クラス変更で他者の番号が変わらない
// ============================================================
{
  const env = loadEnv(targetPath);
  const s = makeEmptyState();
  s.players.A = [
    makePlayer('pa1','田中A','A', 1),
    makePlayer('pa2','佐藤A','A', 2),
    makePlayer('pa3','鈴木A','A', 3),
  ];
  s.players.B = [
    makePlayer('pb1','田中B','B', 1),
  ];
  env._setState(s);
  // 名前修正は p.name を書き換えるだけで entry_no を触らない
  s.players.A[1].name = '佐藤A_修正';
  assertEq(env.entryNoOf('A','pa1'), '01', '5.4 rename: pa1 unchanged');
  assertEq(env.entryNoOf('A','pa2'), '02', '5.4 rename: pa2 number unchanged');
  assertEq(env.entryNoOf('A','pa3'), '03', '5.4 rename: pa3 unchanged');

  // クラス変更: pa2 (A-02) を B へ移す
  const master = env.createEmptyBranchMaster();
  master.members.push({id:'m_x',name:'佐藤A_修正',yomi:'',last_class:'A',last_attended:'',first_attended:'',attendance_count:0,tournament_ids:[],deleted:false,deleted_at:null,note:'',member:'member',grade:'ippan'});
  s.players.A[1].member_id = 'm_x';
  const r = env.changePlayerClass('m_x','B',master,s);
  assert(r.success, '5.4 changePlayerClass success');

  // 移動後: 旧Aクラスの pa1, pa3 は 01 / 03 のまま（02 は欠番）
  assertEq(env.entryNoOf('A','pa1'), '01', '5.4 after class change: pa1 = 01');
  assertEq(env.entryNoOf('A','pa3'), '03', '5.4 after class change: pa3 = 03 (gap kept)');
  // pa2 は今や B クラスの新規 entry_no = 2（B-internal max(1)+1）
  assertEq(r.player.entry_no, 2, '5.4 moved player gets new entry_no in newCls = 2');
  assertEq(env.entryNoOf('B','pa2'), '02', '5.4 moved player display in B = 02');
  // 元から B にいた pb1 は不変
  assertEq(env.entryNoOf('B','pb1'), '01', '5.4 existing B pb1 unchanged');
}

// ============================================================
// §5.5 normalizeState legacy backfill: entry_no 不在の旧データ
// ============================================================
{
  const env = loadEnv(targetPath);
  // 旧データ形式（entry_no フィールドなし）
  const raw = {
    players:{
      A:[
        {id:'p1',name:'田中',cls:'A',member:'member',grade:'ippan'},
        {id:'p2',name:'佐藤',cls:'A',member:'member',grade:'ippan'},
        {id:'p3',name:'鈴木',cls:'A',member:'member',grade:'ippan'},
      ],
      B:[]
    },
    rounds:4,
    pairings:{A:[],B:[]},
    results:{A:[],B:[]},
    started:false,
    report:{date:'',place:'',start:'',end:'',sei:'',fuku:'',note:''}
  };
  const normalized = env.normalizeState(raw);
  assertEq(normalized.players.A[0].entry_no, 1, '5.5 legacy backfill A[0].entry_no = 1');
  assertEq(normalized.players.A[1].entry_no, 2, '5.5 legacy backfill A[1].entry_no = 2');
  assertEq(normalized.players.A[2].entry_no, 3, '5.5 legacy backfill A[2].entry_no = 3');

  // 永続化済み entry_no（一部 gap あり）は保持する
  const raw2 = {
    players:{
      A:[
        {id:'p1',name:'田中',cls:'A',member:'member',grade:'ippan',entry_no:1},
        {id:'p3',name:'鈴木',cls:'A',member:'member',grade:'ippan',entry_no:3},
      ],
      B:[]
    },
    rounds:4,pairings:{A:[],B:[]},results:{A:[],B:[]},started:false,
    report:{date:'',place:'',start:'',end:'',sei:'',fuku:'',note:''}
  };
  const normalized2 = env.normalizeState(raw2);
  assertEq(normalized2.players.A[0].entry_no, 1, '5.5 persisted entry_no kept (A[0]=1)');
  assertEq(normalized2.players.A[1].entry_no, 3, '5.5 persisted entry_no kept (A[1]=3, gap maintained)');

  // entry_no が壊れた値（負数、非数値、0）の場合は index+1 にフォールバック
  const raw3 = {
    players:{
      A:[
        {id:'p1',name:'田中',cls:'A',entry_no:-1},
        {id:'p2',name:'佐藤',cls:'A',entry_no:'bad'},
        {id:'p3',name:'鈴木',cls:'A',entry_no:0},
      ],
      B:[]
    },
    rounds:4,pairings:{A:[],B:[]},results:{A:[],B:[]},started:false,
    report:{date:'',place:'',start:'',end:'',sei:'',fuku:'',note:''}
  };
  const normalized3 = env.normalizeState(raw3);
  assertEq(normalized3.players.A[0].entry_no, 1, '5.5 invalid entry_no (-1) → backfilled to 1');
  assertEq(normalized3.players.A[1].entry_no, 2, '5.5 invalid entry_no ("bad") → backfilled to 2');
  assertEq(normalized3.players.A[2].entry_no, 3, '5.5 invalid entry_no (0) → backfilled to 3');
}

// ============================================================
// §5.6 nextEntryNoForClass: legacy + 新規混在ケース
// ============================================================
{
  const env = loadEnv(targetPath);
  const s = makeEmptyState();
  // entry_no 不在の legacy 2 名（最初に nextEntryNoForClass を呼ぶと backfill される）
  s.players.A = [
    {id:'p1',name:'A1',cls:'A',member:'member',grade:'ippan'},
    {id:'p2',name:'A2',cls:'A',member:'member',grade:'ippan'},
  ];
  const next = env.nextEntryNoForClass('A',s);
  assertEq(next, 3, '5.6 legacy backfill: next = 3');
  // backfill が永続化されていること
  assertEq(s.players.A[0].entry_no, 1, '5.6 legacy[0] backfilled to entry_no=1');
  assertEq(s.players.A[1].entry_no, 2, '5.6 legacy[1] backfilled to entry_no=2');

  // 空クラスは 1 から
  const s2 = makeEmptyState();
  assertEq(env.nextEntryNoForClass('A',s2), 1, '5.6 empty class → next = 1');
  assertEq(env.nextEntryNoForClass('B',s2), 1, '5.6 empty class B → next = 1');
}

// ============================================================
// 結果
// ============================================================
console.log('\n  A-5.1-NUM-001 単体テスト: PASS '+pass+'件 / FAIL '+fail+'件');
process.exit(fail===0?0:1);
