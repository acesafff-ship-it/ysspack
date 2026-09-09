const MODULE_ID = 'compact-party';
const STYLE_ID = 'yss-compact-party-style';
const ROOT_CLASS = 'yss-compact-party';
const STATE_CLASSES = [
  'ycp-hp-critical', 'ycp-hp-low', 'ycp-hp-healthy', 'ycp-out-of-range', 'ycp-stasis'
];

export default {
  id: MODULE_ID,
  name: 'Czytelny podgląd grupy',
  version: '1.1.0',
  description: 'Ulepsza nowy natywny panel grupy: wyróżnia stan członków i pokazuje dokładne HP po najechaniu.',
  icon: '👥',

  start() {
    if (location.hostname === 'www.margonem.pl') return () => {};

    let stopped = false;
    let framePending = false;
    let observedPartyWindow = null;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      .party-window.${ROOT_CLASS} .party-member{transition:filter .12s ease,box-shadow .12s ease!important}
      .party-window.${ROOT_CLASS} .party-member .hp-percent{font-weight:800!important;text-shadow:0 1px #000!important}
      .party-window.${ROOT_CLASS} .party-member.ycp-hp-healthy .hp-percent{color:#91e778!important}
      .party-window.${ROOT_CLASS} .party-member.ycp-hp-low .hp-percent{color:#ffd15a!important}
      .party-window.${ROOT_CLASS} .party-member.ycp-hp-critical .hp-percent{color:#ff6a62!important}
      .party-window.${ROOT_CLASS} .party-member:hover .hp-percent{display:none!important}
      .party-window.${ROOT_CLASS} .party-member:hover .hp-points{display:block!important;color:#f5f5f5!important;font-weight:700!important;text-shadow:0 1px #000!important;white-space:nowrap!important}
      .party-window.${ROOT_CLASS} .party-member.ycp-out-of-range{box-shadow:inset 3px 0 #c99739!important;filter:saturate(.72)}
      .party-window.${ROOT_CLASS} .party-member.ycp-stasis{box-shadow:inset 3px 0 #a878d6!important}
      .party-window.${ROOT_CLASS} .party-member.ycp-hp-critical:not(.ycp-out-of-range):not(.ycp-stasis){box-shadow:inset 3px 0 #d54b45!important}`;
    document.head.appendChild(style);

    function isShown(element) {
      return Boolean(element && element.style.display !== 'none' && getComputedStyle(element).display !== 'none');
    }

    function hpPercent(row) {
      const raw = row.querySelector('.member-hp-bar')?.getAttribute('bar-percent');
      if (raw !== null && raw !== undefined && raw !== '') {
        const value = Number(raw);
        if (Number.isFinite(value)) return Math.max(0, Math.min(100, value));
      }
      const match = row.querySelector('.hp-percent')?.textContent?.match(/\d+(?:[.,]\d+)?/);
      return match ? Math.max(0, Math.min(100, Number(match[0].replace(',', '.')))) : null;
    }

    function syncRow(row) {
      row.classList.remove(...STATE_CLASSES);
      const hp = hpPercent(row);
      if (hp !== null) row.classList.add(hp <= 25 ? 'ycp-hp-critical' : hp <= 65 ? 'ycp-hp-low' : 'ycp-hp-healthy');
      if (isShown(row.querySelector('.out-of-range-icon'))) row.classList.add('ycp-out-of-range');
      if (isShown(row.querySelector('.stasis-icon, .stasis-incoming-icon'))) row.classList.add('ycp-stasis');
    }

    function sync() {
      framePending = false;
      if (stopped) return;
      const windowElement = document.querySelector('.party-window');
      if (windowElement !== observedPartyWindow) {
        partyObserver.disconnect();
        observedPartyWindow?.classList.remove(ROOT_CLASS);
        observedPartyWindow = windowElement;
        if (observedPartyWindow) {
          partyObserver.observe(observedPartyWindow, {
            childList: true, subtree: true, attributes: true, attributeFilter: ['bar-percent', 'style']
          });
        }
      }
      if (!windowElement) return;
      windowElement.classList.add(ROOT_CLASS);
      windowElement.querySelectorAll('.party-member').forEach(syncRow);
    }

    function scheduleSync() {
      if (stopped || framePending) return;
      framePending = true;
      requestAnimationFrame(sync);
    }

    const partyObserver = new MutationObserver(scheduleSync);
    const rootObserver = new MutationObserver(records => {
      const partyChanged = records.some(record => [...record.addedNodes, ...record.removedNodes].some(node =>
        node instanceof Element && (
          node.matches('.party-window') || node.querySelector?.('.party-window') || node === observedPartyWindow
          || observedPartyWindow && node.contains?.(observedPartyWindow)
        )
      ));
      if (partyChanged || !observedPartyWindow?.isConnected) scheduleSync();
    });
    rootObserver.observe(document.body, { childList: true, subtree: true });
    scheduleSync();

    return () => {
      stopped = true;
      partyObserver.disconnect();
      rootObserver.disconnect();
      document.querySelectorAll(`.party-window.${ROOT_CLASS}`).forEach(windowElement => {
        windowElement.classList.remove(ROOT_CLASS);
        windowElement.querySelectorAll('.party-member').forEach(row => row.classList.remove(...STATE_CLASSES));
      });
      style.remove();
    };
  }
};
