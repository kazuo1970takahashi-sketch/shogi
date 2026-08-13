// ★捨てブランチ用のプレースホルダ（test/release-guard-probe-1）
// release-guard.yml が「app/auth.js が差分に含まれるか」を git diff --name-only で
// 見ていることの実証にだけ使う。production の app/auth.js とは無関係で、
// このブランチは検証後に削除する。
window.__RELEASE_GUARD_PROBE__ = true;
