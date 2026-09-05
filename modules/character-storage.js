const SOURCE_URL = new URL('../sources/character-storage.user.js', import.meta.url);
const CLEANUP_KEY = '__YSSPACK_CHARACTER_STORAGE_CLEANUP__';
const FLAG_KEY = '__YSSPACK_CHARACTER_STORAGE__';
let loadGeneration = 0;

function prepareSource(original) {
  let source = original;
  source = source.replace(
    '  "use strict";',
    `  "use strict";\n\n  if (window.${FLAG_KEY}) return;\n  window.${FLAG_KEY} = true;`
  );
  source = source.replace(
    '  let inventoryObserver = null;',
    '  let inventoryObserver = null;\n  let ysspackStopped = false;\n  let ysspackScanInterval = 0;'
  );
  source = source.replace(
    '    while (Date.now() - started < 60000) {',
    '    while (!ysspackStopped && Date.now() - started < 60000) {'
  );
  source = source.replace(
    '    if (!ready) {',
    '    if (ysspackStopped) return;\n    if (!ready) {'
  );
  source = source.replace(
    '    setInterval(() => snapshotCurrentCharacter(false), SCAN_INTERVAL);',
    '    ysspackScanInterval = setInterval(() => snapshotCurrentCharacter(false), SCAN_INTERVAL);'
  );
  source = source.replace(
    /\n  start\(\)\.catch\(\(error\) => console\.error\("\[Magazyn Postaci\] Błąd uruchamiania:", error\)\);\s*\n\}\)\(\);\s*$/,
    `
  window.${CLEANUP_KEY} = () => {
    ysspackStopped = true;
    inventoryObserver?.disconnect();
    clearInterval(ysspackScanInterval);
    root?.remove();
    tooltip?.remove();
    document.getElementById(ROOT_ID + "-style")?.remove();
    root = panel = launcher = tooltip = null;
    delete window.${FLAG_KEY};
    delete window.${CLEANUP_KEY};
  };
  start().catch((error) => console.error("[Magazyn Postaci] Błąd uruchamiania:", error));
})();`
  );
  if (!source.includes(`window.${CLEANUP_KEY}`)) throw new Error('Nie udało się przygotować kodu Magazynu Postaci.');
  return source;
}

export { prepareSource };

async function loadAndRun(shouldRun) {
  const response = await fetch(`${SOURCE_URL.href}?t=${Date.now()}`, { cache: 'no-store' });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const source = prepareSource(await response.text());
  if (!shouldRun()) return false;
  new Function(`${source}\n//# sourceURL=YssPack-Magazyn-Postaci.user.js`)();
  return true;
}

export default {
  id: 'character-storage',
  name: 'Magazyn Postaci',
  version: '1.4.4',
  description: 'Zapamiętuje i wyświetla zawartość toreb własnych postaci.',
  icon: '🎒',

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
