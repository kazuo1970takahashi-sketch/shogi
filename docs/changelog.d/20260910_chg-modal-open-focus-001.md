## CHG-MODAL-OPEN-FOCUS-001: 変更モーダルを開いた直後のフォーカスを先手の select から器（dialog 自身）へ移す（#967）

- **問題**: CHG-MODAL-FOCUS-TRAP-001（#837）は開いた直後に先頭の focusable＝先手の select へ focus していた。iPhone Safari はクリック中の `select.focus()` でピッカーを開くため、「変更」を押した瞬間に先手の候補が開き、モーダルの「先手」「後手」の 2 欄はその下に隠れる。後手を変えるには一度閉じてから後手の欄を押すしかなかった（2026-09-10 作者の実機報告・v155）。
- **修正**: `openChangePairingModalFocus` が器（`#chg-modal`・`tabindex=-1` を付与）に focus する。select には触らない＝ピッカーは幹事が欄を押したときだけ開く。`_chgModalKeydown` に「activeElement が器のとき Tab は先頭（先手）へ・Shift+Tab は最後へ」の分岐を足した（既定挙動に任せると Shift+Tab は inert の背後を遡って body へ抜ける＝実 Chromium で実測）。`buildChangePairingModalHtml`・保存処理・#837 の他の守り（背後 inert・Escape・多重表示ガード・フォーカス戻し）は無改変。
- テスト: `test/e2e/chg_modal_open_focus_967.e2e.js`（新規・実 Chromium。開いた直後の activeElement が器／開く過程で select が focus を受けない／器からの Tab・Shift+Tab がモーダルの外へ出ない／Enter で背後に勝敗が入らない／Escape・入れ替えの対照）。`test/e2e/chg_modal_focus_837.e2e.js` は無改変で緑。
