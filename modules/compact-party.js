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
const PROFESSION_SHORT_NAMES = { m: 'Mag', w: 'Woj', p: 'Pal', t: 'Trop', h: 'Łow', b: 'TO' };

export default {
  id: MODULE_ID,
  name: 'Kompaktowy podgląd drużyny',
  version: '1.0.6',
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
      .party-window.${ROOT_CLASS} .ycp-prof-summary{display:flex;flex-wrap:wrap;align-items:center;justify-content:center;gap:3px;margin:2px 3px 4px;padding:3px;border:1px solid #555;background:rgba(0,0,0,.35);min-height:16px;box-sizing:border-box}
      .party-window.${ROOT_CLASS} .ycp-prof-count{display:inline-flex;align-items:center;gap:2px;padding:1px 4px;border:1px solid #6c6c6c;border-radius:2px;background:#292929;color:#ddd;font:700 9px/12px Arial,sans-serif;text-shadow:0 1px #000;white-space:nowrap}
      .party-window.${ROOT_CLASS} .ycp-prof-count strong{color:#ffdc65;font-size:10px}
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

    function normalizeName(value) {
      return String(value ?? '').trim().toLocaleLowerCase('pl');
    }

    function currentMapPlayers() {
      const ids = new Set();
      const names = new Set();
      const add = character => {
        const data = character?.d ?? character;
        const id = Number(data?.id);
        const name = normalizeName(data?.nick);
        if (Number.isFinite(id)) ids.add(id);
        if (name) names.add(name);
      };

      add(window.Engine?.hero);
      try {
        const drawable = window.Engine?.others?.getDrawableList?.();
        if (Array.isArray(drawable)) {
          drawable.forEach(character => {
            if (character?.isPlayer === true && character?.d?.nick) add(character);
          });
        }
      } catch (_) {}
      return { ids, names };
    }

    function isBattleParticipant(id, member) {
      const battle = window.Engine?.battle;
      if (!battle || battle.endBattle !== false || battle.endBattleForMe !== false) return false;
      const expectedName = normalizeName(member?.nick);
      const warriors = battle.warriorsList && typeof battle.warriorsList === 'object'
        ? Object.values(battle.warriorsList)
        : [];
      return warriors.some(warrior => {
        if (!warrior || Number(warrior.npc) === 1) return false;
        const warriorIds = [warrior.id, warrior.hid, warrior.charId, warrior.heroId].map(Number);
        if (warriorIds.includes(id)) return true;
        return expectedName && normalizeName(warrior.name ?? warrior.nick) === expectedName;
      });
    }

    function statusFor(member, id, mapPlayers) {
      if (member?.stasis) return { label: 'Staza', className: 'ycp-stasis' };
      if (member?.stasisIncoming) return { label: 'Nadchodzi staza', className: 'ycp-stasis' };
      if (isBattleParticipant(id, member)) return { label: 'W walce', className: 'ycp-fighting' };
      if (mapPlayers.ids.has(id) || mapPlayers.names.has(normalizeName(member?.nick))) {
        return { label: 'Na mapie', className: 'ycp-on-map' };
      }
      return { label: 'Poza mapą', className: 'ycp-away' };
    }

    function professionCode(member, live) {
      const direct = String(live?.prof ?? member?.profession ?? '').toLowerCase();
      if (PROFESSION_NAMES[direct]) return direct;
      const icon = String(member?.icon ?? live?.icon ?? '').toLowerCase();
      if (/\/(mage|mag)\//.test(icon)) return 'm';
      if (/\/(woj|war)\//.test(icon)) return 'w';
      if (/\/pal\//.test(icon)) return 'p';
      if (/\/(trop|tracker)\//.test(icon)) return 't';
      if (/\/(hun|lowca|hunter)\//.test(icon)) return 'h';
      if (/\/(bd|blade)\//.test(icon)) return 'b';
      return '';
    }

    function syncProfessionSummary(windowElement, members) {
      const counts = new Map();
      for (const [rawId, member] of members) {
        const id = Number(rawId);
        const code = professionCode(member, liveCharacter(id, member)) || '?';
        counts.set(code, (counts.get(code) ?? 0) + 1);
      }
      const order = ['m', 'w', 'p', 't', 'h', 'b', '?'];
      const signature = order.map(code => `${code}:${counts.get(code) ?? 0}`).join('|');
      const list = windowElement.querySelector('.players-content .party__list');
      if (!list) return;
      let summary = windowElement.querySelector('.players-content .ycp-prof-summary');
      if (!summary) {
        summary = document.createElement('div');
        summary.className = 'ycp-prof-summary';
        list.before(summary);
      }
      if (summary.dataset.signature === signature) return;
      summary.dataset.signature = signature;
      summary.replaceChildren(...order.filter(code => counts.get(code)).map(code => {
        const cell = document.createElement('span');
        cell.className = 'ycp-prof-count';
        const fullName = code === '?' ? 'Nierozpoznana profesja' : PROFESSION_NAMES[code];
        cell.title = fullName;
        cell.innerHTML = `${PROFESSION_SHORT_NAMES[code] ?? '?'} <strong>${counts.get(code)}</strong>`;
        return cell;
      }));
    }

    function syncRow(row, members, mapPlayers) {
      const id = memberId(row);
      if (id == null) return;
      const member = members.get(id) ?? members.get(String(id));
      if (!member) return;
      const live = liveCharacter(id, member);
      const level = Number(live?.lvl);
      const profession = PROFESSION_NAMES[professionCode(member, live)] ?? '';
      const status = statusFor(member, id, mapPlayers);
      const metaParts = [Number.isFinite(level) && level > 0 && level < 1000 ? `${level} lvl` : '', profession].filter(Boolean);
      const signature = JSON.stringify([member.icon, ...metaParts, status.className, status.label]);
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
      const mapPlayers = currentMapPlayers();
      windowElement.querySelectorAll('.party-member').forEach(row => syncRow(row, members, mapPlayers));
      syncProfessionSummary(windowElement, members);
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
        windowElement.querySelectorAll('.ycp-avatar,.ycp-meta,.ycp-status,.ycp-prof-summary').forEach(element => element.remove());
        windowElement.querySelectorAll('.party-member[data-ycp-signature]').forEach(row => delete row.dataset.ycpSignature);
      });
      style.remove();
    };
  }
};
