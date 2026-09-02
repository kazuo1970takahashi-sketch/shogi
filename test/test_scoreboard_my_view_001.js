#!/usr/bin/env node
// LIVE-BROADCAST-001 Phase 2 / SCOREBOARD-MY-VIEW-001:
//   live ルート（?live=<slug>#scoreboard・公開スナップショット描画）＋対局者を探す＋個人ビュー。
//   設計 = docs/specs/20260704_live_broadcast_001_participant_realtime_design.md（§5.2/§6 Phase2）
//        / docs/specs/20260704_scoreboard_my_view_001_design.md（§3〜§7）。
//   検証:
//     G. GOLDEN: buildScoreboardClassTableHtml は focusId 未指定時に従来出力と完全一致（sha256 固定）
//     M. MY-VIEW 純 helper（sbFindCurrentMatch / sbOpponentsByRound）と個人ビュー/検索の build
//     L. live ルート（sbLiveSlug / sbIsLiveRoute / sbSetLiveEnvelope / renderScoreboard fixture 描画）
const fs=require('fs');
const crypto=require('crypto');
const target=process.argv[2]||'shogi_v4.html';
const RAW=fs.readFileSync(target,'utf8');
function scripts(){const re=/<script[^>]*>([\s\S]*?)<\/script>/g;let m,o='';while((m=re.exec(RAW))!==null)o+=m[1]+'\n';return o;}
function node(){return {nodeType:1,id:'',className:'',value:'',innerHTML:'',textContent:'',disabled:false,style:{},childNodes:[],
  appendChild(c){this.childNodes.push(c);return c;},setAttribute(){},getAttribute(){return null;},
  addEventListener(){},removeEventListener(){},querySelector(){return null;},querySelectorAll(){return[];},
  focus(){},remove(){},insertBefore(){},removeChild(){}};}
function makeEnv(loc){
  const store={};
  const ls={getItem:k=>(k in store?store[k]:null),setItem:(k,v)=>{store[k]=String(v);},removeItem:k=>{delete store[k];}};
  const els={};
  const doc={getElementById(id){if(!els[id]){const x=node();x.id=id;els[id]=x;}return els[id];},
    createElement(){return node();},createTextNode(t){return{nodeType:3,textContent:String(t==null?'':t)};},
    addEventListener(){},body:node(),head:node(),querySelector(){return null;},querySelectorAll(){return[];}};
  const win={innerWidth:1024,addEventListener(){},scrollTo(){},matchMedia(){return{matches:false,addEventListener(){}};},isSecureContext:true};
  const nav={onLine:true,clipboard:{writeText:function(){return Promise.resolve();}}};
  const fn=new Function('document','window','localStorage','crypto','alert','confirm','prompt','console','Promise','setTimeout','navigator','location',
    scripts()+';return {normalizeState:normalizeState,buildPublicLiveSnapshot:buildPublicLiveSnapshot,'
    +'buildScoreboardClassTableHtml:buildScoreboardClassTableHtml,'
    +'buildScoreboardPlayerViewHtml:buildScoreboardPlayerViewHtml,'
    +'buildScoreboardFinderResultsHtml:buildScoreboardFinderResultsHtml,'
    +'buildScoreboardFinderHtml:buildScoreboardFinderHtml,'
    +'sbFindCurrentMatch:sbFindCurrentMatch,sbOpponentsByRound:sbOpponentsByRound,'
    +'sbLiveSlug:sbLiveSlug,sbIsLiveRoute:sbIsLiveRoute,sbSetLiveEnvelope:sbSetLiveEnvelope,'
    +'renderScoreboard:renderScoreboard,sbFormatUpdateTime:sbFormatUpdateTime,'
    +'_set:function(v){state=v;},_get:function(){return state;},'
    +'_setSearch:function(v){_sbSearch=v;},_setFocus:function(c,i){_sbFocusCls=c;_sbFocusId=i;},'
    +'_view:function(){return document.getElementById("scoreboard-view");}};');
  return fn(doc,win,ls,{randomUUID:()=>'0'},function(){},()=>true,()=>'',{log(){},warn(){},error(){}},Promise,cb=>0,nav,
    loc||{search:'',hash:''});
}
let pass=0,fail=0;const ok=(c,m)=>{c?pass++:(fail++,console.log('  FAIL: '+m));};
function sha(s){return crypto.createHash('sha256').update(s,'utf8').digest('hex');}

