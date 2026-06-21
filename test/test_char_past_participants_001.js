#!/usr/bin/env node
// CHARACTERIZATION: 過去参加者パネル（buildPastParticipantsPanelHtml / matchesPastParticipantQuery）。
//   Issue #283 Phase A deliverable 3。被覆マップで「被覆ゼロ」と判定された過去参加者パネルの
//   描画・検索判定の分岐を現状挙動として固定する。
//
//   対象（shogi_v4.html）:
//     - matchesPastParticipantQuery(member, query): 氏名（漢字部分一致）OR ふりがな一致 の判定（純）。
//     - buildPastParticipantsPanelHtml(master, filter, yomiRow, quickFilter): 過去参加者一覧 HTML。
//         deleted 除外・検索/50音タブ/クイックフィルタ・グローバル state.players による
//         A済/B済/未エントリーの3セクション分割・XSS エスケープ。
//   quickFilter は今日非依存の no_yomi / 不正値のみ検証（recent_last/within_3mo は todayYmd 依存のため
//   本ファイルでは不採用＝FixedDate を持つ test_golden_master_001.js 側で byte 固定する）。
//   B-4a（#293）追加: 50音「他」/特定行のフィルタ・並び順（最終参加日降順）・不正 quickFilter・
//   検索 value と member id の XSS エスケープ・C 以降クラス在籍の現状 section（「C 落ち」＝未修正仕様）・
//   last_attended 空・全角空白検索。すべて今日非依存・完全架空。shogi_v4.html は一切変更しない。

const fs = require('fs');

function extractScripts(p){
  const html = fs.readFileSync(p, 'utf8');
  const scripts = [];
  const re = /<script[^>]*>([\s\S]*?)<\/script>/g;
  let m;
  while((m=re.exec(html))!==null)scripts.push(m[1]);
  return scripts.join('\n');
}

function makeContext(){
  function makeNode(tag){
    return { nodeType:1, tagName:String(tag||'div'), id:'', className:'', value:'', innerHTML:'',
      style:{}, _attrs:{}, childNodes:[], appendChild:function(c){ this.childNodes.push(c); return c; },
      setAttribute:function(){}, getAttribute:function(){ return null; }, addEventListener:function(){},
      querySelector:function(){ return null; }, querySelectorAll:function(){ return []; } };
  }
  var elements={};
  var docMock={ getElementById:function(id){ if(!elements[id]){ var n=makeNode('div'); n.id=id; elements[id]=n; } return elements[id]; },
    createElement:function(tag){ return makeNode(tag); }, createTextNode:function(t){ return {nodeType:3,textContent:String(t==null?'':t)}; },
    body:makeNode('body'), addEventListener:function(){}, querySelector:function(){ return null; }, querySelectorAll:function(){ return []; } };
  var winMock={ innerWidth:1024, addEventListener:function(){}, open:function(){ return {focus:function(){},print:function(){},close:function(){}}; } };
  var localStorageMock={ _:{}, getItem:function(k){ return (k in this._)?this._[k]:null; }, setItem:function(k,v){ this._[k]=String(v); }, removeItem:function(k){ delete this._[k]; } };
  return { document:docMock, window:winMock, localStorage:localStorageMock };
}

const targetPath = process.argv[2];
if(!targetPath){ console.error('Usage: node test_char_past_participants_001.js <html>'); process.exit(1); }

function loadEnv(){
  const ctx = makeContext();
  const js = extractScripts(targetPath);
  const cryptoMock = { randomUUID(){ return '00000000-0000-0000-0000-000000000000'; } };
  const fn = new Function(
    'document','window','localStorage','crypto','alert','confirm','prompt','FileReader','Blob','URL','console','Promise','setTimeout',
    `${js};
     return {
       buildPastParticipantsPanelHtml:buildPastParticipantsPanelHtml,
       matchesPastParticipantQuery:matchesPastParticipantQuery,
       _setState:function(s){ state=s; },
       _getState:function(){ return state; }
     };`
  );
  return fn(
    ctx.document, ctx.window, ctx.localStorage, cryptoMock,
    function(){}, function(){ return true; }, function(){ return ''; },
    function(){}, function(){ return null; }, {createObjectURL:function(){ return 'blob:mock'; }, revokeObjectURL:function(){}},
    {log(){},warn(){},error(){}}, Promise, function(){ return 0; }
  );
}

