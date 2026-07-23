const MODULE_ID = 'ranking-ban-scanner';
const ROOT_ID = 'yss-ranking-ban-scanner';
const STYLE_ID = `${ROOT_ID}-style`;
const CACHE_KEY = 'yss-ranking-ban-cache-v1';
const CACHE_TTL = 60 * 60 * 1000;
const REQUEST_DELAY = 1400;

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const normalize = value => String(value || '').replace(/\s+/g, ' ').trim();
const isLadderPage = () =>
  location.hostname === 'www.margonem.pl' &&
  /^\/ladder\/[^/]+\/players\/?$/i.test(location.pathname);

function readCache() {
  try {
    const cache = JSON.parse(localStorage.getItem(CACHE_KEY) || '{}');
    return cache && typeof cache === 'object' ? cache : {};
  } catch {
    return {};
  }
}

function writeCache(cache) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(cache)); } catch { /* brak miejsca nie blokuje skanowania */ }
}

function accountIdFromUrl(url) {
  return String(url).match(/profile\/view,(\d+)/i)?.[1] || '';
}

function parseRows() {
  return [...document.querySelectorAll('table tr')].flatMap(row => {
    const link = row.querySelector('a[href*="/profile/view,"]');
    const lastOnlineCell = row.querySelector('.long-last-online');
    if (!link || !lastOnlineCell) return [];

    const lastOnline = normalize(lastOnlineCell.textContent);
    const days = Number(lastOnline.match(/(\d+)\s+dni?\s+temu/i)?.[1] || 0);
    return [{
      row,
      link,
      name: normalize(link.textContent),
      url: link.href,
      accountId: accountIdFromUrl(link.href),
      lastOnlineCell,
      lastOnline,
      eligible: days >= 1,
      days
    }];
  });
}

function detectBan(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  doc.querySelectorAll(
    'script,style,noscript,#js-login-box,#js-ban-box,.popup-ban,.popup-totp,.popup-default-overlay,nav,footer'
  ).forEach(node => node.remove());

  const explicit = doc.querySelector(
    '[data-banned="true"],[data-account-banned="true"],.profile-ban,.profile-banned,.account-ban,.account-banned,.banned-account,.blocked-account'
  );
  const text = normalize(doc.querySelector('main, article, .body-full-width-container')?.textContent || '');
  const banned = Boolean(explicit) ||
    /\b(?:konto|profil)\s+(?:zostało\s+)?(?:zablokowane|zbanowane)\b/i.test(text) ||
    /\b(?:stała|czasowa)\s+blokada\s+konta\b/i.test(text);

  return { banned, checkedAt: Date.now() };
}

function addBadge(entry, state, label) {
  let badge = entry.lastOnlineCell.querySelector('.yss-ban-badge');
  if (!badge) {
    badge = document.createElement('span');
    badge.className = 'yss-ban-badge';
    entry.lastOnlineCell.appendChild(badge);
  }
  badge.dataset.state = state;
  badge.textContent = label;
}

