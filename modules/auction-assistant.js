const SOURCE_URL = new URL('../sources/auction-assistant.user.js', import.meta.url);
const CLEANUP_KEY = '__YSSPACK_AUCTION_ASSISTANT_CLEANUP__';
const FLAG_KEY = '__YSSPACK_AUCTION_ASSISTANT__';

function prepareSource(original) {
  let source = original;
  source = source.replace(
    '  "use strict";',
    `  "use strict";\n\n  if (window.${FLAG_KEY}) return;\n  window.${FLAG_KEY} = true;`
  );
  source = source.replace(
    '  let running = false;',
    '  let running = false;\n  let ysspackStopped = false;\n  let ysspackInterval = 0;'
  );
  source = source.replace(
    '  function queueUpdate() {\n    if (queued) return;',
    '  function queueUpdate() {\n    if (ysspackStopped || queued) return;'
  );
  source = source.replace(
    '  setInterval(queueUpdate, 750);',
    '  ysspackInterval = setInterval(queueUpdate, 750);'
  );
  source = source.replace(
    /\n  queueUpdate\(\);\s*\n\}\)\(\);\s*$/,
    `
  window.${CLEANUP_KEY} = () => {
    ysspackStopped = true;
    observer.disconnect();
    clearInterval(ysspackInterval);
    window.removeEventListener("resize", queueUpdate);
    panel?.remove();
    document.getElementById(STYLE_ID)?.remove();
    panel = itemLabel = statusLabel = searchButton = null;
    delete window.${FLAG_KEY};
    delete window.${CLEANUP_KEY};
  };
  queueUpdate();
})();`
  );
  if (!source.includes(`window.${CLEANUP_KEY}`)) throw new Error('Nie udało się przygotować kodu Asystenta Aukcji.');
  return source;
}

export { prepareSource };

async function loadAndRun() {
  const response = await fetch(`${SOURCE_URL.href}?t=${Date.now()}`, { cache: 'no-store' });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const source = prepareSource(await response.text());
  new Function(`${source}\n//# sourceURL=YssPack-Asystent-Aukcji.user.js`)();
}

export default {
  id: 'auction-assistant',
  name: 'Asystent Aukcji',
  version: '1.2.6',
  description: 'Wyszukuje aukcje przedmiotu wybranego do sprzedaży.',
  icon: '⚖',

  start() {
    if (location.hostname === 'www.margonem.pl') return () => {};
    let stopped = false;
    loadAndRun()
      .then(() => { if (stopped) window[CLEANUP_KEY]?.(); })
      .catch(error => console.error('[YssPack] Asystent Aukcji:', error));
    return () => {
      stopped = true;
      window[CLEANUP_KEY]?.();
    };
  }
};
