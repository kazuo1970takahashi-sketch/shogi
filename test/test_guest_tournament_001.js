#!/usr/bin/env node
// GUEST-TOURNAMENT-MODE-001 (#760): ゲスト大会モード（「この大会は名簿に記録しない」を大会の種類として選ぶ）の受入テスト。
//   背景: 別大会（マスタ未登録参加者が大半・約30名）を月例会と同じ端末で運営すると、
//   「📋 名簿を更新」/☁送信未連携ガードの2経路で updateBranchMasterFromTournament が走り
//   支部名簿が汚染される（自動新規追加・同名1件自動紐付け・参加履歴付与）。
//   受入基準（Issue #760）:
//     1. ゲスト大会で運営しても支部マスタが一切変化しない（choke point=syncBranchMasterOnSave 冒頭 no-op ほか7経路遮断）。
//     2. 通常の大会（フラグ OFF）の挙動は完全不変。
//     3. ゲスト大会中は「📋 名簿を更新」「☁ クラウドへ送信」が理由の説明つきで実行されない。
//        ライブ配信・名簿からの受付・サジェスト・名簿タブ「☁ クラウドから取得」は従来どおり。
//     4. ヘッダのバッジで常時視認でき、開始後はモードを切り替えられない。
//   データは完全架空のみ・読み取り専用。
const fs = require('fs');
const targetPath = process.argv[2] || 'shogi_v4.html';
const RAW = fs.readFileSync(targetPath, 'utf8');
let pass = 0, fail = 0;
function assert(c, m) { if (c) { pass++; } else { fail++; console.log('  FAIL: ' + m); } }

// ---- 関数抽出（brace バランス・test_player_swap_001 と同型）
function extractFn(name){
  const idx = RAW.indexOf('function ' + name + '(');
  if (idx < 0) return null;
  let depth = 0, i = RAW.indexOf('{', idx);
  const start = idx;
  for (; i < RAW.length; i++) {
    if (RAW[i] === '{') depth++;
    else if (RAW[i] === '}') { depth--; if (depth === 0) return RAW.slice(start, i + 1); }
  }
  return null;
}

// ---- S. 静的ピン（state スキーマ・UI 導線・遮断7経路）
assert(RAW.indexOf("tournament_kind:(s.tournament_kind==='guest')?'guest':'normal'") >= 0,
  'S1 normalizeState が tournament_kind を正規化（guest 明示時のみ guest・旧データ/不正値は normal）');
assert(RAW.indexOf('function isGuestTournament(st){') >= 0, 'S2 判定は単一述語 isGuestTournament(state) に集約');
assert(RAW.indexOf('id="inp-tournament-kind"') >= 0, 'S3 「⚙ 大会の設定」に大会の種類セレクタ');
assert(RAW.indexOf('🎪 ゲスト大会（名簿に記録しない）') >= 0 && RAW.indexOf('📘 通常の大会（名簿とつなぐ）') >= 0,
  'S4 種類の選択肢は 📘通常（既定）／🎪ゲスト');
assert(RAW.indexOf('id="guest-mode-badge"') >= 0, 'S5 ヘッダに🎪ゲスト大会バッジ（renderGuestModeUI が表示切替）');
assert(RAW.indexOf('ゲスト大会では、参加者が名簿に登録されず、名簿の参加記録も変わりません') >= 0,
  'S6 種類セレクタ注記（Issue #760 たたき台文言）');
