#!/usr/bin/env node
// ペアリングロジックと削除クラッシュ防止の性質テスト
// 引数: <target.html>
// 観点:
//   1. 全員1回だけ登場（1ラウンドで各選手は最大1ペア）
//   2. 再戦回避（過去対戦相手と組むのは他に選択肢がない場合のみ）
//   3. 勝数差最小性（同勝ち数で組める時は必ず同勝ち数で組まれる）
//   4. 削除クラッシュ非再現（開始後・過去対局あり参加者の削除がブロックされる）
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
      id: id || '', _innerHTML: '', style: {cssText:'', display:''}, className: '',
      get innerHTML(){return this._innerHTML;}, set innerHTML(v){this._innerHTML=v;},
      addEventListener(){}, appendChild(){}, remove(){}, focus(){}, click(){}, value: '', firstChild: null
    };
  }
  const docMock = {
    getElementById(id){ if(!elements[id]) elements[id]=makeElem(id); return elements[id]; },
    createElement(){ return makeElem(); },
    body: {appendChild(){}, removeChild(){}},
    addEventListener(){}
  };
  const winMock = {innerWidth: 1024};
  const localStorageMock = {_:{}, getItem(k){return this._[k]||null;}, setItem(k,v){this._[k]=v;}, removeItem(k){delete this._[k];}};
  let lastAlert = null;
  let confirmReturn = true;
  return {
    document: docMock,
    window: winMock,
    localStorage: localStorageMock,
    alert: (msg) => { lastAlert = msg; },
    confirm: () => confirmReturn,
    prompt: () => null,
    FileReader: function(){},
    Blob: function(){},
    URL: {createObjectURL(){return'';}, revokeObjectURL(){}},
    getLastAlert: () => lastAlert,
    setConfirmReturn: (v) => { confirmReturn = v; }
  };
}

// shogi_v4.html の JS を取り出して、sandbox 内で関数を export する
function makeSandbox(jsCode) {
  const ctx = makeContext();
  // generatePairing / removePlayer / calcFinal / state を返すクロージャを構築
  const factory = new Function(
    'document','window','localStorage','alert','confirm','prompt','FileReader','Blob','URL',
    `${jsCode}
     return {
       setState: function(s){ state = s; },
       getState: function(){ return state; },
       generatePairing: generatePairing,
       removePlayer: removePlayer,
       calcFinal: calcFinal,
       getWins: getWins
     };`
  );
  const api = factory(ctx.document, ctx.window, ctx.localStorage, ctx.alert, ctx.confirm, ctx.prompt, ctx.FileReader, ctx.Blob, ctx.URL);
  return { ctx, api };
}

function deepClone(o){ return JSON.parse(JSON.stringify(o)); }

// ============================================================
// テストケース生成: スイス式トーナメント途中の様々な state を構築
// ============================================================
function buildStateAfterRounds(numPlayers, numRounds, seed){
  // 決定的擬似乱数（seedあり）
  let s = seed;
  function rand(){ s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; }
  function randInt(n){ return Math.floor(rand()*n); }

  const players = [];
  for(let i=1;i<=numPlayers;i++){
    players.push({id:'p'+i, name:'P'+i, cls:'A', member:'member', grade:'ippan'});
  }
  const state = {
    players: {A: players, B:[]},
    rounds: numRounds + 2,
    pairings: {A:[], B:[]},
    results: {A:[], B:[]},
    started: true
  };

  // 簡易ペアリング: numRounds 回戦分の結果を仮生成（過去対戦をある程度作る）
  // ここでは「id順に固定ペア」で過去結果を作る（テストの再現性重視）
  // r=0: (0,1),(2,3),(4,5)...   r=1: (0,2),(1,3),(4,6),(5,7)...
  const usedPairs = {};
  function pairKey(a,b){ return a<b ? a+'-'+b : b+'-'+a; }

  for(let r=0;r<numRounds;r++){
    const round = [];
    const usedThisRound = {};
    for(let i=0;i<players.length;i++){
      if(usedThisRound[players[i].id]) continue;
      // 未使用かつ未対戦の相手を探す
      for(let j=i+1;j<players.length;j++){
        if(usedThisRound[players[j].id]) continue;
        const k = pairKey(players[i].id, players[j].id);
        if(usedPairs[k]) continue;
        usedThisRound[players[i].id] = true;
        usedThisRound[players[j].id] = true;
        usedPairs[k] = true;
        // 勝者をseedベースで決定
        const winner = randInt(2)===0 ? players[i].id : players[j].id;
        round.push({p1: players[i].id, p2: players[j].id, winner: winner});
        break;
      }
    }
    state.results.A.push(round);
  }
  return state;
}

