const MODULE_ID = 'auto-enhancer';
const STYLE_ID = 'yss-auto-enhancer-style';
const PANEL_ID = 'yss-auto-enhancer';
const STORAGE_KEY = 'yss_auto_enhancer_config';
const FRAME_URL = new URL('../assets/game-window-frame.png', import.meta.url).href;

const DEFAULT_CONFIG = {
  active: false,
  common: true,
  unique: false,
  heroic: false,
  targetItemId: '',
  targetTpl: '',
  targetName: '',
  batchSize: 10
};

export default {
  id: MODULE_ID,
  name: 'Automatyczne ulepszanie',
  version: '0.3.1',
  description: 'Automatycznie przepala wybrane rzadkości, pokazuje poziom i postęp ulepszania oraz chroni przedmioty legendarne.',
  icon: '⚙',

  start() {
    if (location.hostname === 'www.margonem.pl') return () => {};

    let stopped = false;
    let panel = null;
    let settingsOpen = false;
    let minimized = false;
    let closed = false;
    let selectionMode = false;
    let automationBusy = false;
    let nextAutomationAt = 0;
    let automationMessage = '';
    let lastBufferCount = 0;
    let savedProgress = null;
    let config = readConfig();
    let selectedItemId = String(config.targetItemId || '');

    injectStyle();
    ensurePanel();
    const interval = window.setInterval(tick, 750);
    render();

    return () => {
      stopped = true;
      clearInterval(interval);
      document.removeEventListener('click', selectInventoryItem, true);
      document.getElementById(PANEL_ID)?.remove();
      document.getElementById(STYLE_ID)?.remove();
    };

    function ensurePanel() {
      panel = document.getElementById(PANEL_ID);
      if (panel) return;

      panel = document.createElement('section');
      panel.id = PANEL_ID;
      panel.className = 'c-window border-window';
      panel.innerHTML = `
        <div class="header-label-positioner yss-ae-drag">
          <div class="header-label">
            <div class="left-decor"></div><div class="right-decor"></div>
            <div class="text">Auto Ulepszanie</div>
          </div>
        </div>
        <button class="yss-ae-minimize" type="button" title="Minimalizuj" aria-label="Minimalizuj">−</button>
        <div class="close-button-corner-decor">
          <button class="close-button yss-ae-close" type="button" aria-label="Zamknij"></button>
        </div>
        <div class="content">
          <div class="right-column-background interface-element-middle-1-background-stretch"></div>
          <div class="inner-content">
          <span class="yss-ae-version">v0.3.1</span>
          <button class="yss-ae-gear" type="button" title="Ustawienia" aria-label="Ustawienia">⚙</button>
          <div class="yss-ae-main">
            <div class="yss-ae-item-frame">
              <button class="yss-ae-item-slot interface-element-one-item-slot-decor" type="button" title="Wybierz przedmiot z ekwipunku"><canvas width="32" height="32"></canvas></button>
              <div class="yss-ae-item-copy">
                <strong class="yss-ae-name">Włóż przedmiot do ulepszania</strong>
                <span class="yss-ae-level">Poziom ulepszenia: —</span>
              </div>
            </div>
            <div class="yss-ae-progress">
              <div class="yss-ae-progress-fill"></div>
              <div class="yss-ae-progress-preview"></div>
              <span class="yss-ae-progress-text">0 / 0</span>
            </div>
            <div class="yss-ae-buffer">Bufor: 0 przedmiotów</div>
            <button class="yss-ae-toggle button small green" type="button">
              <span class="background"></span><span class="label">Włącz</span>
            </button>
            <div class="yss-ae-status">Oczekiwanie na przedmiot.</div>
          </div>
          <div class="yss-ae-settings" hidden>
            <div class="yss-ae-settings-title">Przepalaj automatycznie:</div>
            ${rarityControl('common', 'Pospolite')}
            ${rarityControl('unique', 'Unikatowe')}
            ${rarityControl('heroic', 'Heroiczne')}
            <label class="disabled"><input type="checkbox" disabled> <span>Legendarne</span><em>Zawsze chronione</em></label>
            <div class="yss-ae-warning">Przedmioty legendarne nigdy nie zostaną użyte.</div>
          </div>
          <footer>
            <div>Autor dodatku: <a href="https://www.margonem.pl/profile/view,10050726#char_5601,luvia" target="_blank" rel="noopener noreferrer">Król Yss</a></div>
            <div>Grafiki są własnością <a href="https://garmory.pl/" target="_blank" rel="noopener noreferrer">Garmory</a>.</div>
          </footer>
          </div>
        </div>
        <div class="c-window__bottom-bar"><div class="interface-element-bottom-bar-background-stretch"></div></div>`;
      document.body.append(panel);

      panel.querySelector('.yss-ae-close').addEventListener('click', () => {
        closed = true;
        selectionMode = false;
        panel.hidden = true;
      });
      panel.querySelector('.yss-ae-minimize').addEventListener('click', toggleMinimized);
      panel.querySelector('.header-label .text').addEventListener('dblclick', toggleMinimized);
      panel.querySelector('.yss-ae-item-slot').addEventListener('click', event => {
        event.stopPropagation();
        selectionMode = true;
        panel.classList.add('selecting-item');
        panel.querySelector('.yss-ae-status').textContent = 'Kliknij przedmiot w ekwipunku.';
      });
      document.addEventListener('click', selectInventoryItem, true);
      panel.querySelector('.yss-ae-gear').addEventListener('click', () => {
        settingsOpen = !settingsOpen;
        panel.querySelector('.yss-ae-settings').hidden = !settingsOpen;
        panel.classList.toggle('settings-open', settingsOpen);
      });
      panel.querySelector('.yss-ae-toggle').addEventListener('click', () => {
        config.active = !config.active;
        nextAutomationAt = 0;
        automationMessage = '';
        saveConfig();
        render();
      });
      panel.querySelectorAll('[data-rarity]').forEach(input => {
        input.addEventListener('change', () => {
          config[input.dataset.rarity] = input.checked;
          saveConfig();
          render();
        });
      });
      bindDrag(panel, panel.querySelector('.yss-ae-drag'));
    }

    function tick() {
      render();
      if (!automationBusy && Date.now() >= nextAutomationAt) {
        void runAutomation();
      }
    }

    function toggleMinimized() {
      minimized = !minimized;
      panel.classList.toggle('minimized', minimized);
      panel.querySelector('.yss-ae-minimize').textContent = minimized ? '+' : '−';
      panel.querySelector('.yss-ae-minimize').title = minimized ? 'Rozwiń' : 'Minimalizuj';
    }

    function selectInventoryItem(event) {
      if (!selectionMode || stopped) return;
      const itemElement = event.target.closest?.('.item');
      if (!itemElement || itemElement.closest(`#${PANEL_ID}`)) return;
      const itemId = itemElement.className.match(/\bitem-id-(\d+)/)?.[1] || '';
      if (!itemId) return;

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      selectedItemId = itemId;
      config.targetItemId = itemId;
      const selectedGameItem = window.Engine?.items?.getItemById?.(Number(itemId));
      config.targetTpl = String(selectedGameItem?.tpl || '');
      config.targetName = String(selectedGameItem?.name || '');
      savedProgress = null;
      automationMessage = '';
      nextAutomationAt = 0;
      selectionMode = false;
      panel.classList.remove('selecting-item');
      saveConfig();
      copyItemCanvas(itemElement.querySelector('.canvas-icon'));
      render();
    }

    function render() {
      if (stopped || !panel?.isConnected) return;
      recoverTargetItem();
      const craft = document.querySelector('.enhance__content');
      const currentItem = craft?.querySelector('.enhance__item--current .item');
      const sourceCanvas = currentItem?.querySelector('.canvas-icon');
      const level = craft?.querySelector('.enhance__item--current .lvl')?.dataset.lvl;
      const progressText = craft?.querySelector('.enhance__progress-text--current')?.textContent?.trim() || '0 / 0';
      const currentBar = craft?.querySelector('.enhance__progress--current')?.style.width || '0%';
      const previewBar = craft?.querySelector('.enhance__progress--preview')?.style.width || '0%';
      const craftItemId = currentItem ? (currentItem.className.match(/\bitem-id-(\d+)/)?.[1] || '') : '';
      const itemId = craftItemId || selectedItemId;
      const itemTpl = currentItem ? (currentItem.className.match(/\bitem-tpl-(\d+)/)?.[1] || '') : '';
      const gameItem = itemId ? window.Engine?.items?.getItemById?.(itemId) : null;
      const itemName = gameItem?.name || '';
      const storedLevel = readUpgradeLevel(gameItem);

      if (craftItemId && craftItemId !== selectedItemId) {
        selectedItemId = craftItemId;
        config.targetItemId = craftItemId;
        const craftGameItem = window.Engine?.items?.getItemById?.(Number(craftItemId));
        config.targetTpl = String(craftGameItem?.tpl || '');
        config.targetName = String(craftGameItem?.name || '');
        saveConfig();
      }
      panel.hidden = closed;
      const displayedLevel = level ?? savedProgress?.upgradeLevel ?? storedLevel ?? '—';
      panel.querySelector('.yss-ae-progress-text').textContent = craft
        ? progressText
        : savedProgress
          ? `${savedProgress.current} / ${savedProgress.max}`
          : '0 / 0';
      panel.querySelector('.yss-ae-progress-fill').style.width = craft
        ? currentBar
        : progressPercent(savedProgress);
      panel.querySelector('.yss-ae-progress-preview').style.width = craft ? previewBar : '0%';
      panel.querySelector('.yss-ae-level').textContent = `Poziom ulepszenia: ${displayedLevel} / 5`;
      panel.querySelector('.yss-ae-name').textContent = itemId ? (itemName || `Wybrany przedmiot #${itemTpl}`) : 'Włóż przedmiot do ulepszania';

      if (sourceCanvas) {
        copyItemCanvas(sourceCanvas);
      } else if (itemId) {
        copyItemCanvas(document.querySelector(`.item-id-${CSS.escape(String(itemId))} .canvas-icon`));
      } else if (!itemId) {
        clearItemCanvas();
      }

      panel.querySelectorAll('[data-rarity]').forEach(input => { input.checked = Boolean(config[input.dataset.rarity]); });
      const toggle = panel.querySelector('.yss-ae-toggle');
      toggle.classList.toggle('green', !config.active);
      toggle.classList.toggle('red', config.active);
      toggle.querySelector('.label').textContent = config.active ? 'Wyłącz' : 'Włącz';

      const status = panel.querySelector('.yss-ae-status');
      panel.querySelector('.yss-ae-buffer').textContent = `Bufor: ${lastBufferCount} przedmiotów`;
      if (selectionMode) status.textContent = 'Kliknij przedmiot w ekwipunku.';
      else if (!itemId) status.textContent = 'Kliknij pusty slot i wybierz przedmiot z ekwipunku.';
      else if (!config.active) status.textContent = 'Przedmiot zapamiętany. Automat jest wyłączony.';
      else if (automationMessage) status.textContent = automationMessage;
      else if (!craft) status.textContent = 'Automat czeka na pasujący przedmiot.';
      else status.textContent = `Automat aktywny dla przedmiotu ID ${selectedItemId}.`;
    }

    async function runAutomation() {
      if (stopped || !config.active || !selectedItemId || selectionMode) return;
      const engine = window.Engine;
      const target = engine?.items?.getItemById?.(Number(selectedItemId));
      if (!target || typeof window._g !== 'function') {
        automationMessage = 'Oczekiwanie na dane przedmiotu.';
        return;
      }

      automationBusy = true;
      nextAutomationAt = Date.now() + 2500;
      try {
        const possibleItems = getRarityCandidates(engine);
        lastBufferCount = possibleItems.length;
        if (!possibleItems.length) {
          automationMessage = 'Brak wybranych rzadkości w ekwipunku.';
          nextAutomationAt = Date.now() + 5000;
          return;
        }

        automationMessage = 'Sprawdzanie bezpiecznych składników...';
        engine.crafting.tempEnhanceItemId = Number(selectedItemId);
        rememberProgress(await gameRequest(`enhancement&action=open&item=${selectedItemId}`));
        const enhancement = await waitForEnhancement();
        const candidates = getSafeReagents(engine, enhancement);
        lastBufferCount = candidates.length;

        if (!candidates.length) {
          automationMessage = 'Brak pasujących przedmiotów w ekwipunku.';
          nextAutomationAt = Date.now() + 5000;
          return;
        }

        const ids = candidates
          .slice(0, Math.max(1, Math.min(25, Number(config.batchSize) || 10)))
          .map(item => Number(item.id));
        const ingredients = ids.join(',');

        automationMessage = `Sprawdzanie ${ids.length} przedmiotów...`;
        rememberProgress(await gameRequest(
          `enhancement&action=progress_preview&item=${selectedItemId}&ingredients=${ingredients}`
        ));

        automationMessage = `Ulepszanie (${ids.length} składników)...`;
        const response = await gameRequest(
          `enhancement&action=progress&item=${selectedItemId}&ingredients=${ingredients}`
        );
        rememberProgress(response);

        const enhancementData = response?.enhancement;
        if (enhancementData?.upgradable) {
          const level = Number(enhancementData.upgradable.upgradeLevel ?? readUpgradeLevel(target));
          if (level < 4) {
            automationMessage = 'Podnoszenie poziomu ulepszenia...';
            rememberProgress(await gameRequest(`enhancement&action=upgrade&item=${selectedItemId}`));
          } else {
            config.active = false;
            saveConfig();
            automationMessage = 'Wybierz premię 5. poziomu w Rzemiośle.';
          }
        } else {
          automationMessage = `Zużyto ${ids.length} przedmiotów.`;
        }
      } catch (error) {
        automationMessage = `Automat wstrzymany: ${friendlyError(error)}`;
        nextAutomationAt = Date.now() + 6000;
      } finally {
        closeCraftingSafely();
        automationBusy = false;
        render();
      }
    }

    function recoverTargetItem() {
      const engine = window.Engine;
      if (!engine?.items) return;
      if (selectedItemId && engine.items.getItemById?.(Number(selectedItemId))) return;

      const tpl = Number(config.targetTpl);
      const name = String(config.targetName || '');
      if (tpl || name) {
        const enabledIds = engine.disableItemsManager?.getEnabledItems?.() || [];
        const replacement = enabledIds
          .map(id => engine.items.getItemById?.(id))
          .find(item => item && (!tpl || Number(item.tpl) === tpl) && (!name || item.name === name));
        if (replacement) {
          selectedItemId = String(replacement.id);
          config.targetItemId = selectedItemId;
          config.targetTpl = String(replacement.tpl || '');
          config.targetName = String(replacement.name || '');
          automationMessage = 'Przywrócono przedmiot po ponownym logowaniu.';
          saveConfig();
          return;
        }
      }

      if (selectedItemId) {
        selectedItemId = '';
        config.targetItemId = '';
        automationMessage = 'Wybierz ponownie przedmiot do ulepszania.';
        saveConfig();
        clearItemCanvas();
      }
    }

    function getSafeReagents(engine, enhancement) {
      const possibleItems = getRarityCandidates(engine);
      return possibleItems.filter(item => {
        try {
          return Number(enhancement.getReagentBonus(item)) > 0;
        } catch (error) {
          return false;
        }
      });
    }

    function getRarityCandidates(engine) {
      const enabledIds = engine.disableItemsManager?.getEnabledItems?.() || [];
      const allowed = new Set([
        config.common && 'common',
        config.unique && 'unique',
        config.heroic && 'heroic'
      ].filter(Boolean));

      return enabledIds
        .map(id => engine.items?.getItemById?.(id))
        .filter(Boolean)
        .filter(item => String(item.id) !== String(selectedItemId))
        .filter(item => allowed.has(getRarity(item)))
        .filter(item => getRarity(item) !== 'legendary');
    }

    function getRarity(item) {
      const raw = String(
        item?._cachedStats?.rarity ??
        item?.getItemStat?.(window.Engine?.itemStatsData?.rarity) ??
        ''
      ).toLowerCase();
      if (!raw || raw === 'normal' || raw === 'common' || raw === 'pospolity') return 'common';
      if (raw.includes('unique') || raw.includes('unikat')) return 'unique';
      if (raw.includes('heroic') || raw.includes('heroicz')) return 'heroic';
      if (raw.includes('legend')) return 'legendary';
      return raw;
    }

    function gameRequest(query) {
      return new Promise((resolve, reject) => {
        let settled = false;
        const timer = window.setTimeout(() => {
          if (!settled) {
            settled = true;
            reject(new Error('brak odpowiedzi gry'));
          }
        }, 8000);

        try {
          window._g(query, response => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            if (response?.e === 'ok' || !response?.e) resolve(response || {});
            else reject(new Error(String(response.e)));
          });
        } catch (error) {
          clearTimeout(timer);
          reject(error);
        }
      });
    }

    async function waitForEnhancement() {
      const deadline = Date.now() + 3000;
      while (Date.now() < deadline) {
        const enhancement = window.Engine?.crafting?.enhancement;
        if (enhancement && String(enhancement.selectedEnhanceItem) === String(selectedItemId)) {
          return enhancement;
        }
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      throw new Error('nie udało się otworzyć sesji ulepszania');
    }

    function closeCraftingSafely() {
      try {
        if (window.Engine?.crafting?.itemCraft?.opened) {
          window.Engine.crafting.itemCraft.close();
        }
      } catch (error) {
        // Zamknięcie okna nie może zatrzymać automatu.
      }
    }

    function friendlyError(error) {
      const message = String(error?.message || error || 'nieznany błąd');
      return message.length > 70 ? `${message.slice(0, 67)}...` : message;
    }

    function rememberProgress(response) {
      const data = response?.enhancement;
      const progress = data?.progressing || data?.upgradable || data?.progress_preview;
      if (!progress) return;
      const current = Number(progress.current);
      const max = Number(progress.max);
      const upgradeLevel = Number(progress.upgradeLevel);
      if (Number.isFinite(current) && Number.isFinite(max)) {
        savedProgress = {
          current,
          max,
          upgradeLevel: Number.isFinite(upgradeLevel) ? upgradeLevel : readUpgradeLevel(
            window.Engine?.items?.getItemById?.(Number(selectedItemId))
          )
        };
      }
    }

    function progressPercent(progress) {
      if (!progress || !Number(progress.max)) return '0%';
      return `${Math.max(0, Math.min(100, (100 * Number(progress.current)) / Number(progress.max)))}%`;
    }

    function readUpgradeLevel(item) {
      if (!item) return null;
      const statName = window.Engine?.itemStatsData?.enhancement_upgrade_lvl;
      const values = [
        item.getEnhancementUpgradeLvl?.(),
        statName ? item.getItemStat?.(statName) : null,
        item._cachedStats?.enhancement_upgrade_lvl
      ];
      for (const value of values) {
        const parsed = Number.parseInt(value, 10);
        if (Number.isFinite(parsed)) return parsed;
      }
      return 0;
    }

    function clearItemCanvas() {
      const targetCanvas = panel.querySelector('.yss-ae-item-slot canvas');
      targetCanvas.getContext('2d').clearRect(0, 0, 32, 32);
    }

    function copyItemCanvas(sourceCanvas) {
      if (!sourceCanvas) return;
      const targetCanvas = panel.querySelector('.yss-ae-item-slot canvas');
      const context = targetCanvas.getContext('2d');
      context.clearRect(0, 0, 32, 32);
      try { context.drawImage(sourceCanvas, 0, 0, 32, 32); } catch (error) { /* ikona odświeży się później */ }
    }

    function readConfig() {
      try {
        return { ...DEFAULT_CONFIG, ...JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') };
      } catch (error) {
        return { ...DEFAULT_CONFIG };
      }
    }

    function saveConfig() {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
    }
  }
};

function rarityControl(key, label) {
  return `<label><input type="checkbox" data-rarity="${key}"> <span>${label}</span></label>`;
}

function bindDrag(panel, handle) {
  let startX = 0;
  let startY = 0;
  let startLeft = 0;
  let startTop = 0;
  handle.addEventListener('pointerdown', event => {
    if (event.button !== 0) return;
    const rect = panel.getBoundingClientRect();
    startX = event.clientX;
    startY = event.clientY;
    startLeft = rect.left;
    startTop = rect.top;
    handle.setPointerCapture(event.pointerId);
  });
  handle.addEventListener('pointermove', event => {
    if (!handle.hasPointerCapture(event.pointerId)) return;
    panel.style.right = 'auto';
    panel.style.left = `${Math.max(0, Math.min(innerWidth - panel.offsetWidth, startLeft + event.clientX - startX))}px`;
    panel.style.top = `${Math.max(0, Math.min(innerHeight - panel.offsetHeight, startTop + event.clientY - startY))}px`;
  });
  handle.addEventListener('pointerup', event => {
    if (handle.hasPointerCapture(event.pointerId)) handle.releasePointerCapture(event.pointerId);
  });
}

function injectStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    #${PANEL_ID}, #${PANEL_ID} * { box-sizing: border-box; }
    #${PANEL_ID}.c-window {
      position: fixed !important; z-index: 100 !important; top: 260px; right: 34px;
      width: 310px !important; height: 272px !important; border: 20px solid transparent !important;
      border-image: url("${FRAME_URL}") 32 20 fill / 1 / 0 stretch !important;
      background: transparent !important; color: #ead9c0; filter: drop-shadow(0 4px 7px #000);
      font: 11px/14px Arial, sans-serif;
    }
    #${PANEL_ID}.settings-open { height: 420px !important; }
    #${PANEL_ID}.minimized {
      width:190px !important; height:0 !important;
      border-width:20px !important;
    }
    #${PANEL_ID}.minimized > .content,
    #${PANEL_ID}.minimized > .c-window__bottom-bar,
    #${PANEL_ID}.minimized > .close-button-corner-decor { display:none !important; }
    #${PANEL_ID} > .content { position:absolute !important; inset:0 !important; overflow:hidden !important; background:transparent !important; }
    #${PANEL_ID} > .content > .right-column-background {
      position:absolute !important; z-index:0 !important; inset:0 !important;
      display:block !important; width:100% !important; height:100% !important;
      pointer-events:none !important;
    }
    #${PANEL_ID} .inner-content { position:relative; z-index:1; height:100%; padding:18px 10px 4px; }
    #${PANEL_ID} .header-label-positioner { z-index:5; cursor:move; user-select:none; touch-action:none; }
    #${PANEL_ID} .header-label .text { color:#ead9c0 !important; text-shadow:1px 1px #000; }
    #${PANEL_ID} > .close-button-corner-decor { z-index:7 !important; }
    .yss-ae-minimize {
      position:absolute; z-index:8; top:-18px; right:13px;
      width:20px; height:18px; padding:0;
      border:1px solid #111; border-radius:3px;
      background:linear-gradient(#555,#242424); box-shadow:inset 0 0 0 1px #999;
      color:#eee; font:bold 15px/15px Arial; text-align:center; text-shadow:1px 1px #000; cursor:pointer;
    }
    #${PANEL_ID}.minimized .yss-ae-minimize { top:-18px; right:-13px; }
    .yss-ae-version { position:absolute; top:2px; right:3px; color:#b8aa96; font-size:9px; }
    .yss-ae-gear { position:absolute; z-index:2; top:14px; right:7px; width:29px; height:29px; padding:0; border:1px solid #101010; border-radius:5px; background:linear-gradient(#466f35,#183511); box-shadow:inset 0 0 0 2px #929292,inset 0 0 0 3px #111; color:#ddd; font-size:16px; line-height:27px; text-align:center; text-shadow:1px 1px #000; cursor:pointer; }
    .yss-ae-item-frame { display:flex; min-height:64px; padding:8px; align-items:center; gap:10px; border:1px solid #67492d; background:rgba(0,0,0,.25); }
    .yss-ae-item-slot { position:relative; flex:0 0 42px; width:42px; height:42px; padding:5px; border:0; background-color:transparent; cursor:pointer; }
    .yss-ae-item-slot canvas { display:block; width:32px; height:32px; image-rendering:pixelated; }
    #${PANEL_ID}.selecting-item .yss-ae-item-slot { filter:drop-shadow(0 0 4px #ffe56a); }
    .yss-ae-item-copy { display:flex; min-width:0; flex-direction:column; gap:4px; padding-right:25px; }
    .yss-ae-name { overflow:hidden; color:#f3d669; text-overflow:ellipsis; white-space:nowrap; }
    .yss-ae-level { color:#c4b59e; }
    .yss-ae-progress { position:relative; height:17px; margin:10px 2px; overflow:hidden; border:1px solid #887051; background:#090909; box-shadow:inset 0 0 3px #000; }
    .yss-ae-progress-fill,.yss-ae-progress-preview { position:absolute; inset:0 auto 0 0; width:0; }
    .yss-ae-progress-fill { background:linear-gradient(#347eb4,#174d7b); }
    .yss-ae-progress-preview { background:rgba(89,167,213,.35); }
    .yss-ae-progress-text { position:absolute; inset:0; color:#fff; font-weight:bold; line-height:15px; text-align:center; text-shadow:1px 1px #000; }
    .yss-ae-buffer { margin:-4px 0 7px; color:#c4b59e; font-size:9px; text-align:center; }
    #${PANEL_ID} .yss-ae-toggle { display:flex !important; width:100% !important; height:28px !important; align-items:center; justify-content:center; cursor:pointer; }
    #${PANEL_ID} .yss-ae-toggle .label { position:relative !important; inset:auto !important; display:flex !important; width:100%; height:100%; align-items:center; justify-content:center; }
    .yss-ae-status { margin:8px 0; color:#9ed86d; text-align:center; }
    .yss-ae-settings { margin-top:9px; padding:8px; border-top:1px solid #67492d; background:rgba(0,0,0,.2); }
    .yss-ae-settings[hidden] { display:none; }
    .yss-ae-settings-title { margin-bottom:6px; color:#f3d669; font-weight:bold; }
    .yss-ae-settings label { display:flex; min-height:26px; align-items:center; gap:6px; border-bottom:1px solid rgba(103,73,45,.35); }
    .yss-ae-settings label em { margin-left:auto; color:#bd6b61; font-size:9px; font-style:normal; }
    .yss-ae-settings label.disabled { color:#777; }
    .yss-ae-warning { padding-top:8px; color:#d29b64; font-size:9px; text-align:center; }
    #${PANEL_ID} footer { position:absolute; right:0; bottom:2px; left:0; color:#796a4d; font-size:8px; line-height:11px; text-align:center; }
    #${PANEL_ID} footer a { color:#d8ba70; text-decoration:none; }
  `;
  document.head.append(style);
}
