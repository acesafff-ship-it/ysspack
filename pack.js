const host = document.yssPack;

if (!host || document.querySelector('#ysspack')) {
  throw new Error('[YssPack] Loader nie jest aktywny albo panel został już uruchomiony.');
}

const PACK_VERSION = '0.15.54';
const UPDATE_MANIFEST_URL = new URL('manifest.json', import.meta.url).href;
const UPDATE_INSTALL_URL = new URL('YssPack.user.js', import.meta.url).href;
const STORAGE_PREFIX = 'ysspack_';
const WIDGET_KEY = 'addon_ysspack';
const today = new Date();
const moduleCacheKey = [today.getFullYear(), String(today.getMonth() + 1).padStart(2, '0'), String(today.getDate()).padStart(2, '0')].join('');
const moduleFiles = [
  'modules/bestiary.js',
  'modules/item-time.js',
  'modules/chat-item-icons.js',
  'modules/auction-assistant.js',
  'modules/character-storage.js',
  'modules/player-actions.js',
  'modules/ranking-ban-scanner.js',
  'modules/battle-log-reader.js',
  'modules/tytan-help.js'
];
const modules = [];
const cleanups = new Map();

for (const file of moduleFiles) {
  try {
    const url = new URL(file, import.meta.url);
    url.searchParams.set('t', `${PACK_VERSION}-${moduleCacheKey}`);
    const imported = await import(url.href);
    if (imported.default?.id) modules.push(imported.default);
  } catch (error) {
    console.error(`[YssPack] Nie udało się wczytać modułu ${file}:`, error);
  }
}

const read = (key, fallback) => {
  try {
    const value = host.GM_getValue(STORAGE_PREFIX + key, fallback);
    return value === undefined ? fallback : value;
  } catch (error) {
    return fallback;
  }
};

const write = (key, value) => {
  try { host.GM_setValue(STORAGE_PREFIX + key, value); } catch (error) { /* zapis nie blokuje panelu */ }
};

const moduleKey = (id, suffix) => `module_${id}_${suffix}`;
const isEnabled = id => Boolean(read(moduleKey(id, 'enabled'), false));
const getSetting = (id, key, fallback) => read(moduleKey(id, `setting_${key}`), fallback);
const setSetting = (id, key, value) => write(moduleKey(id, `setting_${key}`), value);
const logoUrl = new URL('assets/logo-ysspack-puzzle.png', import.meta.url).href;
const moduleIconUrls = Object.fromEntries([
  'bestiary',
  'item-time',
  'chat-item-icons',
  'auction-assistant',
  'character-storage',
  'player-actions',
  'ranking-ban-scanner',
  'battle-log-reader',
  'tytan-help'
].map(id => [id, {
  enabled: new URL(`assets/module-${id}-enabled.png`, import.meta.url).href,
  disabled: new URL(`assets/module-${id}-disabled.png`, import.meta.url).href
}]));
const moduleIconUrl = (id, enabled = isEnabled(id)) => moduleIconUrls[id]?.[enabled ? 'enabled' : 'disabled'] || logoUrl;

const panel = document.createElement('section');
panel.id = 'ysspack';
panel.className = 'c-window border-window';
panel.innerHTML = `
  <div class="header-label-positioner mhp-drag-handle">
    <div class="header-label">
      <div class="left-decor"></div><div class="right-decor"></div>
      <div class="text">Dodatki YSS</div>
    </div>
  </div>
  <div class="content"><div class="inner-content">
    <span class="mhp-version">v${PACK_VERSION}</span>
    <div class="mhp-layout">
      <section class="mhp-left-column">
        <div class="mhp-column-background interface-element-middle-3-background-stretch"></div>
        <div class="mhp-list-heading">Lista dodatków</div>
        <div class="mhp-toolbar"><input class="mhp-search" type="search" placeholder="Szukaj"></div>
        <div class="mhp-list"></div>
      </section>
      <section class="mhp-right-column">
        <div class="mhp-column-background interface-element-middle-2-background-stretch"></div>
        <div class="mhp-detail-header"></div>
        <div class="mhp-detail-body"></div>
        <footer class="mhp-footer">
          <div>Autor dodatku: <a href="https://www.margonem.pl/profile/view,10050726#char_5601,luvia" target="_blank" rel="noopener noreferrer">Król Yss</a></div>
          <div>Grafiki są własnością <a href="https://garmory.pl/" target="_blank" rel="noopener noreferrer">Garmory</a>.</div>
        </footer>
      </section>
    </div>
  </div></div>
  <div class="mhp-outer-side-rail mhp-outer-side-rail-left" aria-hidden="true"></div>
  <div class="mhp-outer-side-rail mhp-outer-side-rail-right" aria-hidden="true"></div>
  <div class="c-window__bottom-bar"><div class="interface-element-bottom-bar-background-stretch"></div></div>
  <div class="close-button-corner-decor"><button class="close-button mhp-close" type="button" aria-label="Zamknij"></button></div>`;