// ============================================================
// 検証関数
// ============================================================
function verifyAllPlayersOnce(state, pairings){
  const seen = {};
  for(const p of pairings){
    if(seen[p.p1]) return {ok:false, msg:'p1='+p.p1+' が複数ペアに登場'};
    if(seen[p.p2]) return {ok:false, msg:'p2='+p.p2+' が複数ペアに登場'};
    seen[p.p1] = true;
    seen[p.p2] = true;
  }
  return {ok:true};
}

function verifyRematchAvoidance(state, pairings, played){
  // 再戦が発生しているペアのリストを抽出
  const rematches = [];
  for(const p of pairings){
    if(played[p.p1].indexOf(p.p2) >= 0){
      rematches.push(p);
    }
  }
  if(rematches.length === 0) return {ok:true};
  // 再戦が「他に選択肢がなかった」ことを確認するのは厳密には困難なので、
  // 「allowRematch=false で組める state では再戦が発生しない」を別途検証する
  return {ok:true, rematches: rematches};
}

// 同勝ち数のみで完全ペアリングが組めるかを判定（マッチング探索）
function canPairAllSameWins(players, played, wins){
  // 同勝ち数グループ内でマッチング可能か
  const groups = {};
  for(const p of players){
    const w = wins[p.id]||0;
    if(!groups[w]) groups[w]=[];
    groups[w].push(p);
  }
  for(const w in groups){
    const g = groups[w];
    if(g.length % 2 !== 0) return false; // 奇数なら同勝ち数のみは不可能
    // played を考慮した再戦回避マッチング探索
    const used = {};
    function tryMatch(idx){
      while(idx<g.length && used[g[idx].id]) idx++;
      if(idx>=g.length) return true;
      for(let j=idx+1;j<g.length;j++){
        if(used[g[j].id]) continue;
        if(played[g[idx].id].indexOf(g[j].id) >= 0) continue;
        used[g[idx].id]=true; used[g[j].id]=true;
        if(tryMatch(idx+1)) return true;
        used[g[idx].id]=false; used[g[j].id]=false;
      }
      return false;
    }
    if(!tryMatch(0)) return false;
  }
  return true;
}

function buildPlayed(state, cls){
  const players = state.players[cls];
  const played = {};
  for(const p of players) played[p.id] = [];
  for(const round of state.results[cls]){
    for(const m of round){
      if(m.winner){
        played[m.p1].push(m.p2);
        played[m.p2].push(m.p1);
      }
    }
  }
  return played;
}

function verifyMinWinDiff(state, pairings, wins, sameWinsFeasible){
  // 同勝ち数で組める状態（sameWinsFeasible=true）の場合、
  // 全ペアが同勝ち数であることを確認
  if(!sameWinsFeasible) return {ok:true, skipped:true};
  for(const p of pairings){
    const w1 = wins[p.p1]||0;
    const w2 = wins[p.p2]||0;
    if(w1 !== w2){
      return {ok:false, msg:'同勝ち数で組めるはずなのに '+p.p1+'(w='+w1+')-'+p.p2+'(w='+w2+') が組まれた'};
    }
  }
  return {ok:true};
}

// ============================================================
// メイン
// ============================================================
const targetPath = process.argv[2];
if(!targetPath){
  console.error('Usage: node test_pairing_properties.js <target.html>');
  process.exit(1);
}
const jsCode = extractScripts(targetPath);

let pass=0, fail=0;
function ok(name){ console.log('  ✓ '+name); pass++; }
function ng(name, detail){ console.log('  ✗ '+name); if(detail) console.log('      '+detail); fail++; }

console.log('');
console.log('=== ペアリング性質テスト ===');