// 経路1: choke point（syncBranchMasterOnSave 冒頭 no-op）＝📋saveData／☁未連携ガードの2経路を一括遮断
{
  const sync = extractFn('syncBranchMasterOnSave') || '';
  const guardPos = sync.indexOf('isGuestTournament');
  const loadPos = sync.indexOf('loadBranchMaster');
  assert(guardPos >= 0 && loadPos > 0 && guardPos < loadPos,
    'S7 syncBranchMasterOnSave は loadBranchMaster より前（冒頭）で guest を no-op 遮断');
  assert(/isGuestTournament\([^)]*\)\)\{_done\(\);return;\}/.test(sync),
    'S8 choke point は _done() のみ呼ぶ no-op（保存もマスタ読込もしない）');
}
// 経路2: 📋ボタン＝押下時説明（disabled にせず理由を toast）
{
  const sd = extractFn('saveData') || '';
  assert(sd.indexOf('isGuestTournament') >= 0 && sd.indexOf('🎪 ゲスト大会のため名簿には反映しません') >= 0,
    'S9 saveData は guest 中に理由説明つきで中止（📋名簿を更新）');
  assert(sd.indexOf('showToast') >= 0, 'S9b 説明は toast（どのタブでも視認・#757 のトースト化と整合）');
}
// 経路3: addPlayer サジェスト由来の空 yomi 即時補完保存のスキップ
{
  const ap = extractFn('addPlayer') || '';
  assert(/yomiForMaster && !normalizeYomi\(suggestSelected\.yomi\|\|''\) && !\(typeof isGuestTournament==='function'&&isGuestTournament\(state\)\)/.test(ap),
    'S10 addPlayer の yomi バックフィル（マスタ即時保存）は guest 中スキップ');
}
// 経路4: 名簿から受付のクラス変更＝master.last_class 更新のスキップ（player 側は通常どおり）
assert(RAW.indexOf('function changePlayerClass(memberId,newCls,master,state,opts){') >= 0,
  'S11 changePlayerClass に opts（skipMasterUpdate）を追加（省略時は従来挙動）');
assert(RAW.indexOf("changePlayerClass(memberId,cls,master,state,_guestClsChg?{skipMasterUpdate:true}:undefined)") >= 0,
  'S12 呼び出し元が guest 中に skipMasterUpdate を指定');
// 経路5: 一括 yomi 補完ダイアログのスキップ
{
  const asp = extractFn('addSelectedPastParticipants') || '';
  const g = asp.indexOf('isGuestTournament');
  const d = asp.indexOf('openYomiInputDialog');
  assert(g >= 0 && d > 0 && g < d, 'S13 一括 yomi 補完ダイアログは guest 中に出さず直接受付');
}
// 経路6: 名前編集「会員マスタも更新する」の非表示
{
  const bm = extractFn('buildMasterSyncModalHtml') || '';
  assert(bm.indexOf('guestMode') >= 0 && bm.indexOf("if(!guestMode)html+='<button type=\"button\" id=\"ms-master-too\"") >= 0,
    'S14 guest 中は「会員マスタも更新する」ボタンを出さない（この大会のみ修正＋別の人に差し替えのみ）');
  assert(bm.indexOf('🎪 ゲスト大会のため名簿（会員マスタ）は更新しません') >= 0,
    'S15 モーダル内に guest の説明（なぜ選択肢がないか）');
}
// 経路7: ☁送信の冒頭ガード
{
  const send = extractFn('sendTournamentToCloud') || '';
  const g = send.indexOf('isGuestTournament');
  const t = send.indexOf('sendTargetClasses');
  assert(g >= 0 && t > 0 && g < t, 'S16 sendTournamentToCloud は冒頭（クラス確認より前）で guest を遮断');
  assert(send.indexOf('🎪 ゲスト大会の結果はクラウドに送信できません') >= 0 && send.indexOf("step:'guest-mode'") >= 0,
    'S17 ☁送信ガードは説明メッセージ＋fail-soft（{ok:false,step:guest-mode}）');
}
// 開始後ロック＋登録後 confirm＋バッジ/📋ボタン見た目同期
{
  const oc = extractFn('onChangeTournamentKind') || '';
  assert(oc.indexOf('state.started') >= 0 && oc.indexOf('開始後は大会の種類を変更できません') >= 0,
    'S18 開始後は種類変更を拒否（renderRoundsControl 方式のロック＋保険）');
  assert(oc.indexOf('appConfirm') >= 0 && oc.indexOf('すでに参加者が') >= 0,
    'S19 参加者登録後の切替は confirm');
  const rk = extractFn('renderTournamentKindControl') || '';
  assert(rk.indexOf('sel.disabled=started') >= 0, 'S20 セレクタは開始後 disabled（毎描画同期）');
  const rg = extractFn('renderGuestModeUI') || '';
  assert(rg.indexOf('guest-mode-badge') >= 0 && rg.indexOf('saveBtn') >= 0,
    'S21 バッジと📋ボタンの見た目を renderGuestModeUI が同期');
  assert(RAW.indexOf('renderTournamentKindControl();\n  var clsList=getRegistrationClassList();') >= 0 ||
    /renderRoundsControl\(\);[\s\S]{0,400}renderTournamentKindControl\(\);/.test(RAW),
    'S22 renderRegList から毎描画同期（init/全リセット/復元で表示が追随）');
}
// 全リセットで既定（通常）に戻る＝resetAll の state 再構築に tournament_kind が無い（undefined→述語 false）
{
  const ra = extractFn('resetAll') || '';
  assert(ra.indexOf('tournament_kind') < 0, 'S23 resetAll は tournament_kind を持たない state を再構築＝既定（通常の大会）に戻る');
}

