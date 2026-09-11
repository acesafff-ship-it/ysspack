const MODULE_ID = 'compact-party';
const STYLE_ID = 'yss-compact-party-style';
const ROOT_CLASS = 'yss-compact-party';

export default {
  id: MODULE_ID,
  name: 'Czytelny podgląd grupy',
  version: '1.2.0',
  description: 'Pokazuje stale dokładne HP członków grupy w nowym natywnym panelu.',
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
      .party-window.${ROOT_CLASS} .party-member .hp-percent{display:none!important}
      .party-window.${ROOT_CLASS} .party-member .hp-points{
        display:block!important;
        position:absolute!important;
        left:0!important;
        bottom:0!important;
        color:#f5f5f5!important;
        font:700 9px/12px Arial,sans-serif!important;
        text-shadow:0 1px #000!important;
        white-space:nowrap!important
      }
      `;
    document.head.appendChild(style);

    function sync() {
      framePending = false;
      if (stopped) return;
      const windowElement = document.querySelector('.party-window');
      if (windowElement !== observedPartyWindow) {
        observedPartyWindow?.classList.remove(ROOT_CLASS);
        observedPartyWindow = windowElement;
      }
      if (!windowElement) return;
      windowElement.classList.add(ROOT_CLASS);
    }

    function scheduleSync() {
      if (stopped || framePending) return;
      framePending = true;
      requestAnimationFrame(sync);
    }

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
      rootObserver.disconnect();
      document.querySelectorAll(`.party-window.${ROOT_CLASS}`).forEach(windowElement => {
        windowElement.classList.remove(ROOT_CLASS);
      });
      style.remove();
    };
  }
};