document.body.append(panel);

const list = panel.querySelector('.mhp-list');
const search = panel.querySelector('.mhp-search');
const detailHeader = panel.querySelector('.mhp-detail-header');
const detailBody = panel.querySelector('.mhp-detail-body');
let selectedModuleId = read('selected_module', modules[0]?.id || '');
let updateState = { status: 'checking', latestVersion: PACK_VERSION };
const savedPanelPosition = read('panel_position', null);

applyPosition(panel, savedPanelPosition, { right: 70, top: 90 });
panel.hidden = !Boolean(read('panel_open', true));

renderModules();
modules.forEach(module => { if (isEnabled(module.id)) startModule(module); });
checkPackVersion();

search.addEventListener('input', renderModules);
panel.addEventListener('wheel', event => {
  if (event.target.closest('input[type="range"]')) return;
  const scroller = event.target.closest('.mhp-detail-body') || list;
  const previous = scroller.scrollTop;
  scroller.scrollTop += event.deltaY;
  if (scroller.scrollTop !== previous) event.preventDefault();
}, { passive: false });
const closeCorner = panel.querySelector('.close-button-corner-decor');
const closePanel = event => {
  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();
  setPanelOpen(false);
};
closeCorner.addEventListener('pointerdown', event => {
  event.stopPropagation();
  event.stopImmediatePropagation();
}, true);
closeCorner.addEventListener('pointerup', closePanel, true);
panel.querySelector('.mhp-close').addEventListener('click', closePanel, true);
bindDrag(panel, panel.querySelector('.mhp-drag-handle'), 'panel_position');
registerLauncher();

document.yssPack.api = {
  version: PACK_VERSION,
  modules,
  open: () => setPanelOpen(true),
  close: () => setPanelOpen(false),
  toggle: () => setPanelOpen(panel.hidden)
};

function renderModules() {
  const query = normalize(search.value);
  const visible = modules.filter(module => !query || normalize(`${module.name} ${module.description}`).includes(query));

  if (!visible.length) {
    list.innerHTML = '<div class="mhp-empty">Nie znaleziono dodatków.</div>';
    renderModuleDetails();
    return;
  }

  list.innerHTML = visible.map(module => {
    return `
      <article class="mhp-card one-addon-on-list${selectedModuleId === module.id ? ' selected' : ''}" data-module-id="${escapeHtml(module.id)}">
        <div class="mhp-icon-wrapper">
          <img class="mhp-module-icon" src="${escapeHtml(moduleIconUrl(module.id))}" alt="">
        </div>
        <div class="mhp-card-copy">
          <div class="mhp-name">${escapeHtml(module.name)} <small>${escapeHtml(module.version || '')}</small></div>
        </div>
      </article>`;
  }).join('');

  list.querySelectorAll('.mhp-card').forEach(card => {
    const module = modules.find(entry => entry.id === card.dataset.moduleId);
    if (!module) return;

    card.addEventListener('click', event => {
      if (event.target.closest('button, input, label')) return;
      selectedModuleId = module.id;
      write('selected_module', selectedModuleId);
      list.querySelectorAll('.mhp-card.selected').forEach(entry => entry.classList.remove('selected'));
      card.classList.add('selected');
      renderModuleDetails();
    });
  });

  renderModuleDetails();
}

function renderModuleDetails() {
  const module = modules.find(entry => entry.id === selectedModuleId) || modules[0];
  if (!module) return;

  const enabled = isEnabled(module.id);
  const hasSettings = Array.isArray(module.settings) && module.settings.length > 0;
  detailHeader.innerHTML = `
    <div class="mhp-detail-icon-wrapper"><img class="mhp-detail-icon" src="${escapeHtml(moduleIconUrl(module.id, enabled))}" alt=""></div>
    <div class="mhp-detail-title">${escapeHtml(module.name)} <small>${escapeHtml(module.version || '')}</small></div>`;
  detailBody.innerHTML = `
    <div class="mhp-toggle-row">
      <button class="mhp-detail-toggle button small ${enabled ? 'red' : 'green'}" type="button" aria-pressed="${enabled}">
        <span class="background"></span><span class="label">${enabled ? 'Wyłącz' : 'Włącz'}</span>
      </button>
      ${renderUpdateStatus()}
    </div>
    <div class="mhp-description-label">Opis:</div>
    <div class="mhp-detail-description">${escapeHtml(module.description || '')}</div>
    ${hasSettings ? `<div class="mhp-settings">${renderSettings(module)}</div>` : ''}
    <div class="mhp-pack-info">Moduł pakietu YssPack.</div>`;

  detailBody.querySelector('.mhp-detail-toggle').addEventListener('click', event => {
    const toggle = event.currentTarget;
    const nextEnabled = toggle.getAttribute('aria-pressed') !== 'true';
    write(moduleKey(module.id, 'enabled'), nextEnabled);
    if (nextEnabled) startModule(module);
    else stopModule(module.id);
    renderModules();
  });

  detailBody.querySelectorAll('[data-setting]').forEach(control => {
    const eventName = control.type === 'checkbox' ? 'change' : 'input';
    control.addEventListener(eventName, () => saveControl(module, control));
  });
}

