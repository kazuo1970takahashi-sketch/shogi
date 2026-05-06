// @ts-check
const { test, expect } = require('@playwright/test');
const {
  stableStringify,
  expectStateChanged,
  expectStateUnchanged,
} = require('./stableStringify');

test.describe('stableStringify', () => {
  test('プリミティブ・null は JSON.stringify と一致', () => {
    expect(stableStringify(null)).toBe('null');
    expect(stableStringify(42)).toBe('42');
    expect(stableStringify('a')).toBe('"a"');
    expect(stableStringify(true)).toBe('true');
  });

  test('配列の順序は保持される', () => {
    expect(stableStringify([3, 1, 2])).toBe('[3,1,2]');
  });

  test('オブジェクトのキーはアルファベット順に並ぶ', () => {
    const a = { b: 1, a: 2, c: 3 };
    const b = { c: 3, a: 2, b: 1 };
    expect(stableStringify(a)).toBe(stableStringify(b));
    expect(stableStringify(a)).toBe('{"a":2,"b":1,"c":3}');
  });

  test('ネストしたオブジェクトも再帰的にキー順', () => {
    const x = { z: { y: 2, x: 1 }, a: [{ b: 1, a: 2 }] };
    expect(stableStringify(x)).toBe('{"a":[{"a":2,"b":1}],"z":{"x":1,"y":2}}');
  });

  test('expectStateChanged / expectStateUnchanged が機能する', () => {
    const before = { state: { players: { A: [] } } };
    const same = { state: { players: { A: [] } } };
    const diff = { state: { players: { A: [{ name: 't' }] } } };

    expectStateUnchanged(before, same, 'state.players.A');
    expectStateChanged(before, diff, 'state.players.A');
  });
});
