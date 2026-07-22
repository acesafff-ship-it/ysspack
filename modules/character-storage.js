const SOURCE_URL = new URL('../sources/character-storage.user.js', import.meta.url);
const CLEANUP_KEY = '__YSSPACK_CHARACTER_STORAGE_CLEANUP__';
const FLAG_KEY = '__YSSPACK_CHARACTER_STORAGE__';

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

async function loadAndRun() {
  const response = await fetch(`${SOURCE_URL.href}?t=${Date.now()}`, { cache: 'no-store' });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const source = prepareSource(await response.text());
  new Function(`${source}\n//# sourceURL=YssPack-Magazyn-Postaci.user.js`)();
}

export default {
  id: 'character-storage',
  name: 'Magazyn Postaci',
  version: '1.4.1',
  description: 'Zapamiętuje i wyświetla zawartość toreb własnych postaci.',
  icon: '🎒',

  start() {
    let stopped = false;
    loadAndRun()
      .then(() => { if (stopped) window[CLEANUP_KEY]?.(); })
      .catch(error => console.error('[YssPack] Magazyn Postaci:', error));
    return () => {
      stopped = true;
      window[CLEANUP_KEY]?.();
    };
  }
};