function renderUpdateStatus() {
  if (updateState.status === 'outdated') {
    return `<a class="mhp-update-status outdated" href="${escapeHtml(UPDATE_INSTALL_URL)}" target="_blank" rel="noopener noreferrer" title="Zainstaluj YssPack ${escapeHtml(updateState.latestVersion)}">Dostępna aktualizacja</a>`;
  }
  if (updateState.status === 'current') {
    return '<span class="mhp-update-status current">Wersja aktualna</span>';
  }
  if (updateState.status === 'error') {
    return '<span class="mhp-update-status error">Nie udało się sprawdzić</span>';
  }
  return '<span class="mhp-update-status checking">Sprawdzanie wersji…</span>';
}

async function checkPackVersion() {
  try {
    const response = await fetch(`${UPDATE_MANIFEST_URL}?t=${Date.now()}`, { cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const manifest = await response.json();
    const latestVersion = String(manifest?.version || PACK_VERSION);
    const installedVersion = String(host.loaderVersion || '0.0.0');
    updateState = {
      status: compareVersions(installedVersion, latestVersion) < 0 ? 'outdated' : 'current',
      latestVersion
    };
  } catch (error) {
    updateState = { status: 'error', latestVersion: PACK_VERSION };
    console.warn('[YssPack] Nie udało się sprawdzić aktualizacji:', error);
  }
  renderModuleDetails();
}

function compareVersions(left, right) {
  const leftParts = String(left).split('.').map(part => Number.parseInt(part, 10) || 0);
  const rightParts = String(right).split('.').map(part => Number.parseInt(part, 10) || 0);
  const length = Math.max(leftParts.length, rightParts.length);
  for (let index = 0; index < length; index += 1) {
    const difference = (leftParts[index] || 0) - (rightParts[index] || 0);
    if (difference) return difference;
  }
  return 0;
}

function renderSettings(module) {
  return module.settings.map(setting => {
    const value = getSetting(module.id, setting.key, setting.defaultValue);
    if (setting.type === 'action') {
      const color = getSetting(module.id, setting.colorKey, setting.defaultColor);
      return `<label class="mhp-action-setting"><span>${escapeHtml(setting.label)}</span><span class="mhp-action-controls"><input type="checkbox" data-setting="${escapeHtml(setting.key)}"${value ? ' checked' : ''} title="Pokaż lub ukryj"><input type="color" data-setting="${escapeHtml(setting.colorKey)}" value="${escapeHtml(color)}" title="Ustaw kolor"></span></label>`;
    }
    if (setting.type === 'checkbox') {
      return `<label class="mhp-checkbox-setting"><span>${escapeHtml(setting.label)}</span><input type="checkbox" data-setting="${escapeHtml(setting.key)}"${value ? ' checked' : ''}></label>`;
    }
    if (setting.type === 'color') {
      return `<label><span>${escapeHtml(setting.label)}</span><input type="color" data-setting="${escapeHtml(setting.key)}" value="${escapeHtml(value)}"></label>`;
    }
    if (setting.type === 'range') {
      return `<label><span>${escapeHtml(setting.label)}: <b data-value-for="${escapeHtml(setting.key)}">${escapeHtml(value)}${escapeHtml(setting.suffix || '')}</b></span><input type="range" data-setting="${escapeHtml(setting.key)}" min="${Number(setting.min)}" max="${Number(setting.max)}" step="${Number(setting.step || 1)}" value="${Number(value)}" data-suffix="${escapeHtml(setting.suffix || '')}"></label>`;
    }
    return '';
  }).join('');
}

function saveControl(module, control) {
  const value = control.type === 'checkbox'
    ? control.checked
    : control.type === 'range'
      ? Number(control.value)
      : control.value;
  setSetting(module.id, control.dataset.setting, value);
  const valueLabel = control.closest('label')?.querySelector(`[data-value-for="${control.dataset.setting}"]`);
  if (valueLabel) valueLabel.textContent = `${value}${control.dataset.suffix || ''}`;
  if (isEnabled(module.id)) restartModule(module);
}

function moduleContext(module) {
  return {
    packVersion: PACK_VERSION,
    GM_xmlhttpRequest: host.GM_xmlhttpRequest,
    GM_getValue: host.GM_getValue,
    GM_setValue: host.GM_setValue,
    GM_deleteValue: host.GM_deleteValue,
    getSetting: (key, fallback) => getSetting(module.id, key, fallback),
    setSetting: (key, value) => setSetting(module.id, key, value)
  };
}

function startModule(module) {
  if (cleanups.has(module.id)) return;
  try {
    const cleanup = module.start?.(moduleContext(module));
    cleanups.set(module.id, typeof cleanup === 'function' ? cleanup : () => {});
  } catch (error) {
    console.error(`[YssPack] Błąd modułu ${module.name}:`, error);
    write(moduleKey(module.id, 'enabled'), false);
    renderModules();
  }
}

function stopModule(id) {
  try { cleanups.get(id)?.(); } catch (error) { console.error(`[YssPack] Nie udało się zatrzymać modułu ${id}:`, error); }
  cleanups.delete(id);
}

function restartModule(module) {
  stopModule(module.id);
  startModule(module);
}

function setPanelOpen(open) {
  panel.hidden = !open;
  write('panel_open', open);
}

function registerLauncher() {
  let attempts = 0;
  const tryRegister = () => {
    const engine = window.Engine;
    const manager = engine?.widgetManager;
    const storage = engine?.serverStorage;
    const widgetsData = engine?.widgetsData;
    if (!manager?.addKeyToDefaultWidgetSet || !manager?.addWidgetButtons || !storage?.get || !storage?.sendData || !widgetsData?.type) {
      if (attempts++ < 120) setTimeout(tryRegister, 250);
      return;
    }

    const togglePanel = () => setPanelOpen(panel.hidden);
    const storagePath = manager.getPathToHotWidgetVersion();
    const storedSlot = storage.get(storagePath, WIDGET_KEY);
    const fallbackSlot = manager.getFirstEmptyWidgetSlot?.() || { slot: 0, container: widgetsData.pos.TOP_LEFT };
    const slot = Array.isArray(storedSlot)
      ? { slot: Number(storedSlot[0]), container: storedSlot[1] }
      : fallbackSlot;

    if (!manager.getDefaultWidgetSet?.()?.[WIDGET_KEY]) {
      manager.addKeyToDefaultWidgetSet(
        WIDGET_KEY,
        slot.slot,
        slot.container,
        'YssPack',
        widgetsData.type.GREEN,
        togglePanel
      );
    }

    if (Array.isArray(storedSlot)) {
      manager.addWidgetButtons();
      return;
    }
    storage.sendData(
      { [storagePath]: { [WIDGET_KEY]: [slot.slot, slot.container] } },
      () => manager.addWidgetButtons()
    );
  };
  tryRegister();
}

function bindDrag(element, handle, storageKey) {
  let startX = 0;
  let startY = 0;
  let startLeft = 0;
  let startTop = 0;

  handle.addEventListener('pointerdown', event => {
    if (event.button !== 0 || event.target.closest('button')) return;
    const rect = element.getBoundingClientRect();
    startX = event.clientX;
    startY = event.clientY;
    startLeft = rect.left;
    startTop = rect.top;
    handle.setPointerCapture(event.pointerId);
  });

  handle.addEventListener('pointermove', event => {
    if (!handle.hasPointerCapture(event.pointerId)) return;
    moveElement(element, startLeft + event.clientX - startX, startTop + event.clientY - startY);
  });

  handle.addEventListener('pointerup', event => {
    if (handle.hasPointerCapture(event.pointerId)) handle.releasePointerCapture(event.pointerId);
    write(storageKey, positionOf(element));
  });
}

function applyPosition(element, saved, fallback) {
  if (saved && Number.isFinite(saved.left) && Number.isFinite(saved.top)) {
    moveElement(element, saved.left, saved.top);
    return;
  }
  element.style.right = `${fallback.right}px`;
  element.style.top = `${fallback.top}px`;
}

function moveElement(element, left, top) {
  const maxLeft = Math.max(0, innerWidth - element.offsetWidth);
  const maxTop = Math.max(0, innerHeight - element.offsetHeight);
  element.style.right = 'auto';
  element.style.left = `${Math.max(0, Math.min(maxLeft, left))}px`;
  element.style.top = `${Math.max(0, Math.min(maxTop, top))}px`;
}

function positionOf(element) {
  const rect = element.getBoundingClientRect();
  return { left: Math.round(rect.left), top: Math.round(rect.top) };
}

function normalize(value) {
  return String(value || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ł/g, 'l').trim();
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
}
