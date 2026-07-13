#!/usr/bin/env node
// MASTER-LIST-UX-001: マスタ一覧の読み取り専用化＋スマホ列絞り（設計 docs/specs/20260704_master_list_ux_001_design.md・req #544）。
//   一覧は「読む場所」＝4列固定（選択/氏名/支部員/会費）。前回クラス・最終参加・削除日は
//   氏名セル内サブ情報行へ（常時描画・空欄「－」＝行高不変）。支部員・会費は文字入りチップ。
//   編集導線は行タップ→全幅フォーム（v70）を無改変維持。
const fs=require('fs');
const RAW=fs.readFileSync(process.argv[2]||'shogi_v4.html','utf8');
let pass=0,fail=0;const ok=(c,m)=>{c?pass++:(fail++,console.log('  FAIL: '+m));};

// L1: thead は4列＝前回/最終参加の独立 th が無い
ok(RAW.indexOf('>選択</th>')>=0&&RAW.indexOf('氏名（ふりがな）</th>')>=0&&RAW.indexOf('>支部員</th>')>=0&&RAW.indexOf('>会費</th>')>=0,'L1a 4列ヘッダ（選択/氏名(ふりがな)/支部員/会費）');
ok(RAW.indexOf('>前回</th>')<0&&RAW.indexOf('>最終参加</th>')<0,'L1b 前回/最終参加の独立 th を出力しない');

// L2: サブ情報行は live 行で常時描画（前回・最終を1スパンに集約）
ok(RAW.indexOf("前回:'+escapeHtml(lastCls)+' ・ 最終:'")>=0,'L2 サブ情報行「前回:X ・ 最終:日付」を常時描画');

// L3: 空欄は「－」（前回=lastCls 既定・最終=_masterSheetFmtDate の falsy 分岐）
ok(RAW.indexOf("var lastCls=isSafeClassId(m.last_class)?m.last_class:'－';")>=0,'L3a 前回クラス空欄は「－」（#768: C+ も表示・不正 id のみ －）');
ok(/if\(!m\)return s\?String\(s\):'－';/.test(RAW),'L3b _masterSheetFmtDate は空入力で「－」');

// L4: 削除行はサブ情報を「削除:日付」に差し替え（同位置・列構造不変）
var sub=RAW.indexOf('var subInfo=isDel');
ok(sub>=0,'L4a サブ情報は isDel で差し替え（独立列なし）');
var subBlock=RAW.slice(sub,sub+700);
ok(subBlock.indexOf('削除:')>=0&&subBlock.indexOf('text-decoration:none')>=0,'L4b 削除サブ情報＝「削除:日付」＋取り消し線解除の踏襲');
ok(/title="'\+escapeHtml\(m\.deleted_at\|\|''\)\+'"/.test(subBlock)&&/title="'\+escapeHtml\(m\.last_attended\|\|''\)\+'"/.test(subBlock),'L4c 生値 title（deleted_at/last_attended）を踏襲');

// L5: 会費チップ3種（文字入り＝色だけに頼らない）
var gc=RAW.indexOf('var gradeChip=');
ok(gc>=0,'L5a 会費チップを生成');
var gcBlock=RAW.slice(gc,gc+800);
ok(gcBlock.indexOf('#E6F1FB')>=0&&gcBlock.indexOf('#FAEEDA')>=0&&gcBlock.indexOf('#dde3ea')>=0,'L5b チップ3種（中学以下=青地/女性=アンバー地/一般=グレー枠）');
ok(RAW.indexOf("?'中学以下':")>=0,'L5c 会費ラベル「中学以下」（旧「中学」から明確化）');

// L6: 支部員チップ「その他」（旧「他」から明確化）
ok(RAW.indexOf('>その他</span>')>=0,'L6 支部員チップ「その他」表記');

// L7: 編集導線・フック無改変（行タップ→フォーム／data-mid／flash）
ok(/master-cell-name" data-mid=/.test(RAW)&&/master-cell-member" data-mid=/.test(RAW)&&/master-cell-grade" data-mid=/.test(RAW),'L7a 編集セル class（bind 温存＝結線無改変）');
ok(RAW.indexOf('master-sheet-row'+"'"+'+(isDel')>=0||/master-sheet-row'\+\(isDel/.test(RAW),'L7b tr data-mid 行（フラッシュ/追跡フック維持）');
ok(/td\.colSpan=\(row\.cells&&row\.cells\.length\)\?row\.cells\.length:4;/.test(RAW),'L7c 編集フォーム行の colSpan は行セル数に動的追従（4列で全幅）');

// L8: 選択チェックのタップ領域（CSS のみ・新規結線なし）
ok(RAW.indexOf('class="master-row-check"')>=0&&/master-row-check[^>]*style="width:20px;height:20px"/.test(RAW),'L8 checkbox 20px（タップ領域は CSS のみで拡大）');

// L9: 旧・独立列の残骸が無い
ok(RAW.indexOf(">'+escapeHtml(lastCls)+'</td>")<0,'L9 旧「前回」独立セルの残骸なし');

console.log('  MASTER-LIST-UX-001: PASS '+pass+'件 / FAIL '+fail+'件');
process.exit(fail?1:0);
