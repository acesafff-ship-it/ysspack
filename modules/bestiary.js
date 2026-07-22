const MODULE_ID = 'bestiary';
const SOURCE_URL = 'https://raw.githubusercontent.com/acesafff-ship-it/margohelp-bestiariusz/main/MargoHelp-Bestiariusz.user.js';
const GLOBAL_FLAG = '__KROL_YSS_FORUM_ELITE_ITEMS__';
const PRESENCE_FLAG = '__KROL_YSS_BESTIARY_PRESENCE__';
const UI_SELECTORS = [
  '#ky-forum-e2',
  '.kyf-launch',
  '.kyf-widget-tooltip',
  '.kyf-tip',
  '.kyf-release-overlay'
];

function findUi() {
  return UI_SELECTORS.flatMap(selector => [...document.querySelectorAll(selector)]);
}

function hideUi() {
  window[PRESENCE_FLAG]?.stop?.();
  findUi().forEach(element => {
    if (!Object.hasOwn(element.dataset, 'ysspackDisplay')) {
      element.dataset.ysspackDisplay = element.style.display || '';
    }
    element.style.setProperty('display', 'none', 'important');
  });
}

function showUi() {
  findUi().forEach(element => {
    const display = element.dataset.ysspackDisplay;
    element.style.removeProperty('display');
    if (display) element.style.display = display;
    delete element.dataset.ysspackDisplay;
  });
  window[PRESENCE_FLAG]?.start?.();
}

function downloadSource(request) {
  return new Promise((resolve, reject) => {
    request({
      method: 'GET',
      url: `${SOURCE_URL}?t=${Date.now()}`,
      timeout: 20000,
      onload: response => response.status >= 200 && response.status < 300
        ? resolve(response.responseText)
        : reject(new Error(`HTTP ${response.status}`)),
      onerror: () => reject(new Error('Błąd połączenia z GitHubem')),
      ontimeout: () => reject(new Error('Przekroczono czas pobierania Bestiariusza'))
    });
  });
}

function executeBestiary(source, context) {
  const run = new Function(
    'GM_xmlhttpRequest',
    'GM_getValue',
    'GM_setValue',
    'GM_deleteValue',
    `${source}\n//# sourceURL=YssPack-Bestiariusz.user.js`
  );
  run(
    context.GM_xmlhttpRequest,
    context.GM_getValue,
    context.GM_setValue,
    context.GM_deleteValue
  );
}

export default {
  id: MODULE_ID,
  name: 'Bestiariusz Podręczny',
  version: '2.2.35',
  description: 'Elity, Elity II, Herosi, Kolosi i Tytani wraz z przedmiotami, trasami i kalkulatorem łupu.',
  icon: 'B',

  start(context) {
    let stopped = false;

    if (window[GLOBAL_FLAG]) {
      showUi();
    } else {
      downloadSource(context.GM_xmlhttpRequest)
        .then(source => {
          if (stopped) return;
          executeBestiary(source, context);
          if (stopped) hideUi();
        })
        .catch(error => {
          console.error('[YssPack] Nie udało się uruchomić Bestiariusza:', error);
        });
    }

    return () => {
      stopped = true;
      hideUi();
    };
  }
};
