#!/usr/bin/env node
// RESET-MENU (当日第2弾⑩後半): 危険な全リセット/進行リセットを ⋯メニュー配下へ退避（誤タップ防止）。
//   id は不変＝既存 resetAll/resetTournamentProgressOnly 結線を温存。menu 開閉のみ追加。
const fs=require('fs');
const target=process.argv[2]||'shogi_v4.html';
const RAW=fs.readFileSync(target,'utf8');
function scripts(){const re=/<script[^>]*>([\s\S]*?)<\/script>/g;let m,o='';while((m=re.exec(RAW))!==null)o+=m[1]+'\n';return o;}
function node(){return {nodeType:1,id:'',className:'',value:'',innerHTML:'',style:{display:''},childNodes:[],_attrs:{},
  appendChild(c){this.childNodes.push(c);return c;},setAttribute(k,v){this._attrs[k]=String(v);},getAttribute(k){return (k in this._attrs)?this._attrs[k]:null;},
  addEventListener(){},removeEventListener(){},querySelector(){return null;},querySelectorAll(){return[];},focus(){},remove(){}};}
function makeEnv(){
  const els={};
  const doc={getElementById(id){if(!els[id]){const x=node();x.id=id;els[id]=x;}return els[id];},
    createElement(){return node();},createTextNode(t){return{nodeType:3,textContent:String(t==null?'':t)};},
    addEventListener(){},body:node(),head:node(),querySelector(){return null;},querySelectorAll(){return[];}};
  const win={innerWidth:1024,addEventListener(){},scrollTo(){},matchMedia(){return{matches:false,addEventListener(){}};}};
  const fn=new Function('document','window','localStorage','crypto','alert','confirm','prompt','console','Promise','setTimeout','navigator',
    scripts()+';return {toggleDangerMenu:toggleDangerMenu};');
  const env=fn(doc,win,{getItem:()=>null,setItem(){},removeItem(){}},{randomUUID:()=>'0'},()=>{},()=>true,()=>'',{log(){},warn(){},error(){}},Promise,cb=>0,{onLine:true});
  return {env,els};
}
let pass=0,fail=0;const ok=(c,m)=>{c?pass++:(fail++,console.log('  FAIL: '+m));};

console.log('=== マークアップ（RAW） ===');
ok(RAW.indexOf('id="dangerMenuBtn"')>=0,'M1 ⋯メニュー開閉ボタン');
ok(/id="dangerMenu"[\s\S]*?display:none/.test(RAW),'M2 メニューは既定で非表示');
ok(/id="dangerMenu"[\s\S]*?id="resetProgressBtn"[\s\S]*?id="resetBtn"/.test(RAW),'M3 メニュー内に両リセットを内包（id 不変）');
ok(RAW.indexOf('id="resetBtn"')>=0 && RAW.indexOf('id="resetProgressBtn"')>=0,'M4 既存 id を保持（resetAll/resetProgress 結線温存）');
// ヘッダ直下に裸の危険ボタンが残っていない（メニュー化）= dangerMenu より前に resetBtn が出ない
ok(RAW.indexOf('id="dangerMenuWrap"')>=0 && RAW.indexOf('id="dangerMenuWrap"')<RAW.indexOf('id="resetBtn"'),'M5 危険ボタンは dangerMenuWrap 配下に退避');
ok(/aria-haspopup="true"/.test(RAW)&&/aria-expanded=/.test(RAW),'M6 a11y 属性（haspopup/expanded）');

console.log('=== 開閉ロジック ===');
ok(/function toggleDangerMenu\(/.test(RAW)&&/function bindDangerMenuEvents\(/.test(RAW),'L1 開閉/結線関数');
ok(/bindHeaderEvents\(\)\{[\s\S]*?bindDangerMenuEvents\(\)/.test(RAW),'L2 bindHeaderEvents から結線呼び出し');
var E=makeEnv();
E.env.toggleDangerMenu();   // 既定 display='' は閉扱い→開く（getElementById が遅延生成）
ok(E.els['dangerMenu'].style.display==='block','L3 初回トグルで開く');
ok(E.els['dangerMenuBtn'].getAttribute('aria-expanded')==='true','L4 aria-expanded=true');
E.env.toggleDangerMenu();
ok(E.els['dangerMenu'].style.display==='none','L5 再トグルで閉じる');
E.env.toggleDangerMenu(true);
ok(E.els['dangerMenu'].style.display==='none'&&E.els['dangerMenuBtn'].getAttribute('aria-expanded')==='false','L6 forceClose で確実に閉じる');

console.log('RESET-MENU: PASS='+pass+' FAIL='+fail);
process.exit(fail===0?0:1);
