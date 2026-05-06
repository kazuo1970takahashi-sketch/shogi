// @ts-check
// §4.1 / v1.3 で clickAndExpectChange.js から分離。triggerInputFileAndExpectChange と共通利用。
// L0 §4.1 の 3 LocalStorage キー(shogi_v4 / shogi_branch_master / shogi_v3 legacy)
// + state(window.state) + master(BRANCH_MASTER_KEY パース) + url + activeTab を取得。
// NH#1 options.selectors が指定された場合、dom フィールドに DOM クエリ結果を載せる。

async function getStateSnapshot(page, options = {}) {
  const snapshot = await page.evaluate((opts) => {
    // about:blank / page.setContent 由来のページでは localStorage アクセスが
    // SecurityError を投げる。helper 単体テスト用途を含むため、各キーを
    // 個別に try/catch して null フォールバックする。
    function readLs(key) {
      try {
        return localStorage.getItem(key);
      } catch (e) {
        return null;
      }
    }
    const ls = {
      shogi_v4: readLs('shogi_v4'),
      shogi_branch_master: readLs('shogi_branch_master'),
      shogi_v3: readLs('shogi_v3'),
    };

    let master = null;
    if (ls.shogi_branch_master) {
      try {
        master = JSON.parse(ls.shogi_branch_master);
      } catch (e) {
        master = null;
      }
    }

    let activeTab = null;
    const tabs = document.querySelectorAll('.tab');
    for (const t of tabs) {
      if (t.classList && t.classList.contains('active')) {
        activeTab = t.id;
        break;
      }
    }

    // window.state は production が grobal var として公開している(shogi_v4.html L204 var state = ...)
    const stateClone = window.state ? JSON.parse(JSON.stringify(window.state)) : null;

    const dom = {};
    if (opts && opts.selectors) {
      for (const key of Object.keys(opts.selectors)) {
        const sel = opts.selectors[key];
        const el = document.querySelector(sel);
        dom[key] = el
          ? {
              exists: true,
              visible: !!(el.offsetParent || (el.getClientRects && el.getClientRects().length > 0)),
              text: (el.textContent || '').trim(),
              attrs: Array.from(el.attributes || []).reduce((a, x) => {
                a[x.name] = x.value;
                return a;
              }, {}),
            }
          : { exists: false, visible: false, text: '', attrs: {} };
      }
    }

    return {
      state: stateClone,
      master: master,
      localStorage: ls,
      url: location.href,
      activeTab: activeTab,
      dom: dom,
    };
  }, { selectors: options.selectors || null });

  return snapshot;
}

module.exports = { getStateSnapshot };
