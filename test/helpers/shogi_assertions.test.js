// @ts-check
// §5.1 shogi_assertions.test.js: 全 22 factory の meta 検証

const { test, expect } = require('@playwright/test');
const { shogiAssertions } = require('./shogi_assertions');

// 各 factory を呼び出して戻り値オブジェクトを得るヘルパ
function build(name) {
  const factory = shogiAssertions[name];
  if (typeof factory !== 'function') return null;
  // 引数の必要数は factory ごとに違うので、典型値で渡す
  const argsByName = {
    participantAdded: ['A'],
    classSelectedFromPast: ['A'],
    classSelectedFromSuggest: ['A', 'm_xxxx'],
    tournamentStarted: [],
    winnerSelected: ['A', 0, 'p1'],
    roundConfirmed: ['A', {}],
    pairingsRegenerated: ['A', {}],
    opponentChanged: ['A', 0],
    pastWinnerChanged: ['A', 0, 0],
    bulkNamesEdited: ['A'],
    masterMemberAdded: [],
    masterMemberEdited: ['m_xxxx'],
    masterMemberDeleted: ['m_xxxx'],
    masterImported: [{}],
    tournamentDataCopied: [],
    stateLoaded: [1, 0],
    stateLoadedFromFile: [1, 0],
    stateReset: [],
    reportDownloaded: ['window-print'],
  };
  return factory(...(argsByName[name] || []));
}

const FACTORY_NAMES = [
  'participantAdded',
  'classSelectedFromPast',
  'classSelectedFromSuggest',
  'tournamentStarted',
  'winnerSelected',
  'roundConfirmed',
  'pairingsRegenerated',
  'opponentChanged',
  'pastWinnerChanged',
  'bulkNamesEdited',
  'masterMemberAdded',
  'masterMemberEdited',
  'masterMemberDeleted',
  'masterImported',
  'tournamentDataCopied',
  'stateLoaded',
  'stateLoadedFromFile',
  'stateReset',
  'reportDownloaded',
];

test.describe('shogi_assertions: 全 factory の meta 検証', () => {
  test('§3.4 表で定義された 19 factory 名がすべて export されている', () => {
    for (const name of FACTORY_NAMES) {
      expect(typeof shogiAssertions[name], `${name} が factory 関数として export されていない`).toBe('function');
    }
  });

  for (const name of FACTORY_NAMES) {
    test(`${name}: meta.primaryAssertions >= 1`, () => {
      const f = build(name);
      expect(f.meta).toBeDefined();
      expect(typeof f.meta.primaryAssertions).toBe('number');
      expect(f.meta.primaryAssertions).toBeGreaterThanOrEqual(1);
    });

    test(`${name}: meta.operation / primaryTypes / description が定義済`, () => {
      const f = build(name);
      expect(typeof f.meta.operation).toBe('string');
      expect(f.meta.operation.length).toBeGreaterThan(0);
      expect(Array.isArray(f.meta.primaryTypes)).toBe(true);
      expect(f.meta.primaryTypes.length).toBeGreaterThan(0);
      expect(typeof f.meta.description).toBe('string');
    });
  }

  test('全 factory の meta.operation が一意である', () => {
    const ops = FACTORY_NAMES.map((n) => build(n).meta.operation);
    const uniq = new Set(ops);
    expect(uniq.size).toBe(ops.length);
  });

  test('tournamentDataCopied は requiredPermissions に clipboard-read/write を含む(v1.2 SF#2)', () => {
    const f = shogiAssertions.tournamentDataCopied();
    expect(f.meta.requiredPermissions).toEqual(expect.arrayContaining(['clipboard-read', 'clipboard-write']));
  });

  test('reportDownloaded は beforeClick を持つ(spy 注入)', () => {
    for (const mode of ['window-print', 'pdf-blob', 'anchor-download']) {
      const f = shogiAssertions.reportDownloaded(mode);
      expect(typeof f.beforeClick).toBe('function');
    }
  });

  test('stateLoadedFromFile は beforeClick + afterClick を持つ(v1.4 Codex MF#1)', () => {
    const f = shogiAssertions.stateLoadedFromFile(1, 0);
    expect(typeof f.beforeClick).toBe('function');
    expect(typeof f.afterClick).toBe('function');
  });
});