// 架空 fixture（4名・3回戦中2回戦終了・3回戦手合せ確定済み）。
function makeFix(){
  return {
    rounds:3,
    started:true,
    report:{title:'架空テスト大会'},
    classes:[{id:'A',name:'架空A級',started:true}],
    players:{A:[
      {id:'p1',name:'架空 太郎',yomi:'かくう たろう',entry_no:1},
      {id:'p2',name:'架空 次郎',yomi:'かくう じろう',entry_no:2},
      {id:'p3',name:'架空 三郎',entry_no:3},
      {id:'p4',name:'架空 四郎',entry_no:4}
    ]},
    results:{A:[
      [{p1:'p1',p2:'p2',winner:'p1'},{p1:'p3',p2:'p4',winner:'p4'}],
      [{p1:'p1',p2:'p4',winner:'p4'},{p1:'p2',p2:'p3',winner:'p2'}]
    ]},
    pairings:{A:[{p1:'p4',p2:'p2',winner:null},{p1:'p1',p2:'p3',winner:null}]}
  };
}

// ============================================================
// G. GOLDEN: focusId 未指定時の buildScoreboardClassTableHtml 出力固定
// ============================================================
console.log('=== G. GOLDEN（focusId 未指定＝従来出力と完全一致） ===');
const GOLDEN_SHA256='436e7cc32b256f7fd9be47a12fca59fe47fce9b01b81ec1e587201f723d1fa93';
{
  const E=makeEnv();
  E._set(E.normalizeState(makeFix()));
  const h0=E.buildScoreboardClassTableHtml('A');
  ok(sha(h0)===GOLDEN_SHA256,'G1 GOLDEN 固定 fixture の sha256 一致（実測 '+sha(h0)+'）');
  ok(E.buildScoreboardClassTableHtml('A',undefined,undefined)===h0,'G2 focusId=undefined 明示でも同一');
  ok(h0.indexOf('data-sbpid')===-1&&h0.indexOf('sb-row-tap')===-1,'G3 未指定時に tap 属性を含まない');
  const h1=E.buildScoreboardClassTableHtml('A',undefined,null);
  ok(h1.indexOf('data-sbpid="p1"')!==-1&&h1.indexOf('sb-row-tap')!==-1,'G4 focusId=null で行タップ属性');
  ok(h1.indexOf('sb-row-me')===-1,'G5 focusId=null はハイライト無し');
  const h2=E.buildScoreboardClassTableHtml('A',undefined,'p1');
  ok(h2.indexOf('sb-row-me')!==-1,'G6 focusId=p1 で選択行ハイライト');
}