function createUi() {
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    #${ROOT_ID}{position:fixed;right:18px;top:118px;width:310px;z-index:2147483000;color:#eee0b6;
      border:1px solid #8b7021;border-radius:5px;background:#121311;box-shadow:0 3px 12px #000;font:12px Arial,sans-serif}
    #${ROOT_ID} *{box-sizing:border-box}
    #${ROOT_ID} header{display:flex;align-items:center;justify-content:space-between;padding:9px 10px;
      background:linear-gradient(#44301f,#21170f);border-bottom:1px solid #725b1b;color:#ffd94f;font-weight:bold}
    #${ROOT_ID} .yss-ban-body{padding:9px}
    #${ROOT_ID} .yss-ban-summary{line-height:1.5;margin-bottom:8px;color:#d6d1c4}
    #${ROOT_ID} .yss-ban-progress{height:7px;border:1px solid #57481f;background:#080908;margin-bottom:8px}
    #${ROOT_ID} .yss-ban-progress>i{display:block;height:100%;width:0;background:#9f7f22;transition:width .2s}
    #${ROOT_ID} .yss-ban-actions{display:flex;gap:6px}
    #${ROOT_ID} button{flex:1;padding:6px;border:1px solid #8c7428;border-radius:3px;background:#3b3318;color:#fff1b0;
      font-weight:bold;cursor:pointer}
    #${ROOT_ID} button:hover{filter:brightness(1.15)}
    #${ROOT_ID} button:disabled{opacity:.5;cursor:default}
    #${ROOT_ID} .yss-ban-results{max-height:210px;overflow:auto;margin-top:8px;border-top:1px solid #40391f}
    #${ROOT_ID} .yss-ban-result{display:flex;justify-content:space-between;gap:8px;padding:5px 2px;border-bottom:1px solid #292a25}
    #${ROOT_ID} .yss-ban-result a{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#d8d8d8}
    #${ROOT_ID} .yss-ban-result strong[data-state="ban"]{color:#ff6868}
    #${ROOT_ID} .yss-ban-result strong[data-state="clear"]{color:#76d17a}
    #${ROOT_ID} .yss-ban-result strong[data-state="error"]{color:#ffc45d}
    .yss-ban-badge{display:inline-block;margin-left:6px;padding:1px 5px;border-radius:3px;font-size:10px;font-weight:bold;white-space:nowrap}
    .yss-ban-badge[data-state="skip"]{background:#444;color:#ccc}
    .yss-ban-badge[data-state="checking"]{background:#65531c;color:#fff0a8}
    .yss-ban-badge[data-state="clear"]{background:#24572b;color:#d5ffd8}
    .yss-ban-badge[data-state="ban"]{background:#7a2525;color:#fff}
    .yss-ban-badge[data-state="error"]{background:#6c4c1f;color:#ffe5ad}`;
  document.head.appendChild(style);

  const root = document.createElement('section');
  root.id = ROOT_ID;
  root.innerHTML = `
    <header><span>Kontrola banów • v1.0.0</span><span class="yss-ban-page"></span></header>
    <div class="yss-ban-body">
      <div class="yss-ban-summary">Wczytywanie graczy…</div>
      <div class="yss-ban-progress"><i></i></div>
      <div class="yss-ban-actions">
        <button type="button" data-action="scan">Sprawdź tę stronę</button>
        <button type="button" data-action="clear">Wyczyść pamięć</button>
      </div>
      <div class="yss-ban-results"></div>
    </div>`;
  document.body.appendChild(root);
  return { root, style };
}

function makeScanner() {
  const { root, style } = createUi();
  const summary = root.querySelector('.yss-ban-summary');
  const progress = root.querySelector('.yss-ban-progress>i');
  const results = root.querySelector('.yss-ban-results');
  const scanButton = root.querySelector('[data-action="scan"]');
  const clearButton = root.querySelector('[data-action="clear"]');
  root.querySelector('.yss-ban-page').textContent =
    `strona ${new URLSearchParams(location.search).get('page') || '1'}`;

  let stopped = false;
  let running = false;
  let controller = null;
  const entries = parseRows();

  entries.forEach(entry => {
    if (!entry.eligible) addBadge(entry, 'skip', '< 24h • pominięty');
  });
  const eligibleCount = entries.filter(entry => entry.eligible).length;
  summary.textContent = `Graczy: ${entries.length} • do sprawdzenia: ${eligibleCount} • pominiętych: ${entries.length - eligibleCount}`;

  const addResult = (entry, state, label) => {
    const line = document.createElement('div');
    line.className = 'yss-ban-result';
    line.innerHTML = `<a target="_blank" rel="noopener"></a><strong></strong>`;
    line.querySelector('a').href = entry.url;
    line.querySelector('a').textContent = entry.name;
    line.querySelector('strong').dataset.state = state;
    line.querySelector('strong').textContent = label;
    results.appendChild(line);
  };

  const scan = async () => {
    if (running || stopped) return;
    const eligible = entries.filter(entry => entry.eligible);
    running = true;
    controller = new AbortController();
    scanButton.disabled = true;
    results.textContent = '';
    progress.style.width = '0%';

    const cache = readCache();
    let done = 0;
    let bans = 0;
    let errors = 0;

    for (const entry of eligible) {
      if (stopped || controller.signal.aborted) break;
      const cached = cache[entry.accountId];
      let result = cached && Date.now() - cached.checkedAt < CACHE_TTL ? cached : null;

      try {
        if (!result) {
          addBadge(entry, 'checking', 'sprawdzam…');
          const response = await fetch(entry.url.split('#')[0], {
            credentials: 'include',
            cache: 'no-store',
            signal: controller.signal
          });
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          result = detectBan(await response.text());
          cache[entry.accountId] = result;
          writeCache(cache);
          await wait(REQUEST_DELAY);
        }

        if (result.banned) {
          bans++;
          addBadge(entry, 'ban', 'BAN');
          addResult(entry, 'ban', 'BAN');
        } else {
          addBadge(entry, 'clear', 'brak bana');
          addResult(entry, 'clear', 'OK');
        }
      } catch (error) {
        if (error.name === 'AbortError') break;
        errors++;
        addBadge(entry, 'error', 'błąd');
        addResult(entry, 'error', 'BŁĄD');
      }

      done++;
      progress.style.width = `${eligible.length ? done / eligible.length * 100 : 100}%`;
      summary.textContent = `Sprawdzono ${done}/${eligible.length} • bany: ${bans} • błędy: ${errors}`;
    }

    running = false;
    scanButton.disabled = false;
    if (!stopped && !controller.signal.aborted) {
      summary.textContent = `Gotowe • sprawdzono: ${done} • bany: ${bans} • błędy: ${errors}`;
    }
  };

  scanButton.addEventListener('click', scan);
  clearButton.addEventListener('click', () => {
    localStorage.removeItem(CACHE_KEY);
    summary.textContent = 'Pamięć wyników została wyczyszczona.';
  });
  scan();

  return () => {
    stopped = true;
    controller?.abort();
    root.remove();
    style.remove();
    document.querySelectorAll('.yss-ban-badge').forEach(node => node.remove());
  };
}

export default {
  id: MODULE_ID,
  name: 'Kontrola banów rankingu',
  version: '1.0.0',
  description: 'Sprawdza bany graczy nieaktywnych co najmniej 24 godziny na bieżącej stronie rankingu.',
  icon: '⛔',
  start() {
    if (!isLadderPage()) return () => {};
    document.getElementById(ROOT_ID)?.remove();
    document.getElementById(STYLE_ID)?.remove();
    return makeScanner();
  }
};
