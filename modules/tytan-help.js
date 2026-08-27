const number = value => Number.isFinite(Number(value)) ? Number(value) : null;
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);

export default {
  id: 'tytan-help',
  name: 'TytanHelp',
  version: '1.0.9',
  description: 'Pokazuje HP, odporności, umiejętność, naładowanie i cel ataku Kolosów oraz Tytanów.',
  icon: '⚔',

  start() {
    if (location.hostname === 'www.margonem.pl') return () => {};

    const rootId = 'ysspack-tytan-help';
    const styleId = 'ysspack-tytan-help-style';
    const labels = new Map();
    const fmt = new Intl.NumberFormat('pl-PL', { maximumFractionDigits: 0 });
    const percent = new Intl.NumberFormat('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    let stopped = false;
    let offset = loadOffset();
    let dragging = null;

    function loadOffset() {
      try {
        const saved = JSON.parse(localStorage.getItem('ysspack-tytan-help-offset') || '{}');
        return { x: Number(saved.x) || 0, y: Number(saved.y) || 0 };
      } catch (_) { return { x: 0, y: 0 }; }
    }

    function saveOffset() {
      localStorage.setItem('ysspack-tytan-help-offset', JSON.stringify(offset));
    }

    function statValue(stat) {
      return Math.round((number(stat?.cur) || 0) + (number(stat?.bonus) || 0));
    }

    function bossType(warrior) {
      const wt = number(warrior?.wt) || 0;
      if (wt > 99) return 'Tytan';
      if ((number(window.Engine?.map?.d?.mode) || 0) === 5 && wt >= 80) return 'Kolos';
      return null;
    }

    function opponents() {
      const battle = window.Engine?.battle;
      if (!battle || battle.endBattle !== false || battle.endBattleForMe !== false) return [];
      const list = battle.warriorsList;
      return list && typeof list === 'object'
        ? Object.values(list).filter(warrior => warrior && Number(warrior.npc) === 1 && warrior.hp)
        : [];
    }

    function anchor(warrior) {
      const element = [warrior?.$canvasIcon?.[0], warrior?.$?.[0], warrior?.element]
        .find(value => value instanceof Element && value.getBoundingClientRect().width > 0);
      if (!element) return null;
      const rect = element.getBoundingClientRect();
      return { x: rect.left + rect.width / 2, y: rect.top };
    }

    function charge(warrior) {
      const root = warrior?.$?.[0];
      if (!(root instanceof Element)) return null;
      const bar = root.querySelector('.super-cast.stat-bar');
      const inner = bar?.querySelector('.inner');
      if (!bar || !inner || getComputedStyle(bar).display === 'none') return null;
      return Math.max(0, Math.min(100, inner.getBoundingClientRect().width / Math.max(1, bar.clientWidth || bar.getBoundingClientRect().width) * 100));
    }

    function skill(warrior) {
      const name = String(warrior?.name || '').trim();
      const root = warrior?.$?.[0];
      if (!name || !(root instanceof Element) || !root.querySelector('.warrior-buffs-wrapper .buff, .buffs-wrapper .buff')) return null;
      const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const pattern = new RegExp(`^${escaped}\\s+wykonuje\\s+(.+?)[.!]?$`, 'i');
      const entries = [...document.querySelectorAll('.battle-msg.attack2, .battle-msg.attack')];
      for (let index = entries.length - 1; index >= 0; index -= 1) {
        const found = (entries[index].textContent || '').replace(/\s+/g, ' ').trim().match(pattern);
        if (found?.[1] && found[1].length <= 90) return found[1].trim();
      }
      return null;
    }

    function target(warrior) {
      const id = number(warrior?.focus);
      if (!id) return null;
      const list = window.Engine?.battle?.warriorsList;
      return list?.[id]?.name || list?.[String(id)]?.name || null;
    }

    function ensureUi() {
      if (!document.getElementById(styleId)) {
        const style = document.createElement('style');
        style.id = styleId;
        style.textContent = `
          #${rootId}{position:absolute;inset:0;z-index:1;pointer-events:none;overflow:hidden}
          #${rootId} .yth-tip{position:absolute;transform:translate(-50%,-100%);box-sizing:border-box;width:260px;padding:14px 15px 15px;border:0;border-radius:4px;outline:0;background:rgba(0,0,0,.7);box-shadow:#010101 0 0 0 1px,#ccc 0 0 0 2px,#0c0d0d 0 0 0 3px,rgba(12,13,13,.4) 2px 2px 3px 3px;color:#f2f2f2!important;font:700 12.8px/16.64px Arimo,Calibri,"Segoe UI",Arial,sans-serif;text-align:center;text-shadow:0 1px 1px #000;pointer-events:auto;cursor:grab;contain:layout paint;will-change:transform}
          #${rootId} .yth-name{margin:0 0 5px;padding:0 0 3px;border-bottom:1px solid rgba(255,255,255,.2);color:#fff}.yth-row{min-height:16px;text-align:center;overflow-wrap:anywhere}.yth-res{display:flex;justify-content:center;gap:5px;margin:1px 0 3px}.yth-fire{color:#ff3b30}.yth-light{color:#ffe033}.yth-frost{color:#42a5ff}.yth-poison{color:#45e35a}.yth-power{color:#ffd15c}.yth-destroyed{color:#ff9b72}`;
        document.head.appendChild(style);
      }
      let root = document.getElementById(rootId);
      if (!root) {
        root = document.createElement('div');
        root.id = rootId;
      }
      const interfaceLayer = document.querySelector('.interface-layer.layer') || document.body;
      if (interfaceLayer && root.parentElement !== interfaceLayer) {
        interfaceLayer.appendChild(root);
      }
    }

    function labelFor(id) {
      let label = labels.get(id);
      if (label) return label;
      label = document.createElement('div');
      label.className = 'yth-tip';
      label.addEventListener('pointerdown', event => {
        if (event.button !== 0) return;
        event.preventDefault();
        dragging = { id: event.pointerId, x: event.clientX, y: event.clientY, ox: offset.x, oy: offset.y };
        label.setPointerCapture?.(event.pointerId);
      });
      label.addEventListener('pointermove', event => {
        if (!dragging || dragging.id !== event.pointerId) return;
        offset.x = Math.max(-500, Math.min(500, dragging.ox + event.clientX - dragging.x));
        offset.y = Math.max(-500, Math.min(500, dragging.oy + event.clientY - dragging.y));
        applyOffset();
      });
      const finishDrag = event => {
        if (!dragging || dragging.id !== event.pointerId) return;
        dragging = null;
        saveOffset();
      };
      label.addEventListener('pointerup', finishDrag);
      label.addEventListener('pointercancel', finishDrag);
      document.getElementById(rootId).appendChild(label);
      labels.set(id, label);
      applyOffset(label);
      return label;
    }

    function applyOffset(singleLabel = null) {
      const transform = `translate(calc(-50% + ${Math.round(offset.x)}px), calc(-100% + ${Math.round(offset.y)}px))`;
      if (singleLabel) {
        singleLabel.style.transform = transform;
        return;
      }
      labels.forEach(label => { label.style.transform = transform; });
    }

    function render(label, warrior, type, position) {
      const hp = Math.max(0, number(warrior.hp?.cur) || 0);
      const max = Math.max(1, number(warrior.hp?.max) || 1);
      const hpPercent = number(warrior.hp?.hpp);
      const healthPercent = hpPercent == null ? hp / max * 100 : hpPercent;
      const usedSkill = skill(warrior);
      const loaded = charge(warrior);
      const focused = target(warrior);
      const armorDestroyed = warrior.ac && warrior.ac.destroyed !== undefined;
      const html = `<div class="yth-name">${escapeHtml(warrior.name || type)} (${escapeHtml(`${number(warrior.lvl) || '?'}${warrior.prof || ''}`)})</div>
        <div class="yth-row">Życie: ${fmt.format(hp)} / ${fmt.format(max)} (${percent.format(healthPercent)}%)</div>
        <div class="yth-row">Pancerz: ${fmt.format(statValue(warrior.ac))}${armorDestroyed ? ' <span class="yth-destroyed">— zniszczony</span>' : ''}</div><div class="yth-row">Odporności:</div>
        <div class="yth-res"><span class="yth-fire">${statValue(warrior.resfire)}%</span><span class="yth-light">${statValue(warrior.reslight)}%</span><span class="yth-frost">${statValue(warrior.resfrost)}%</span><span class="yth-poison">${statValue(warrior.act)}%</span></div>
        ${usedSkill ? `<div class="yth-row yth-power">Umiejętność: ${escapeHtml(usedSkill)}</div>` : ''}
        ${loaded == null ? '' : `<div class="yth-row yth-power">Naładowano: ${Math.round(loaded)}%</div>`}
        ${focused ? `<div class="yth-row">Cel ataku: ${escapeHtml(focused)}</div>` : ''}`;
      if (label.dataset.ythHtml !== html) {
        label.innerHTML = html;
        label.dataset.ythHtml = html;
      }
      label.style.left = `${Math.round(position.x)}px`;
      label.style.top = `${Math.round(position.y)}px`;
      label.hidden = false;
    }

    function update() {
      if (stopped) return;
      const battle = window.Engine?.battle;
      if (!battle || battle.endBattle !== false || battle.endBattleForMe !== false) {
        stopBattleUpdates();
        return;
      }
      if (document.hidden || dragging) return;
      ensureUi();
      const active = new Set();
      for (const warrior of opponents()) {
        const type = bossType(warrior);
        const position = type && anchor(warrior);
        if (!type || !position) continue;
        const id = `boss:${warrior.id}`;
        render(labelFor(id), warrior, type, position);
        active.add(id);
      }
      for (const [id, label] of labels) {
        if (active.has(id)) continue;
        label.remove(); labels.delete(id);
      }
    }

    let updateTimer = 0;
    let reconcileQueued = false;

    function stopBattleUpdates() {
      clearInterval(updateTimer);
      updateTimer = 0;
      labels.forEach(label => label.remove());
      labels.clear();
      document.getElementById(rootId)?.remove();
    }

    function reconcileBattleState() {
      reconcileQueued = false;
      if (stopped) return;
      const battle = window.Engine?.battle;
      const active = battle && battle.endBattle === false && battle.endBattleForMe === false;
      if (!active) {
        stopBattleUpdates();
        return;
      }
      if (updateTimer) return;
      ensureUi();
      update();
      updateTimer = setInterval(update, 250);
    }

    const battleObserver = new MutationObserver(() => {
      if (reconcileQueued) return;
      reconcileQueued = true;
      queueMicrotask(reconcileBattleState);
    });
    battleObserver.observe(document.body, { childList: true, subtree: true });
    reconcileBattleState();

    return () => {
      stopped = true;
      battleObserver.disconnect();
      stopBattleUpdates();
      document.getElementById(styleId)?.remove();
    };
  }
};
