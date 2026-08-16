## SAVE-WARN-VISIBILITY-001: 保存警告が視界外に出るとき err トーストでも同文を出す

Issue #892。表示のみ（保存・検証ロジック無改変）。

- `notifySaveWarning`: showMsg 後、レイアウト確定後（setTimeout 0）に #reg-msg の実可視（visualViewport の offsetTop 考慮・可視高24px以上・全画面オーバーレイ遮蔽・器なし）を判定し、見えない時だけwarn 面色のトースト（#740 の器に .warn 変種を追加・.alert-warn と同 palette）で同文を出す。持続表示・console.warn・indicator count は不変
- 成功トーストの上書き2経路を抑止（一括登録は unverified>0 で成功トーストを出さない／名簿反映の破損スキップは `_saveWarned` 印で呼び元が抑止）＝「success 抑止は callsite 責務」の既存設計に従う
- 新 e2e `save_warn_visibility_892.e2e.js`（14 assertions・反証パネル1巡＋Codex 3巡の実測セル・変異 kill を両側実測）

既知の限界（スコープ外・PR に明記): キーボード表示中はトースト自体が vv 可視域の外に出ることがある／アグリゲーション短縮文言に確認先の場所指定がない
