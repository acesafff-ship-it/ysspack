const MODULE_ID = 'compact-party';
const STYLE_ID = 'yss-compact-party-style';
const ROOT_CLASS = 'yss-compact-party';
const PROFESSION_NAMES = {
  m: 'Mag',
  w: 'Wojownik',
  p: 'Paladyn',
  t: 'Tropiciel',
  h: 'Łowca',
  b: 'Tancerz ostrzy'
};

export default {
  id: MODULE_ID,
  name: 'Kompaktowy podgląd drużyny',
  version: '1.0.3',
  description: 'Dodaje avatary, poprawne poziomy, profesje i czytelne statusy do natywnego panelu drużyny.',
  icon: '👥',

  start() {
    if (location.hostname === 'www.margonem.pl') return () => {};

    let stopped = false;
    let framePending = false;

    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      .party-window.${ROOT_CLASS} .party-member{height:38px!important;min-height:38px!important}
      .party-window.${ROOT_CLASS} .party-member>.border-blink{height:36px!important;bottom:2px!important}
      .party-window.${ROOT_CLASS} .party-member>.table-wrapper{position:relative!important;display:block!important;width:226px!important;height:38px!important}
      .party-window.${ROOT_CLASS} .party-member .ycp-avatar{position:absolute;left:2px;top:4px;width:32px;height:28px;background-position:0 0;background-repeat:no-repeat;pointer-events:none}
      .party-window.${ROOT_CLASS} .party-member .nickname{position:absolute!important;left:38px!important;top:2px!important;width:105px!important;height:16px!important;line-height:16px!important;overflow:hidden!important;white-space:nowrap!important}
      .party-window.${ROOT_CLASS} .party-member .nickname-text{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .party-window.${ROOT_CLASS} .party-member .party-options{position:absolute!important;right:1px!important;top:1px!important;z-index:2}
      .party-window.${ROOT_CLASS} .party-member .party__crown{position:absolute!important;right:17px!important;top:1px!important;z-index:2}
      .party-window.${ROOT_CLASS} .party-member .stasis-icon,
      .party-window.${ROOT_CLASS} .party-member .stasis-incoming-icon{position:absolute!important;right:33px!important;top:1px!important;z-index:2}
      .party-window.${ROOT_CLASS} .party-member .hp{position:absolute!important;right:2px!important;bottom:3px!important;width:78px!important;height:12px!important}
      .party-window.${ROOT_CLASS} .party-member .ycp-meta{position:absolute;left:38px;bottom:3px;width:105px;height:13px;overflow:hidden;color:#ddd;font:700 10px/13px Arial,sans-serif;text-shadow:0 1px #000;white-space:nowrap;text-overflow:ellipsis;pointer-events:none}
      .party-window.${ROOT_CLASS} .party-member .ycp-status{position:absolute;right:34px;top:4px;max-width:58px;height:12px;overflow:hidden;color:#77d86a;font:700 9px/12px Arial,sans-serif;text-shadow:0 1px #000;white-space:nowrap;text-overflow:ellipsis;z-index:3;pointer-events:none}
      .party-window.${ROOT_CLASS} .party-member .ycp-status.ycp-fighting{color:#f2a52b}
      .party-window.${ROOT_CLASS} .party-member .ycp-status.ycp-away{color:#aaa}
      .party-window.${ROOT_CLASS} .party-member .ycp-status.ycp-stasis{color:#d79cff}
      .party-window.${ROOT_CLASS} .party-member .hp-label{font-weight:800!important}
    `;
    document.head.appendChild(style);

    function partyMembers() {
      try {
        const members = window.Engine?.party?.getMembers?.();
        return members instanceof Map ? members : new Map();
      } catch (_) {
        return new Map();
      }
    }

    function liveCharacter(id, member) {
      if (member?.isHero || Number(window.Engine?.hero?.d?.id) === id) return window.Engine?.hero?.d ?? null;
      const others = window.Engine?.others;
      try {
        const found = others?.getById?.(id)
          ?? others?.getById?.(String(id))
          ?? others?.get?.(id)
          ?? others?.get?.(String(id));
        return found?.d ?? found ?? null;
      } catch (_) { return null; }
    }

    function memberId(row) {
      const found = [...row.classList].map(name => name.match(/^other-party-id-(\d+)$/)).find(Boolean);
      return found ? Number(found[1]) : null;
    }

    function imageUrl(icon) {
      if (!icon) return '';
      if (/^https?:\/\//i.test(icon)) return icon;
      const path = String(icon).replace(/^\/+/, '');
      return `https://micc.garmory-cdn.cloud/obrazki/postacie/${path}`;
    }

    function statusFor(row, member, live) {
      if (member?.stasis) return { label: 'Staza', className: 'ycp-stasis' };
      if (member?.stasisIncoming) return { label: 'Nadchodzi staza', className: 'ycp-stasis' };
      if (live && !member?.isHero && !row.classList.contains('enabled')) return { label: 'W walce', className: 'ycp-fighting' };
      if (live || member?.isHero || row.classList.contains('enabled')) return { label: 'Na mapie', className: 'ycp-on-map' };
      return { label: 'Poza mapą', className: 'ycp-away' };
    }

    function syncRow(row, members) {
      const id = memberId(row);
      if (id == null) return;
      const member = members.get(id) ?? members.get(String(id));
      if (!member) return;
      const live = liveCharacter(id, member);
      const level = Number(live?.lvl);
      const profession = PROFESSION_NAMES[live?.prof] ?? '';
      const status = statusFor(row, member, live);
      const metaParts = [Number.isFinite(level) && level > 0 && level < 1000 ? `${level} lvl` : '', profession].filter(Boolean);
      const signature = JSON.stringify([member.icon, ...metaParts, status.className]);
      if (row.dataset.ycpSignature === signature) return;
      row.dataset.ycpSignature = signature;

      let avatar = row.querySelector('.ycp-avatar');
      if (!avatar) {
        avatar = document.createElement('div');
        avatar.className = 'ycp-avatar';
        row.querySelector('.table-wrapper')?.prepend(avatar);
      }
      avatar.style.backgroundImage = imageUrl(member.icon || live?.icon) ? `url("${imageUrl(member.icon || live?.icon)}")` : '';

      let meta = row.querySelector('.ycp-meta');
      if (!meta) {
        meta = document.createElement('div');
        row.querySelector('.table-wrapper')?.appendChild(meta);
      }
      meta.className = `ycp-meta ${status.className}`;
      meta.textContent = metaParts.join(' • ');

      let statusDot = row.querySelector('.ycp-status');
      if (!statusDot) {
        statusDot = document.createElement('span');
        row.appendChild(statusDot);
      }
      statusDot.className = `ycp-status ${status.className}`;
      statusDot.textContent = status.label;
      statusDot.title = status.label;
      statusDot.setAttribute('aria-label', status.label);
    }

    function sync() {
      framePending = false;
      if (stopped) return;
      const windowElement = document.querySelector('.party-window');
      if (!windowElement) return;
      windowElement.classList.add(ROOT_CLASS);
      const members = partyMembers();
      windowElement.querySelectorAll('.party-member').forEach(row => syncRow(row, members));
    }

    function scheduleSync() {
      if (stopped || framePending) return;
      framePending = true;
      requestAnimationFrame(sync);
    }

    const observer = new MutationObserver(scheduleSync);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style'] });
    const timer = setInterval(scheduleSync, 1000);
    scheduleSync();

    return () => {
      stopped = true;
      observer.disconnect();
      clearInterval(timer);
      document.querySelectorAll(`.party-window.${ROOT_CLASS}`).forEach(windowElement => {
        windowElement.classList.remove(ROOT_CLASS);
        windowElement.querySelectorAll('.ycp-avatar,.ycp-meta,.ycp-status').forEach(element => element.remove());
        windowElement.querySelectorAll('.party-member[data-ycp-signature]').forEach(row => delete row.dataset.ycpSignature);
      });
      style.remove();
    };
  }
};
