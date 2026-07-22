const host = document.yssPack;

if (!host || document.querySelector('#ysspack')) {
  throw new Error('[YssPack] Loader nie jest aktywny albo panel został już uruchomiony.');
}

const PACK_VERSION = '0.4.3';
const STORAGE_PREFIX = 'ysspack_';
const today = new Date();
const moduleCacheKey = [today.getFullYear(), String(today.getMonth() + 1).padStart(2, '0'), String(today.getDate()).padStart(2, '0')].join('');
const moduleFiles = [
  'modules/bestiary.js',
  'modules/item-time.js',
  'modules/auction-assistant.js',
  'modules/character-storage.js',
  'modules/player-actions.js'
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
const logoUrl = new URL('assets/logo-ysspack.png', import.meta.url).href;

const launcher = document.createElement('button');
launcher.id = 'mhp-launcher';
launcher.type = 'button';
launcher.title = 'YssPack';
launcher.innerHTML = `<img src="${logoUrl}" alt="">`;

const panel = document.createElement('section');
panel.id = 'ysspack';
panel.innerHTML = `
  <header class="mhp-header">
    <div class="mhp-brand"><img class="mhp-brand-logo" src="${logoUrl}" alt="YssPack"><small>v${PACK_VERSION}</small></div>
    <button class="mhp-close" type="button" aria-label="Zamknij">X</button>
  </header>
  <div class="mhp-toolbar"><input class="mhp-search" type="search" placeholder="Szukaj dodatku..."></div>
  <div class="mhp-list"></div>
  <footer class="mhp-footer">Autor: Król Yss • ustawienia są zapisywane lokalnie</footer>`;

document.body.append(launcher, panel);

const list = panel.querySelector('.mhp-list');
const search = panel.querySelector('.mhp-search');
const savedPanelPosition = read('panel_position', null);
const savedLauncherPosition = read('launcher_position', null);

applyPosition(panel, savedPanelPosition, { right: 70, top: 90 });
applyPosition(launcher, savedLauncherPosition, { right: 14, top: 92 });
panel.hidden = !Boolean(read('panel_open', true));

renderModules();
modules.forEach(module => { if (isEnabled(module.id)) startModule(module); });

search.addEventListener('input', renderModules);
panel.querySelector('.mhp-close').addEventListener('click', () => setPanelOpen(false));
bindDrag(panel, panel.querySelector('.mhp-header'), 'panel_position');
bindLauncher();

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
    return;
  }

  list.innerHTML = visible.map(module => {
    const enabled = isEnabled(module.id);
    const hasSettings = Array.isArray(module.settings) && module.settings.length > 0;
    return `
      <article class="mhp-card${enabled ? ' enabled' : ''}" data-module-id="${escapeHtml(module.id)}">
        <div class="mhp-card-main">
          <div class="mhp-icon">${escapeHtml(module.icon || '◆')}</div>
          <div class="mhp-card-copy"><div class="mhp-name">${escapeHtml(module.name)} <small>${escapeHtml(module.version || '')}</small></div><div class="mhp-description">${escapeHtml(module.description || '')}</div></div>
          ${hasSettings ? '<button class="mhp-settings-button" type="button" title="Ustawienia">⚙</button>' : ''}
          <label class="mhp-switch"><input type="checkbox" class="mhp-toggle"${enabled ? ' checked' : ''}><span></span></label>
        </div>
        ${hasSettings ? `<div class="mhp-settings" hidden>${renderSettings(module)}</div>` : ''}
      </article>`;
  }).join('');

  list.querySelectorAll('.mhp-card').forEach(card => {
    const module = modules.find(entry => entry.id === card.dataset.moduleId);
    if (!module) return;

    const toggle = card.querySelector('.mhp-toggle');
    toggle.addEventListener('change', () => {
      write(moduleKey(module.id, 'enabled'), toggle.checked);
      if (toggle.checked) startModule(module);
      else stopModule(module.id);
      card.classList.toggle('enabled', toggle.checked);
    });

    card.querySelector('.mhp-settings-button')?.addEventListener('click', () => {
      const settings = card.querySelector('.mhp-settings');
      settings.hidden = !settings.hidden;
    });

    card.querySelectorAll('[data-setting]').forEach(control => {
      control.addEventListener('input', () => saveControl(module, control));
      control.addEventListener('change', () => saveControl(module, control));
    });
  });
}

function renderSettings(module) {
  return module.settings.map(setting => {
    const value = getSetting(module.id, setting.key, setting.defaultValue);
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
  const value = control.type === 'range' ? Number(control.value) : control.value;
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

function bindLauncher() {
  let moved = false;
  let startX = 0;
  let startY = 0;
  let startLeft = 0;
  let startTop = 0;

  launcher.addEventListener('pointerdown', event => {
    if (event.button !== 0) return;
    moved = false;
    startX = event.clientX;
    startY = event.clientY;
    const rect = launcher.getBoundingClientRect();
    startLeft = rect.left;
    startTop = rect.top;
    launcher.setPointerCapture(event.pointerId);
  });

  launcher.addEventListener('pointermove', event => {
    if (!launcher.hasPointerCapture(event.pointerId)) return;
    const dx = event.clientX - startX;
    const dy = event.clientY - startY;
    if (Math.abs(dx) + Math.abs(dy) > 4) moved = true;
    moveElement(launcher, startLeft + dx, startTop + dy);
  });

  launcher.addEventListener('pointerup', event => {
    if (launcher.hasPointerCapture(event.pointerId)) launcher.releasePointerCapture(event.pointerId);
    if (moved) write('launcher_position', positionOf(launcher));
    else setPanelOpen(panel.hidden);
  });
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