// ============================================================
// M. MY-VIEW（純 helper / 個人ビュー / 検索）
// ============================================================
console.log('=== M. MY-VIEW ===');
{
  const E=makeEnv();
  E._set(E.normalizeState(makeFix()));
  const cur=E.sbFindCurrentMatch('A','p1');
  // TABLE-NO-REMOVE-001 (#941): 戻り値から table を落とした（唯一の読み手だった個人ビューが使わなくなったため）。
  ok(cur&&cur.oppId==='p3','M1 sbFindCurrentMatch: p1 → p3');
  ok(cur&&!('table' in cur),'M1b 戻り値に table を含めない（読み手のいない派生値を残さない）');
  ok(E.sbFindCurrentMatch('A','zzz')===null,'M2 sbFindCurrentMatch: 不在 → null');
  const hist=E.sbOpponentsByRound('A','p1');
  ok(hist.length===2&&hist[0].round===1&&hist[0].won===true&&hist[0].oppId==='p2'
    &&hist[1].round===2&&hist[1].won===false&&hist[1].oppId==='p4','M3 sbOpponentsByRound: p1 の2局');
  const pv=E.buildScoreboardPlayerViewHtml('A','p1');
  ok(/架空 太郎/.test(pv),'M4 個人ビューに氏名');
  ok(/No\.0?1/.test(pv)&&/架空A級/.test(pv),'M5 個人ビューにクラス・No');
  ok(/順位 <b>\d+<\/b> 位／4名/.test(pv),'M6 順位表示');
  ok(/<b>1<\/b> 勝 <b>1<\/b> 敗/.test(pv),'M7 勝敗表示');
  // #941: 卓番号を出さなくなった。★生きている命題は「次の対戦で**相手が誰か**が分かる」こと。
  ok(/次の対戦・3回戦/.test(pv)&&/架空 三郎/.test(pv),'M8 次の対戦（回戦・相手名）');
  ok(!/卓/.test(pv),'M8b 個人ビューに卓番号は出ない');
  ok(/1回戦/.test(pv)&&/2回戦/.test(pv)&&/架空 次郎/.test(pv)&&/架空 四郎/.test(pv),'M9 これまでの対戦（相手名）');
  ok(/← 星取表へ/.test(pv)&&!/運営画面/.test(pv),'M10 戻るは一覧まで（運営導線なし）');
  ok(E.buildScoreboardPlayerViewHtml('A','zzz')==='','M11 不在対局者 → 空文字（一覧へ復帰）');
}
{
  const E=makeEnv();
  const fx=makeFix();
  fx.results.A.push([{p1:'p4',p2:'p2',winner:'p4'},{p1:'p1',p2:'p3',winner:'p1'}]);
  fx.pairings.A=[];
  E._set(E.normalizeState(fx));
  const pv=E.buildScoreboardPlayerViewHtml('A','p1');
  ok(/全対局が終了しました（最終結果）/.test(pv),'M12 全回戦終了の文言');
}
{
  const E=makeEnv();
  const fx=makeFix();
  fx.players.A.push({id:'p5',name:'架空 五郎',entry_no:5});
  E._set(E.normalizeState(fx));
  const pv=E.buildScoreboardPlayerViewHtml('A','p5');
  ok(/まだ決まっていません/.test(pv),'M13 手合せ未定の文言（断定しない）');
  ok(/まだ対局がありません/.test(pv),'M14 対局履歴なしの文言');
}
{
  const E=makeEnv();
  const fx=makeFix();
  fx.players.A.push({id:'p6',name:'<b>悪意</b>',yomi:'<i>x</i>',entry_no:6});
  E._set(E.normalizeState(fx));
  const pv=E.buildScoreboardPlayerViewHtml('A','p6');
  ok(pv.indexOf('<b>悪意</b>')===-1&&pv.indexOf('&lt;b&gt;')!==-1,'M15 個人ビュー氏名 escape');
  E._setSearch('悪意');
  const fr=E.buildScoreboardFinderResultsHtml(['A']);
  ok(fr.indexOf('<b>悪意</b>')===-1&&fr.indexOf('&lt;b&gt;')!==-1,'M16 検索候補 escape');
}
{
  const E=makeEnv();
  E._set(E.normalizeState(makeFix()));
  E._setSearch('');
  ok(E.buildScoreboardFinderResultsHtml(['A'])==='','M17 空検索 → 候補なし（従来表示）');
  E._setSearch('架空');
  const fr1=E.buildScoreboardFinderResultsHtml(['A']);
  ok(/架空 太郎/.test(fr1)&&/架空 四郎/.test(fr1),'M18 氏名部分一致');
  E._setSearch('1');
  const fr2=E.buildScoreboardFinderResultsHtml(['A']);
  ok(/架空 太郎/.test(fr2)&&!/架空 次郎/.test(fr2),'M19 番号前方一致（1 → No.1 のみ）');
  E._setSearch('かくう じ');
  const fr3=E.buildScoreboardFinderResultsHtml(['A']);
  ok(/架空 次郎/.test(fr3)&&!/架空 太郎/.test(fr3),'M20 よみ部分一致');
  E._setSearch('zzz');
  ok(/見つかりませんでした/.test(E.buildScoreboardFinderResultsHtml(['A'])),'M21 該当なし文言');
  E._setSearch('架空');
  const fh=E.buildScoreboardFinderHtml(['A']);
  ok(/sb-search/.test(fh)&&/type="search"/.test(fh)&&/value="架空"/.test(fh),'M22 検索フィールド（検索語保持）');
}

