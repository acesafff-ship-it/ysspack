const ITEM_ID_RE = /(?:^|\s)item-id-(\d+)(?:\s|$)/;
const BADGE_CLASS = 'codex-item-time-left';
const BLESSING_CLASS_ID = 25;
const EQUIPPED_BLESSING_SLOT_ID = 10;

export default {
  id: 'item-time',
  name: 'Minuty i sekundy przedmiotu',
  version: '2.3.0',
  description: 'Pokazuje dokładny czas błogosławieństwa na ikonie i w tooltipie.',
  icon: '⏱',

  start() {
    const ttlTimers = new Map();
    let hoveredItemId = null;

    const style = document.createElement('style');
    style.dataset.ysspackModule = 'item-time';
    style.textContent = `
      .item.${BADGE_CLASS}-host { position:relative!important }
      .${BADGE_CLASS}{position:absolute;left:1px;right:1px;bottom:1px;z-index:30;box-sizing:border-box;padding:1px 1px 0;border-radius:2px;background:rgba(0,0,0,.82);color:#fff36b;font:bold 10px/11px Arial,sans-serif;text-align:center;text-shadow:1px 1px #000,-1px -1px #000;pointer-events:none;white-space:nowrap}
      .item.${BADGE_CLASS}-host>.cooldown{display:none!important}`;
    document.documentElement.appendChild(style);

    const getItemId = element => element?.closest?.('.item')?.className?.match?.(ITEM_ID_RE)?.[1] ?? null;

    const getRemainingSeconds = itemId => {
      const item = window.Engine?.items?.getItemById?.(itemId);
      if (!item || Number(item.cl) !== BLESSING_CLASS_ID || Number(item.st) !== EQUIPPED_BLESSING_SLOT_ID) return null;
      if (item.issetTtlStat?.() === true && typeof item.getTtlStat === 'function') {
        const ttlMinutes = Number(item.getTtlStat());
        if (Number.isFinite(ttlMinutes) && ttlMinutes >= 0) {
          const now = Date.now();
          let timer = ttlTimers.get(String(itemId));
          if (!timer || timer.ttlMinutes !== ttlMinutes) {
            timer = { ttlMinutes, deadline: now + ttlMinutes * 60000 };
            ttlTimers.set(String(itemId), timer);
          }
          return Math.max(0, (timer.deadline - now) / 1000);
        }
      }
      if (typeof item.getExpiresStat === 'function') {
        const value = Number(item.getExpiresStat());
        if (Number.isFinite(value)) return Math.max(0, value - Date.now() / 1000);
      }
      const value = Number(String(item.stat ?? '').match(/(?:^|;)expires=([^;]+)/)?.[1]);
      return Number.isFinite(value) ? Math.max(0, value - Date.now() / 1000) : null;
    };

    const formatRemaining = seconds => {
      const safe = Math.max(0, Math.ceil(seconds));
      const minutes = Math.floor(safe / 60);
      const rest = safe % 60;
      return minutes > 0 ? `${minutes} min ${String(rest).padStart(2, '0')} s` : `${rest} s`;
    };

    const formatBadge = seconds => {
      const safe = Math.max(0, Math.ceil(seconds));
      const hours = Math.floor(safe / 3600);
      const minutes = Math.floor((safe % 3600) / 60);
      const rest = safe % 60;
      return hours > 0 ? `${hours}:${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}` : `${minutes}:${String(rest).padStart(2, '0')}`;
    };

    const updateBadges = () => document.querySelectorAll(".item[class*='item-id-']").forEach(element => {
      const itemId = element.className.match(ITEM_ID_RE)?.[1];
      const remaining = itemId ? getRemainingSeconds(itemId) : null;
      let badge = element.querySelector(`:scope>.${BADGE_CLASS}`);
      if (remaining === null) {
        badge?.remove();
        element.classList.remove(`${BADGE_CLASS}-host`);
        return;
      }
      if (!badge) {
        badge = document.createElement('div');
        badge.className = BADGE_CLASS;
        element.appendChild(badge);
      }
      element.classList.add(`${BADGE_CLASS}-host`);
      badge.textContent = formatBadge(remaining);
    });

    const updateTooltip = () => {
      if (!hoveredItemId) return;
      const remaining = getRemainingSeconds(hoveredItemId);
      if (remaining === null) return;
      const line = document.querySelector('.tip-layer .tip-item-stat-ttl,.tip-layer .tip-item-stat-expires,.sticky-tips-layer .tip-item-stat-ttl,.sticky-tips-layer .tip-item-stat-expires');
      if (line) line.textContent = `Zniknie za ${formatRemaining(remaining)}`;
    };

    const update = () => { updateTooltip(); updateBadges(); };
    const onMouseOver = event => { const id = getItemId(event.target); if (id) hoveredItemId = id; };
    document.addEventListener('mouseover', onMouseOver, true);
    const observer = new MutationObserver(update);
    observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
    const timer = window.setInterval(update, 200);
    update();

    return () => {
      observer.disconnect();
      window.clearInterval(timer);
      document.removeEventListener('mouseover', onMouseOver, true);
      style.remove();
      document.querySelectorAll(`.${BADGE_CLASS}`).forEach(element => element.remove());
      document.querySelectorAll(`.${BADGE_CLASS}-host`).forEach(element => element.classList.remove(`${BADGE_CLASS}-host`));
      ttlTimers.clear();
    };
  }
};