// ---- 動作テスト（抽出＋実行・完全架空データ）
// U. isGuestTournament（単一述語）
{
  const src = extractFn('isGuestTournament');
  assert(!!src, 'U0 isGuestTournament が抽出できる');
  const f = new Function(src + '; return isGuestTournament;')();
  assert(f({tournament_kind:'guest'}) === true, 'U1 guest → true');
  assert(f({tournament_kind:'normal'}) === false, 'U2 normal → false');
  assert(f({}) === false, 'U3 未設定（旧データ）→ false');
  assert(f(null) === false && f(undefined) === false, 'U4 null/undefined → false（落ちない）');
  assert(f({tournament_kind:'GUEST'}) === false && f({tournament_kind:1}) === false, 'U5 不正値 → false（guest 厳密一致）');
}

// C. changePlayerClass: skipMasterUpdate の有無で master.last_class の扱いだけが変わる（player 側は同一）
{
  const src = ['isValidEntryNo','reconcileEntryNos','nextEntryNoForClass','changePlayerClass'].map(extractFn);
  assert(src.every(s => !!s), 'C0 changePlayerClass と依存関数が抽出できる');
  const env = new Function('var state=null;' + src.join('\n') + '; return {changePlayerClass:changePlayerClass};')();
  function fxState(){
    return { players: { A: [ {id:'p1',name:'架空太郎',cls:'A',member:'member',grade:'ippan',member_id:'m-1',entry_no:1} ], B: [] } };
  }
  function fxMaster(){ return { members: [ {id:'m-1',name:'架空太郎',last_class:'A'} ] }; }
  // 従来挙動（opts 省略）＝master.last_class 更新（既存テスト互換の回帰）
  {
    const st = fxState(), ms = fxMaster();
    const r = env.changePlayerClass('m-1','B',ms,st);
    assert(r && r.success === true && st.players.B.length === 1 && st.players.A.length === 0, 'C1 opts 省略: player は B へ移動');
    assert(ms.members[0].last_class === 'B', 'C2 opts 省略: master.last_class が更新される（従来どおり）');
  }
  // guest（skipMasterUpdate:true）＝player は移動するが master は不変
  {
    const st = fxState(), ms = fxMaster();
    const r = env.changePlayerClass('m-1','B',ms,st,{skipMasterUpdate:true});
    assert(r && r.success === true && st.players.B.length === 1 && st.players.A.length === 0, 'C3 skipMasterUpdate: player は B へ移動（通常どおり）');
    assert(ms.members[0].last_class === 'A', 'C4 skipMasterUpdate: master.last_class は変化しない');
    assert(JSON.stringify(ms) === JSON.stringify(fxMaster()), 'C5 skipMasterUpdate: master オブジェクト全体が不変');
  }
}