let pass=0, fail=0;
function ok(msg){ pass++; if(process.env.VERBOSE) console.log('  ✓ '+msg); }
function ng(msg){ fail++; console.error('  ✗ '+msg); }
function assert(cond,msg){ cond?ok(msg):ng(msg); }
function has(html,s){ return html.indexOf(s)>=0; }

const env = loadEnv();

function mkMaster(){
  return { schema_version:1, members:[
    {id:'m-001',name:'架空一郎',yomi:'かくいちろう',last_class:'A',last_attended:'2026-05-10',first_attended:'2025-01-01',attendance_count:3,tournament_ids:['t1','t2','t3'],deleted:false,deleted_at:null,note:'',member:'member',grade:'ippan',city:''},
    {id:'m-002',name:'架空二郎',yomi:'',last_class:'B',last_attended:'2026-04-10',first_attended:'2025-02-01',attendance_count:1,tournament_ids:['t1'],deleted:false,deleted_at:null,note:'',member:'other',grade:'ippan',city:''},
    {id:'m-003',name:'架空三郎',yomi:'かくうさぶろう',last_class:'A',last_attended:'2026-06-01',first_attended:'2024-12-01',attendance_count:2,tournament_ids:['t2','t3'],deleted:false,deleted_at:null,note:'',member:'member',grade:'ippan',city:''},
    {id:'m-del',name:'架空削除済',yomi:'かくうさくじょ',last_class:'A',last_attended:'2026-01-01',first_attended:'2025-01-01',attendance_count:1,tournament_ids:['t1'],deleted:true,deleted_at:'2026-02-01',note:'',member:'member',grade:'ippan',city:''}
  ]};
}

// =====================================================================
// matchesPastParticipantQuery（検索判定・純）
// =====================================================================
(function(){
  var m1 = mkMaster().members[0]; // 架空一郎 / かくいちろう
  assert(env.matchesPastParticipantQuery(m1,'')===true, 'PQ1 空クエリは全員ヒット（true）');
  assert(env.matchesPastParticipantQuery(m1,'一郎')===true, 'PQ2 氏名の部分一致（漢字）でヒット');
  assert(env.matchesPastParticipantQuery(m1,'いちろう')===true, 'PQ3 ふりがな（ひらがな）部分一致でヒット');
  assert(env.matchesPastParticipantQuery(m1,'イチロウ')===true, 'PQ4 カタカナ入力も正規化されて yomi にヒット');
  assert(env.matchesPastParticipantQuery(m1,'存在しない')===false, 'PQ5 該当なしは false');
})();

// =====================================================================
// buildPastParticipantsPanelHtml（一覧 HTML）
// =====================================================================

// ---- PB1: 空マスタ → 専用メッセージ ----
(function(){
  env._setState({players:{A:[],B:[]}});
  var html = env.buildPastParticipantsPanelHtml({schema_version:1,members:[]}, '', 'all', null);
  assert(has(html,'支部マスタが空です'), 'PB1-1 members 空 → 「支部マスタが空です」');
})();

// ---- PB2: 該当なし検索 → 専用メッセージ ----
(function(){
  env._setState({players:{A:[],B:[]}});
  var html = env.buildPastParticipantsPanelHtml(mkMaster(), '存在しない名前', 'all', null);
  assert(has(html,'該当する参加者がいません'), 'PB2-1 ヒット0 → 「該当する参加者がいません」');
})();

// ---- PB3: 全件表示（filter 空）→ 非削除メンバー名が並ぶ ----
(function(){
  env._setState({players:{A:[],B:[]}});
  var html = env.buildPastParticipantsPanelHtml(mkMaster(), '', 'all', null);
  assert(has(html,'架空一郎') && has(html,'架空二郎') && has(html,'架空三郎'), 'PB3-1 非削除の3名が表示される');
})();

// ---- PB4: 削除済みメンバーは除外 ----
(function(){
  env._setState({players:{A:[],B:[]}});
  var html = env.buildPastParticipantsPanelHtml(mkMaster(), '', 'all', null);
  assert(!has(html,'架空削除済'), 'PB4-1 deleted=true のメンバーは一覧に出ない');
})();

// ---- PB5: 検索で絞り込み ----
(function(){
  env._setState({players:{A:[],B:[]}});
  var html = env.buildPastParticipantsPanelHtml(mkMaster(), '三郎', 'all', null);
  assert(has(html,'架空三郎') && !has(html,'架空一郎'), 'PB5-1 「三郎」検索で架空三郎のみ・架空一郎は出ない');
})();

