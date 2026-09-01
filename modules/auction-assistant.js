const SOURCE_URL = new URL('../sources/auction-assistant.user.js', import.meta.url);
const CLEANUP_KEY = '__YSSPACK_AUCTION_ASSISTANT_CLEANUP__';
const FLAG_KEY = '__YSSPACK_AUCTION_ASSISTANT__';
let loadGeneration = 0;

function prepareSource(original) {
  let source = original;
  source = source.replace(
    '  "use strict";',
    `  "use strict";\n\n  if (window.${FLAG_KEY}) return;\n  window.${FLAG_KEY} = true;`
  );
  source = source.replace(
    '  let running = false;',
    '  let running = false;\n  let ysspackStopped = false;'
  );
  source = source.replace(
    '  function queueUpdate() {\n    if (queued) return;',
    '  function queueUpdate() {\n    if (ysspackStopped || queued) return;'
  );
  source = source.replace(
    /\n  queueUpdate\(\);\s*\n\}\)\(\);\s*$/,
    `
  window.${CLEANUP_KEY} = () => {
    ysspackStopped = true;
    observer.disconnect();
    clearInterval(refreshInterval);
    clearTimeout(lookupTimer);
    clearTimeout(iconHydrationTimer);
    window.removeEventListener("resize", queueUpdate);
    panel?.remove();
    document.getElementById(STYLE_ID)?.remove();
    panel = itemLabel = statusLabel = searchButton = offersList = undercutToggle = undercutInput = null;
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

async function loadAndRun(shouldRun) {
  const response = await fetch(`${SOURCE_URL.href}?t=${Date.now()}`, { cache: 'no-store' });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const source = prepareSource(await response.text());
  if (!shouldRun()) return false;
  new Function(`${source}\n//# sourceURL=YssPack-Asystent-Aukcji.user.js`)();
  return true;
}

export default {
  id: 'auction-assistant',
  name: 'Asystent Aukcji',
  version: '2.0.17',
  description: 'Automatycznie pobiera ceny przedmiotu bez otwierania listy aukcji.',
  icon: '⚖',

  start(context = {}) {
    if (location.hostname === 'www.margonem.pl') return () => {};
    let stopped = false;
    const generation = ++loadGeneration;
    loadAndRun(() => !stopped && generation === loadGeneration)
      .then(started => { if (started && (stopped || generation !== loadGeneration)) window[CLEANUP_KEY]?.(); })
      .catch(error => {
        if (!stopped && generation === loadGeneration) context.onError?.(error);
      });
    return () => {
      stopped = true;
      if (generation === loadGeneration) loadGeneration += 1;
      window[CLEANUP_KEY]?.();
    };
  }
};