// ----------------------------------------------------------------
// テスト1: 全員1回だけ登場（複数のstate構成で200回試行）
// ----------------------------------------------------------------
console.log('');
console.log('[テスト1] 全員1回だけ登場');
{
  let allOk = true;
  let firstFail = null;
  for(let trial=0; trial<200; trial++){
    const numPlayers = [4,6,8,10][trial % 4];
    const numRounds = trial % 3; // 0,1,2 ラウンド済み
    const state = buildStateAfterRounds(numPlayers, numRounds, trial+1);
    const {api} = makeSandbox(jsCode);
    api.setState(deepClone(state));
    api.generatePairing('A');
    const pairings = api.getState().pairings.A;
    const r = verifyAllPlayersOnce(api.getState(), pairings);
    if(!r.ok){
      allOk = false; firstFail = {trial, msg:r.msg};
      break;
    }
    // ペア数が選手数の半分（偶数前提）
    if(numPlayers%2===0 && pairings.length !== numPlayers/2){
      allOk=false; firstFail={trial, msg:'ペア数不正: 期待='+(numPlayers/2)+' 実際='+pairings.length};
      break;
    }
  }
  if(allOk) ok('200試行で各選手は最大1ペア、ペア数も期待通り');
  else ng('全員1回登場: trial='+firstFail.trial+' で失敗', firstFail.msg);
}

// ----------------------------------------------------------------
// テスト2: 再戦回避（同勝ち数かつ未対戦のペアリングが可能なstateで再戦が出ないこと）
// ----------------------------------------------------------------
console.log('');
console.log('[テスト2] 再戦回避（無理ない範囲）');
{
  let allOk = true;
  let firstFail = null;
  let tested = 0;
  for(let trial=0; trial<200; trial++){
    const numPlayers = [4,6,8][trial % 3];
    const numRounds = (trial % 2) + 1; // 1,2 ラウンド済み
    const state = buildStateAfterRounds(numPlayers, numRounds, trial+100);
    const played = buildPlayed(state, 'A');
    const {api} = makeSandbox(jsCode);
    api.setState(deepClone(state));
    const wins = api.getWins('A');
    api.generatePairing('A');
    const pairings = api.getState().pairings.A;
    // この state で再戦なしのペアリングが理論上可能なら、結果も再戦なしであるべき
    // 簡易判定: グラフマッチングで再戦なし完全マッチが存在するかを探索
    function existsNonRematch(){
      const players = state.players.A;
      const used = {};
      function tryMatch(idx){
        while(idx<players.length && used[players[idx].id]) idx++;
        if(idx>=players.length) return true;
        for(let j=idx+1;j<players.length;j++){
          if(used[players[j].id]) continue;
          if(played[players[idx].id].indexOf(players[j].id) >= 0) continue;
          used[players[idx].id]=true; used[players[j].id]=true;
          if(tryMatch(idx+1)) return true;
          used[players[idx].id]=false; used[players[j].id]=false;
        }
        return false;
      }
      return tryMatch(0);
    }
    if(!existsNonRematch()) continue; // 再戦なしが不可能なケースはスキップ
    tested++;
    let hasRematch = false;
    let badPair = null;
    for(const p of pairings){
      if(played[p.p1].indexOf(p.p2) >= 0){
        hasRematch = true; badPair = p; break;
      }
    }
    if(hasRematch){
      allOk=false; firstFail={trial, msg:'再戦が発生: '+badPair.p1+' vs '+badPair.p2};
      break;
    }
  }
  if(allOk) ok('再戦なしが可能なケースで再戦を回避（'+tested+'試行検証）');
  else ng('再戦回避: trial='+firstFail.trial+' で失敗', firstFail.msg);
}