// ---- PB6: 50音タブの active マークアップ（yomiRow 反映）----
(function(){
  env._setState({players:{A:[],B:[]}});
  var html = env.buildPastParticipantsPanelHtml(mkMaster(), '', 'ka', null);
  assert(has(html,'pp-yomi-tab active" data-row="ka"'), 'PB6-1 yomiRow=ka で か行タブが active');
})();

// ---- PB7: 検索ボックスの value は HTML エスケープされる ----
(function(){
  env._setState({players:{A:[],B:[]}});
  var html = env.buildPastParticipantsPanelHtml(mkMaster(), '<x>', 'all', null);
  assert(has(html,'value="&lt;x&gt;"'), 'PB7-1 検索 value は &lt;x&gt; にエスケープ');
  assert(!has(html,'value="<x>"'), 'PB7-2 生の <x> は value に出ない');
})();

// ---- PB8: no_yomi クイックフィルタ（今日非依存）→ ふりがな空のみ ----
(function(){
  env._setState({players:{A:[],B:[]}});
  var html = env.buildPastParticipantsPanelHtml(mkMaster(), '', 'all', 'no_yomi');
  assert(has(html,'架空二郎') && !has(html,'架空一郎') && !has(html,'架空三郎'), 'PB8-1 no_yomi で yomi 空の架空二郎のみ');
})();

// ---- PB9: グローバル state.players による A済/B済/未エントリーの3セクション分割 ----
(function(){
  // m-001 を A クラス登録中・m-002 を B クラス登録中 とする
  env._setState({players:{A:[{id:'rp1',name:'架空一郎',member_id:'m-001'}],B:[{id:'rp2',name:'架空二郎',member_id:'m-002'}]}});
  var html = env.buildPastParticipantsPanelHtml(mkMaster(), '', 'all', null);
  assert(has(html,'Aクラスエントリー済 (1名)'), 'PB9-1 A 登録中の member は「Aクラスエントリー済 (1名)」');
  assert(has(html,'Bクラスエントリー済 (1名)'), 'PB9-2 B 登録中の member は「Bクラスエントリー済 (1名)」');
  assert(has(html,'未エントリー (1名)'), 'PB9-3 未登録の架空三郎は「未エントリー (1名)」');
})();

// ---- PB10: メンバー氏名の XSS エスケープ ----
(function(){
  env._setState({players:{A:[],B:[]}});
  var master = {schema_version:1,members:[
    {id:'m-x',name:'<b>架空</b>',yomi:'',last_class:'A',last_attended:'2026-01-01',first_attended:'2025-01-01',attendance_count:1,tournament_ids:['t1'],deleted:false,deleted_at:null,note:'',member:'member',grade:'ippan',city:''}
  ]};
  var html = env.buildPastParticipantsPanelHtml(master, '', 'all', null);
  assert(has(html,'&lt;b&gt;架空&lt;/b&gt;'), 'PB10-1 氏名の <b> はエスケープされて出力');
  assert(!has(html,'<b>架空</b>'), 'PB10-2 生の <b>架空</b> は出力されない（XSS 安全）');
})();

// ---- PB11: 50音「他」タブ（yomiRow='other'）→ ふりがな空 + other 行のみ・active マークアップ ----
(function(){
  env._setState({players:{A:[],B:[]}});
  var html = env.buildPastParticipantsPanelHtml(mkMaster(), '', 'other', null);
  assert(has(html,'pp-yomi-tab active" data-row="other"'), 'PB11-1 yomiRow=other で「他」タブが active');
  assert(has(html,'架空二郎'), 'PB11-2 ふりがな空（架空二郎）は「他」に含まれる');
  assert(!has(html,'架空一郎') && !has(html,'架空三郎'), 'PB11-3 か行（かく…）の架空一郎/三郎は「他」に出ない');
})();

// ---- PB12: 50音「か」タブ → か行（かく…）の member のみ ----
(function(){
  env._setState({players:{A:[],B:[]}});
  var html = env.buildPastParticipantsPanelHtml(mkMaster(), '', 'ka', null);
  assert(has(html,'pp-yomi-tab active" data-row="ka"'), 'PB12-1 yomiRow=ka で「か」タブが active');
  assert(has(html,'架空一郎') && has(html,'架空三郎'), 'PB12-2 か行の架空一郎/三郎が表示される');
  assert(!has(html,'架空二郎'), 'PB12-3 ふりがな空の架空二郎は「か」タブに出ない');
})();

