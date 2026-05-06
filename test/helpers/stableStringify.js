// @ts-check
// §3.7 (NH#3): JSON-compatible オブジェクトをキー順に正規化して安定文字列化する。
// 用途: state / master / localStorage 由来の差分検証。
// 制限: DOM node / Page / Locator / 循環参照には使用不可。
//       Date / RegExp / Map / Set 等は JSON.stringify の既定挙動に従う。

const { expect } = require('@playwright/test');

function stableStringify(obj) {
  if (obj === null || typeof obj !== 'object') return JSON.stringify(obj);
  if (Array.isArray(obj)) return '[' + obj.map(stableStringify).join(',') + ']';
  const keys = Object.keys(obj).sort();
  return '{' + keys.map((k) => JSON.stringify(k) + ':' + stableStringify(obj[k])).join(',') + '}';
}

function pickPath(obj, path) {
  return path.split('.').reduce((o, k) => (o == null ? o : o[k]), obj);
}

function expectStateChanged(before, after, path) {
  expect(stableStringify(pickPath(after, path))).not.toBe(stableStringify(pickPath(before, path)));
}

function expectStateUnchanged(before, after, path) {
  expect(stableStringify(pickPath(after, path))).toBe(stableStringify(pickPath(before, path)));
}

module.exports = { stableStringify, expectStateChanged, expectStateUnchanged };