// G. syncBranchMasterOnSave: guest 中はマスタに一切触れず onDone だけ呼ぶ（choke point 実行検証）
{
  const src = extractFn('syncBranchMasterOnSave');
  assert(!!src, 'G0 syncBranchMasterOnSave が抽出できる');
  const harness = new Function('guestState', `
    var state = guestState;
    var calls = { load: 0, done: 0 };
    function isGuestTournament(st){ return !!(st && st.tournament_kind === 'guest'); }
    function loadBranchMaster(){ calls.load++; throw new Error('must-not-load-master'); }
    ${src}
    syncBranchMasterOnSave(function(){ calls.done++; });
    return calls;
  `);
  const g = harness({tournament_kind:'guest'});
  assert(g.load === 0, 'G1 guest: loadBranchMaster が呼ばれない（マスタ読み書きゼロ）');
  assert(g.done === 1, 'G2 guest: onDone は1回だけ呼ばれる（呼び出し元の完了通知契約を維持）');
  // 通常: guard を素通りして loadBranchMaster に到達する（＝遮断が normal に波及しない）。
  //   stub が throw → 既存 outer catch が console.warn + _done する既存経路（挙動不変の確認）。
  const origWarn = console.warn; console.warn = function(){};
  const n = harness({tournament_kind:'normal'});
  console.warn = origWarn;
  assert(n.load === 1, 'G3 normal: 従来どおり loadBranchMaster へ到達（ガードが normal を止めない）');
  assert(n.done === 1, 'G4 normal: 例外経路でも onDone は1回（既存 fail-soft 契約不変）');
}

// D. saveData: guest 中は sync を呼ばず説明 toast のみ／normal は従来どおり sync を呼ぶ
{
  const src = extractFn('saveData');
  const harness = new Function('st', `
    var state = st;
    var calls = { sync: 0, toasts: [] };
    function isGuestTournament(s){ return !!(s && s.tournament_kind === 'guest'); }
    function syncBranchMasterOnSave(cb){ calls.sync++; if (typeof cb === 'function') cb(); }
    function showToast(m){ calls.toasts.push(m); }
    ${src}
    saveData();
    return calls;
  `);
  const g = harness({tournament_kind:'guest'});
  assert(g.sync === 0 && g.toasts.length === 1 && g.toasts[0].indexOf('ゲスト大会のため名簿には反映しません') >= 0,
    'D1 guest: 同期せず理由説明の toast のみ');
  const n = harness({tournament_kind:'normal'});
  assert(n.sync === 1 && n.toasts.length === 1 && n.toasts[0].indexOf('名簿を更新しました') >= 0,
    'D2 normal: 従来どおり同期＋成功 toast（挙動不変）');
}

// W. sendTournamentToCloud: guest 中は説明つき fail-soft で即 resolve（Promise 契約維持）
{
  const src = extractFn('sendTournamentToCloud');
  const harness = new Function('st', `
    var state = st;
    var statuses = [];
    function isGuestTournament(s){ return !!(s && s.tournament_kind === 'guest'); }
    ${src}
    return { p: sendTournamentToCloud(function(m){ statuses.push(m); }), statuses: statuses };
  `);
  const r = harness({tournament_kind:'guest'});
  return r.p.then(function(res){
    assert(res && res.ok === false && res.step === 'guest-mode', 'W1 guest: {ok:false,step:guest-mode} で即中止（fail-soft）');
    assert(r.statuses.length === 1 && r.statuses[0].indexOf('ゲスト大会の結果はクラウドに送信できません') >= 0
      && r.statuses[0].indexOf('ライブ配信は使えます') >= 0,
      'W2 guest: 理由＋ライブ配信は使える旨を説明');
    console.log('GUEST-TOURNAMENT-MODE-001: PASS=' + pass + ', FAIL=' + fail);
    process.exit(fail === 0 ? 0 : 1);
  }).catch(function(e){
    fail++; console.log('  FAIL: W* 例外 ' + (e && e.message));
    console.log('GUEST-TOURNAMENT-MODE-001: PASS=' + pass + ', FAIL=' + fail);
    process.exit(1);
  });
}
