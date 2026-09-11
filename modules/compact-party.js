const MODULE_ID = 'compact-party';
const STYLE_ID = 'yss-compact-party-style';
const ROOT_CLASS = 'yss-compact-party';

export default {
  id: MODULE_ID,
  name: 'Czytelny podgląd grupy',
  version: '1.2.2',
  description: 'Pokazuje stale większe dokładne HP członków grupy, kolorowane od zielonego do czerwonego.',
  icon: '👥',

  start() {
    if (location.hostname === 'www.margonem.pl') return () => {};

    let stopped = false;
    let framePending = false;
    let observedPartyWindow = null;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      .party-window.${ROOT_CLASS} .party-member .bottom-row{position:relative!important}
      .party-window.${ROOT_CLASS} .party-member .member-hp-bar{background:transparent!important}
      .party-window.${ROOT_CLASS} .party-member .hp-percent{display:none!important}
      .party-window.${ROOT_CLASS} .party-member .hp-points{
        display:block!important;
        position:absolute!important;
        left:0!important;
        bottom:0!important;
        color:#f5f5f5!important;
        color:hsl(var(--ycp-hp-hue, 0) 82% 66%)!important;
        font:800 11px/12px Arial,sans-serif!important;
        text-shadow:0 1px #000!important;
        white-space:nowrap!important
      }
      `;
    document.head.appendChild(style);

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
      const hp = hpPercent(row);
      if (hp === null) row.style.removeProperty('--ycp-hp-hue');
      else row.style.setProperty('--ycp-hp-hue', String(Math.round(hp * 1.2)));
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
            childList: true, subtree: true, attributes: true, attributeFilter: ['bar-percent']
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
        windowElement.querySelectorAll('.party-member').forEach(row => row.style.removeProperty('--ycp-hp-hue'));
      });
      style.remove();
    };
  }
};