// ----------------------------------------------------------------
// テスト3: 勝数差最小性（200回試行で全回成功）
// ----------------------------------------------------------------
console.log('');
console.log('[テスト3] 勝数差最小性 — 同勝ち数で組める時は必ず同勝ち数で組まれる');
{
  let allOk = true;
  let firstFail = null;
  let tested = 0;
  for(let trial=0; trial<200; trial++){
    const numPlayers = [4,6,8,10][trial % 4];
    const numRounds = (trial % 2) + 1;
    const state = buildStateAfterRounds(numPlayers, numRounds, trial+1000);
    const played = buildPlayed(state, 'A');
    const {api} = makeSandbox(jsCode);
    api.setState(deepClone(state));
    const wins = api.getWins('A');
    const sameWinsFeasible = canPairAllSameWins(state.players.A, played, wins);
    if(!sameWinsFeasible) continue;
    tested++;
    api.generatePairing('A');
    const pairings = api.getState().pairings.A;
    const r = verifyMinWinDiff(api.getState(), pairings, wins, true);
    if(!r.ok){
      allOk=false; firstFail={trial, msg:r.msg, pairings: pairings, wins: wins};
      break;
    }
  }
  if(tested === 0){
    ng('勝数差最小性: 同勝ち数で組めるケースが0件（テスト設計問題）');
  } else if(allOk){
    ok('同勝ち数で組めるケース '+tested+' 試行 全て同勝ち数で組まれた');
  } else {
    ng('勝数差最小性: trial='+firstFail.trial+' で失敗', firstFail.msg);
  }
}

// ----------------------------------------------------------------
// テスト4: 削除クラッシュ非再現
// ----------------------------------------------------------------
console.log('');
console.log('[テスト4] 削除クラッシュ非再現（開始後・過去対局あり参加者の削除がブロックされる）');
{
  // 4-a: 大会開始前は削除可能
  {
    const state = {
      players:{A:[
        {id:'p1',name:'A',cls:'A',member:'member',grade:'ippan'},
        {id:'p2',name:'B',cls:'A',member:'member',grade:'ippan'}
      ], B:[]},
      rounds:4,
      pairings:{A:[], B:[]},
      results:{A:[], B:[]},
      started:false
    };
    const {api} = makeSandbox(jsCode);
    api.setState(deepClone(state));
    api.removePlayer('p1','A');
    const after = api.getState().players.A;
    if(after.length === 1 && after[0].id === 'p2') ok('4-a: 開始前は削除可能（confirm承認時）');
    else ng('4-a: 開始前削除が動かない', 'after.length='+after.length);
  }

  // 4-b: 開始後・過去対局あり → 削除拒否
  // ROUND-CLASS-START-005 (spec §7.5): removePlayer 二次禁止は
  //   state.started → isClassStarted(cls) (class atomic) に置換済。
  //   classes 不在の fixture は post-005 では非現実的（normalizeState 後は必ず存在）。
  //   fixture に classes[A].started=true を明示することで A クラスのみ開始済を表現する。
  {
    const state = {
      players:{A:[
        {id:'p1',name:'A',cls:'A',member:'member',grade:'ippan'},
        {id:'p2',name:'B',cls:'A',member:'member',grade:'ippan'},
        {id:'p3',name:'C',cls:'A',member:'member',grade:'ippan'},
        {id:'p4',name:'D',cls:'A',member:'member',grade:'ippan'}
      ], B:[]},
      rounds:4,
      pairings:{A:[{p1:'p2',p2:'p3',winner:null},{p1:'p4',p2:'',winner:null}], B:[]}, // p1 は進行中ペアリング外
      results:{A:[
        [{p1:'p1',p2:'p2',winner:'p1'},{p1:'p3',p2:'p4',winner:'p3'}]
      ], B:[]},
      started:true,
      classes:[
        {id:'A',name:'Aクラス',started:true},
        {id:'B',name:'Bクラス',started:false}
      ]
    };
    const {api} = makeSandbox(jsCode);
    api.setState(deepClone(state));
    api.removePlayer('p1','A');
    const after = api.getState().players.A;
    if(after.length === 4) ok('4-b: 開始後・過去対局あり → 削除拒否');
    else ng('4-b: 削除拒否されていない', 'after.length='+after.length);
  }

  // 4-c: 開始後・過去対局なし → 削除可能（参加者を増やしただけのケース）
  {
    const state = {
      players:{A:[
        {id:'p1',name:'A',cls:'A',member:'member',grade:'ippan'},
        {id:'p2',name:'B',cls:'A',member:'member',grade:'ippan'},
        {id:'p3',name:'C',cls:'A',member:'member',grade:'ippan'},
        {id:'p4',name:'D',cls:'A',member:'member',grade:'ippan'},
        {id:'p5',name:'E',cls:'A',member:'member',grade:'ippan'} // 後から追加され過去対局なし
      ], B:[]},
      rounds:4,
      pairings:{A:[{p1:'p1',p2:'p2',winner:null},{p1:'p3',p2:'p4',winner:null}], B:[]},
      results:{A:[
        [{p1:'p1',p2:'p2',winner:'p1'},{p1:'p3',p2:'p4',winner:'p3'}]
      ], B:[]},
      started:true,
      classes:[
        {id:'A',name:'Aクラス',started:true},
        {id:'B',name:'Bクラス',started:false}
      ]
    };
    const {api} = makeSandbox(jsCode);
    api.setState(deepClone(state));
    api.removePlayer('p5','A');
    const after = api.getState().players.A;
    if(after.length === 4) ok('4-c: 開始後・過去対局なし → 削除可能');
    else ng('4-c: 開始後・対局なしで削除が拒否された', 'after.length='+after.length);
  }

  // 4-d: 削除拒否されていれば、calcFinal は state.players の整合が保たれてクラッシュしない
  {
    const state = {
      players:{A:[
        {id:'p1',name:'A',cls:'A',member:'member',grade:'ippan'},
        {id:'p2',name:'B',cls:'A',member:'member',grade:'ippan'},
        {id:'p3',name:'C',cls:'A',member:'member',grade:'ippan'},
        {id:'p4',name:'D',cls:'A',member:'member',grade:'ippan'}
      ], B:[]},
      rounds:4,
      pairings:{A:[], B:[]},
      results:{A:[
        [{p1:'p1',p2:'p2',winner:'p1'},{p1:'p3',p2:'p4',winner:'p3'}]
      ], B:[]},
      started:true,
      classes:[
        {id:'A',name:'Aクラス',started:true},
        {id:'B',name:'Bクラス',started:false}
      ]
    };
    const {api} = makeSandbox(jsCode);
    api.setState(deepClone(state));
    api.removePlayer('p1','A'); // ブロックされる
    let crashed = false;
    try { api.calcFinal('A'); } catch(e){ crashed = true; }
    if(!crashed) ok('4-d: 削除ブロック後 calcFinal はクラッシュしない');
    else ng('4-d: calcFinal がクラッシュした');
  }
}

