## WARNBANNER-846-ONE-STEP-001: ⚠バナーに「『変更』1回で縮められる手」の有無と、その手を出す（#846・案A）

- **問題**: 8/9 当日、Aクラスで ⚠「要確認」が実 UI で選べる全 160 手のどれを選んでも消えず、幹事の判断材料にならなかった。設計B（到達可能な最小を Blossom で一般解）は到達不能 82〜89%・棄権者・#272 との衝突で 8/11 に中断。
- **修正**: 作者裁定（2026-09-05 案A）で到達可能＝「変更」モーダルで実際にできる手（`classifyChangePairingCandidate` が ok の候補・swap と待機者との replace）と定義し直し、1 手の全探索で `evaluatePairingQuality` の (再戦数, 最大勝数差, 勝数差合計) が辞書順で厳密に縮む最良の手を `findOneStepImprovement` が返す。バナーに「↪ 『変更』1回で縮められます：第N卓の ◯◯ を 第M卓の △△ と入れ替える（勝数差 2 → 1）」／無ければ「↪ 『変更』1回で縮められる手はありません」を 1 行追加。2 手以上は主張しない。評価回数 3000 超（60名級）は省略してその旨を出す。`evaluatePairingQuality`・`warningHit`・`generatePairing` は無改変。
- テスト: `test/test_warnbanner_one_step_846.js`（golden は当該 1 行の追加ぶんを再採取）