// ---- PB13: 並び順（「全」タブ＝最終参加日 降順。section 分割前のソートを特性化）----
(function(){
  env._setState({players:{A:[],B:[]}});
  var html = env.buildPastParticipantsPanelHtml(mkMaster(), '', 'all', null);
  var i3=html.indexOf('架空三郎'), i1=html.indexOf('架空一郎'), i2=html.indexOf('架空二郎');
  assert(i3>=0&&i1>=0&&i2>=0&&i3<i1&&i1<i2, 'PB13-1 全タブは最終参加日 降順（三郎2026-06-01→一郎2026-05-10→二郎2026-04-10）');
})();

// ---- PB14: 不正な quickFilter 値 → フィルタ無効化（null 同等・どのボタンも active にならない）----
(function(){
  env._setState({players:{A:[],B:[]}});
  var html = env.buildPastParticipantsPanelHtml(mkMaster(), '', 'all', 'BOGUS_KEY');
  assert(!has(html,'pp-quick-filter-btn active'), 'PB14-1 不正 quickFilter ではどのクイックフィルタも active にならない');
  assert(has(html,'架空一郎')&&has(html,'架空二郎')&&has(html,'架空三郎'), 'PB14-2 不正 quickFilter は全件表示（フィルタ無効）');
})();

// ---- PB15: 検索 value の quote / & / apostrophe エスケープ ----
(function(){
  env._setState({players:{A:[],B:[]}});
  var html = env.buildPastParticipantsPanelHtml(mkMaster(), '"&\'', 'all', null);
  assert(has(html,'value="&quot;&amp;&#39;"'), 'PB15-1 検索 value の " & \' は &quot;&amp;&#39; にエスケープ');
})();

// ---- PB16: メンバー id の XSS エスケープ（data-mid）----
(function(){
  env._setState({players:{A:[],B:[]}});
  var master = {schema_version:1,members:[
    {id:'"><img>',name:'攻撃太郎',yomi:'',last_class:'A',last_attended:'2026-01-01',first_attended:'2025-01-01',attendance_count:1,tournament_ids:['t1'],deleted:false,deleted_at:null,note:'',member:'member',grade:'ippan',city:''}
  ]};
  var html = env.buildPastParticipantsPanelHtml(master, '', 'all', null);
  assert(has(html,'data-mid="&quot;&gt;&lt;img&gt;"'), 'PB16-1 メンバー id はエスケープされて data-mid に出る');
  assert(!has(html,'"><img>'), 'PB16-2 生の "><img> は出力されない（XSS 安全）');
})();

// ---- PB17: C 以降クラス在籍 member の現状（未エントリーに集計・A/B active 無し）----
//   ※「C 落ち」は現状仕様。B-4a では修正しない（修正＝挙動変更＝別 Issue）。現状を固定する番人。
(function(){
  env._setState({players:{A:[],B:[],C:[{id:'rpc',name:'架空一郎',member_id:'m-001'}]}});
  var html = env.buildPastParticipantsPanelHtml(mkMaster(), '', 'all', null);
  assert(has(html,'未エントリー (3名)'), 'PB17-1 C 在籍 member も現状は「未エントリー」に集計（3名）');
  assert(has(html,'Aクラスエントリー済 (0名)')&&has(html,'Bクラスエントリー済 (0名)'), 'PB17-2 A済/B済 はいずれも 0名');
  assert(!has(html,'pp-add-btn-active'), 'PB17-3 C 在籍では A/B ボタンの active 強調は付かない（現状仕様）');
})();

// ---- PB18: last_attended='' の member（表示はされる・メタ行に日付なし）----
(function(){
  env._setState({players:{A:[],B:[]}});
  var master = {schema_version:1,members:[
    {id:'noatt',name:'無記録',yomi:'',last_class:'',last_attended:'',first_attended:'',attendance_count:0,tournament_ids:[],deleted:false,deleted_at:null,note:'',member:'member',grade:'ippan',city:''}
  ]};
  var html = env.buildPastParticipantsPanelHtml(master, '', 'all', null);
  assert(has(html,'無記録'), 'PB18-1 last_attended 空でも member は一覧に表示される');
})();

// ---- PB19: 全角空白のみの検索 → 正規化で非マッチ・ヒット0（現状挙動）----
(function(){
  env._setState({players:{A:[],B:[]}});
  var html = env.buildPastParticipantsPanelHtml(mkMaster(), '　', 'all', null);
  assert(has(html,'該当する参加者がいません'), 'PB19-1 全角空白検索は現状ヒット0（「該当する参加者がいません」）');
})();

console.log('  過去参加者パネル characterization テスト: PASS '+pass+'件 / FAIL '+fail+'件');
process.exit(fail ? 1 : 0);
