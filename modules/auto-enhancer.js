const MODULE_ID = 'auto-enhancer';
const STYLE_ID = 'yss-auto-enhancer-style';
const PANEL_ID = 'yss-auto-enhancer';
const STORAGE_KEY = 'yss_auto_enhancer_config';
const FRAME_URL = new URL('../assets/game-window-frame.png', import.meta.url).href;

const DEFAULT_CONFIG = {
  active: false,
  common: true,
  unique: false,
  heroic: false
};

export default {
  id: MODULE_ID,
  name: 'Automatyczne ulepszanie',
  version: '0.1.2',
  description: 'Zapamiętuje ulepszany przedmiot i przygotowuje bezpieczne automatyczne przepalanie wybranych rzadkości.',
  icon: '⚙',

  start() {
    if (location.hostname === 'www.margonem.pl') return () => {};

    let stopped = false;
    let panel = null;
    let settingsOpen = false;
    let config = readConfig();
    let selectedItemId = '';

    injectStyle();
    ensurePanel();
    const interval = window.setInterval(render, 500);
    render();

    return () => {
      stopped = true;
      clearInterval(interval);
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
        <div class="content">
          <div class="right-column-background interface-element-middle-1-background-stretch"></div>
          <div class="inner-content">
          <span class="yss-ae-version">v0.1.2</span>
          <button class="yss-ae-gear" type="button" title="Ustawienia" aria-label="Ustawienia">⚙</button>
          <div class="yss-ae-main">
            <div class="yss-ae-item-frame">
              <div class="yss-ae-item-slot interface-element-one-item-slot-decor"><canvas width="32" height="32"></canvas></div>
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

      panel.querySelector('.yss-ae-gear').addEventListener('click', () => {
        settingsOpen = !settingsOpen;
        panel.querySelector('.yss-ae-settings').hidden = !settingsOpen;
        panel.classList.toggle('settings-open', settingsOpen);
      });
      panel.querySelector('.yss-ae-toggle').addEventListener('click', () => {
        config.active = !config.active;
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

    function render() {
      if (stopped || !panel?.isConnected) return;
      const craft = document.querySelector('.enhance__content');
      const currentItem = craft?.querySelector('.enhance__item--current .item');
      const sourceCanvas = currentItem?.querySelector('.canvas-icon');
      const level = craft?.querySelector('.enhance__item--current .lvl')?.dataset.lvl;
      const progressText = craft?.querySelector('.enhance__progress-text--current')?.textContent?.trim() || '0 / 0';
      const currentBar = craft?.querySelector('.enhance__progress--current')?.style.width || '0%';
      const previewBar = craft?.querySelector('.enhance__progress--preview')?.style.width || '0%';
      const itemId = currentItem ? (currentItem.className.match(/\bitem-id-(\d+)/)?.[1] || '') : '';
      const itemTpl = currentItem ? (currentItem.className.match(/\bitem-tpl-(\d+)/)?.[1] || '') : '';
      const gameItem = itemId ? window.Engine?.items?.getItemById?.(itemId) : null;
      const itemName = gameItem?.name || '';

      if (itemId) selectedItemId = itemId;
      panel.hidden = !craft;
      panel.querySelector('.yss-ae-progress-text').textContent = progressText;
      panel.querySelector('.yss-ae-progress-fill').style.width = currentBar;
      panel.querySelector('.yss-ae-progress-preview').style.width = previewBar;
      panel.querySelector('.yss-ae-level').textContent = `Poziom ulepszenia: ${level ?? '—'} / 5`;
      panel.querySelector('.yss-ae-name').textContent = itemId ? (itemName || `Wybrany przedmiot #${itemTpl}`) : 'Włóż przedmiot do ulepszania';

      const targetCanvas = panel.querySelector('.yss-ae-item-slot canvas');
      const context = targetCanvas.getContext('2d');
      context.clearRect(0, 0, 32, 32);
      if (sourceCanvas) {
        try { context.drawImage(sourceCanvas, 0, 0, 32, 32); } catch (error) { /* ikona odświeży się w kolejnym cyklu */ }
      }

      panel.querySelectorAll('[data-rarity]').forEach(input => { input.checked = Boolean(config[input.dataset.rarity]); });
      const toggle = panel.querySelector('.yss-ae-toggle');
      toggle.classList.toggle('green', !config.active);
      toggle.classList.toggle('red', config.active);
      toggle.querySelector('.label').textContent = config.active ? 'Wyłącz' : 'Włącz';

      const status = panel.querySelector('.yss-ae-status');
      if (!itemId) status.textContent = 'Oczekiwanie na przedmiot.';
      else if (!config.active) status.textContent = 'Przedmiot zapamiętany. Automat jest wyłączony.';
      else status.textContent = `Automat aktywny dla przedmiotu ID ${selectedItemId}.`;
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
    #${PANEL_ID} > .content {
      position:absolute !important; inset:0 !important; overflow:hidden !important;
      border-width:0 11px !important; border-style:solid !important;
      border-image:url("/img/gui/middle_graphics.png?v=1785244275300") 0 11 fill / 1 / 0 round !important;
      background:transparent !important;
    }
    #${PANEL_ID} > .content > .right-column-background {
      position:absolute !important; z-index:0 !important; inset:-10px !important;
      display:block !important; width:auto !important; height:auto !important;
      pointer-events:none !important;
    }
    #${PANEL_ID} .inner-content { position:relative; z-index:1; height:100%; padding:18px 10px 4px; }
    #${PANEL_ID} .header-label-positioner { z-index:5; cursor:move; user-select:none; touch-action:none; }
    #${PANEL_ID} .header-label .text { color:#ead9c0 !important; text-shadow:1px 1px #000; }
    .yss-ae-version { position:absolute; top:2px; right:3px; color:#b8aa96; font-size:9px; }
    .yss-ae-gear { position:absolute; z-index:2; top:14px; right:7px; width:29px; height:29px; padding:0; border:1px solid #101010; border-radius:5px; background:linear-gradient(#466f35,#183511); box-shadow:inset 0 0 0 2px #929292,inset 0 0 0 3px #111; color:#ddd; font-size:16px; line-height:27px; text-align:center; text-shadow:1px 1px #000; cursor:pointer; }
    .yss-ae-item-frame { display:flex; min-height:64px; padding:8px; align-items:center; gap:10px; border:1px solid #67492d; background:rgba(0,0,0,.25); }
    .yss-ae-item-slot { position:relative; flex:0 0 42px; width:42px; height:42px; padding:5px; }
    .yss-ae-item-slot canvas { display:block; width:32px; height:32px; image-rendering:pixelated; }
    .yss-ae-item-copy { display:flex; min-width:0; flex-direction:column; gap:4px; padding-right:25px; }
    .yss-ae-name { overflow:hidden; color:#f3d669; text-overflow:ellipsis; white-space:nowrap; }
    .yss-ae-level { color:#c4b59e; }
    .yss-ae-progress { position:relative; height:17px; margin:10px 2px; overflow:hidden; border:1px solid #887051; background:#090909; box-shadow:inset 0 0 3px #000; }
    .yss-ae-progress-fill,.yss-ae-progress-preview { position:absolute; inset:0 auto 0 0; width:0; }
    .yss-ae-progress-fill { background:linear-gradient(#347eb4,#174d7b); }
    .yss-ae-progress-preview { background:rgba(89,167,213,.35); }
    .yss-ae-progress-text { position:absolute; inset:0; color:#fff; font-weight:bold; line-height:15px; text-align:center; text-shadow:1px 1px #000; }
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