// ----------------------------------------------------------------
// テスト5: 三すくみ — A・B・C 同勝数で直接対決が循環しても calcFinal はクラッシュせず順位は permutation
// ----------------------------------------------------------------
console.log('');
console.log('[テスト5] 三すくみ順位 (A→B→C→A 循環)');
{
  // 3 人で総当たり: 全員 1勝1敗
  // p1 が p2 に勝、p2 が p3 に勝、p3 が p1 に勝 → サイクル
  // A=B=C 全員同じ。直接対決は循環でソート関数は推移性を満たさないが、結果は permutation を返すべき
  const state = {
    players:{A:[
      {id:'p1',name:'A',cls:'A',member:'member',grade:'ippan'},
      {id:'p2',name:'B',cls:'A',member:'member',grade:'ippan'},
      {id:'p3',name:'C',cls:'A',member:'member',grade:'ippan'}
    ], B:[]},
    rounds:3,
    pairings:{A:[], B:[]},
    results:{A:[
      [{p1:'p1',p2:'p2',winner:'p1'}],
      [{p1:'p2',p2:'p3',winner:'p2'}],
      [{p1:'p3',p2:'p1',winner:'p3'}]
    ], B:[]},
    started:true
  };
  const {api} = makeSandbox(jsCode);
  api.setState(deepClone(state));
  let crashed=false; let result=null;
  try{ result = api.calcFinal('A'); }catch(e){ crashed=true; console.log('      例外: '+e.message); }
  if(crashed){ ng('5: calcFinal が三すくみでクラッシュ'); }
  else if(!Array.isArray(result) || result.length!==3){
    ng('5: 戻り値長さ異常', 'len='+(result && result.length));
  } else {
    const ids = result.map(function(r){return r.p.id;}).sort();
    if(ids[0]==='p1' && ids[1]==='p2' && ids[2]==='p3'){
      ok('5: 三すくみで calcFinal は3人 permutation を返す ('+result.map(function(r){return r.p.name;}).join('→')+')');
    } else {
      ng('5: 3人が揃っていない', JSON.stringify(ids));
    }
  }
}

console.log('');
console.log('=== 結果: PASS='+pass+', FAIL='+fail+' ===');
process.exit(fail===0 ? 0 : 1);