// ============================================================
// L. live ルート（?live=<slug>#scoreboard・fixture 描画）
// ============================================================
console.log('=== L. live ルート ===');
{
  const E=makeEnv({search:'?live=fake-slug-abc123',hash:'#scoreboard'});
  ok(E.sbLiveSlug()==='fake-slug-abc123','L1 sbLiveSlug が slug を返す');
  ok(E.sbIsLiveRoute()===true,'L2 live ルート判定 true');
}
{
  const E=makeEnv({search:'?live=abc',hash:''});
  ok(E.sbIsLiveRoute()===false,'L3 #scoreboard 無しは live ルートでない');
}
{
  const E=makeEnv({search:'',hash:'#scoreboard'});
  ok(E.sbLiveSlug()===''&&E.sbIsLiveRoute()===false,'L4 ?live 無しは通常閲覧ルート');
}
{
  const E=makeEnv({search:'?live=fake-slug-abc123',hash:'#scoreboard'});
  E.renderScoreboard();
  const v=E._view();
  ok(/ライブ配信のデータを待っています/.test(v.innerHTML),'L5 envelope 未受信は待機表示');
  const env={slug:'fake-slug-abc123',version:3,updated_at:'2026-07-04T05:12:30Z',
    payload:E.buildPublicLiveSnapshot(makeFix())};
  E.sbSetLiveEnvelope(env);
  const html=v.innerHTML;
  ok(/架空テスト大会/.test(html),'L6 meta.title がヘッダに出る（配信データ源）');
  ok(/架空 太郎/.test(html)&&/架空A級/.test(html),'L7 星取表が公開スナップショットから描ける');
  const expected=E.sbFormatUpdateTime(new Date(Date.parse(env.updated_at)));
  ok(html.indexOf('最終更新：'+expected)!==-1,'L8 最終更新＝envelope.updated_at（DB write 時刻）');
  ok(/ライブ配信/.test(html),'L9 live 用の注記');
  ok(!/saveBtn|resetBtn|loadBtn|運営画面へ/.test(html),'L10 運営UI/戻り導線が出ない（read-only）');
  ok(/sb-search/.test(html),'L11 live でも対局者検索が使える（MY-VIEW 同梱）');
  const st=E._get();
  ok(!st||!st.report||st.report.title!=='架空テスト大会','L12 global state を汚染しない（withSourceState 復元）');
  E.sbSetLiveEnvelope(null);
  ok(/ライブ配信のデータを待っています/.test(v.innerHTML),'L13 不正 envelope は破棄して待機へ（fail-soft）');
}
{
  const E=makeEnv({search:'?live=fake-slug-abc123',hash:'#scoreboard'});
  const env={slug:'fake-slug-abc123',version:1,updated_at:'2026-07-04T05:12:30Z',
    payload:E.buildPublicLiveSnapshot(makeFix())};
  E.sbSetLiveEnvelope(env);
  E._setFocus('A','p1');
  E.renderScoreboard();
  const html=E._view().innerHTML;
  ok(/次の対戦・3回戦/.test(html)&&/架空 三郎/.test(html),'L14 live でも個人ビュー（次の対戦・相手名）');
  ok(/← 星取表へ/.test(html),'L15 live 個人ビューから一覧へ戻れる');
}

console.log('SCOREBOARD-MY-VIEW/LIVE-Phase2: pass='+pass+' fail='+fail);
process.exit(fail===0?0:1);
