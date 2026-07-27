const ROOT_ID = 'ysspack-lootlog-feed';
const STORAGE_KEY = 'ysspack-lootlog-local-entries';
const API_URL = 'https://ysspack-bestiary-online.acesaff.workers.dev';
const CLIENT_KEY = 'ysspack-lootlog-client-id';
const ELITE_NAMES = ["Mushita","Kotołak Tropiciel","Shae Phu","Zorg Jednooki Baron","Władca rzek","Gobbos","Tyrtajos","Szczęt alias Gładki","Tollok Shimger","Razuglag Oklash","Agar","Foverk Turrim","Owadzia Matka","Vari Kruger","Furruk Kozug","Jotun","Tollok Atamatu","Tollok Utumutu","Lisz","Grabarz świątynny","Podły zbrojmistrz","Wielka Stopa","Choukker","Morthen","Żelazoręki Ohydziarz","Leśne Widmo","Goplana","Gnom Figlid","Centaur Zyfryd","Kambion","Jertek Moxos","Miłośnik łowców","Miłośnik rycerzy","Miłośnik magii","Morski potwór","Krab pustelnik","Borgoros Garamir III","Stworzyciel","Młody Jack Truciciel","Eol","Grubber Ochlaj","Mistrz Worundriel","Wójt Fistuła","Teściowa Rumcajsa","Berserker Amuno","Fodug Zolash","Goons Asterus","Adariel","Sheba Orcza Szamanka","Burkog Lorulk","Duch Władcy Klanów","Bragarth Myśliwy Dusz","Fursharag Pożeracz Umysłów","Ziuggrael Strażnik Królowej","Królowa Śniegu","Lusgrathera Królowa Pramatka","Wrzosera","Chryzoprenia","Cantedewia","Ogr Stalowy Pazur","Torunia Ankelwald","Pięknotka Mięsożerna","Breheret Żelazny Łeb","Cerasus","Mysiur Myświórowy Król","Sadolia Nadzorczyni Hurys","Bergermona Krwawa Hrabina","Sataniel Skrytobójca","Annaniel Wysysacz Marzeń","Gothardus Kolekcjoner Głów","Zufulus Smakosz Serc","Czempion Furboli","Arachniregina Colosseus","Al'diphrin Ilythirahel","Marlloth Malignitas","Arytodam olbrzymi","Mocny Maddoks","Fangaj","Luna","Noumenia","Dendroculus","Silvanasus","Tolypeutes","Cuaitl Citlalin","Yaotl","Quetzalcoatl","Wabicielka","Pogardliwa Sybilla","Wysłannik Tellarów","Fovos","Chopesz","Neferkar Set","Chaegd Agnrakh","Vaenra Charkhaam","Terrozaur","Mazurnik Przybrzeżny","Nymphemonia","Zorin","Furion","Artenius","Czarna Wilczyca","Astratus","Karhu","Tigrios","Mrówcza Królowa","Paladyński Apostata","Nuna Furla","Zulu Furla","Mula Furla","Cerber","Herszt Rozbójników","Zakuty goblin","Nocny Puff","Dowódca Ghuli","Wilcza Jagoda","Wilcza Paszcza","Thowar","Krogor","Nieżłopka wątpia","Bazyliszek Mroku","Tarrol Agze","Mrówka Królowa","Tollok Vitez","Selder","Łowca Skór","Zarządca Magazynu","Duchowy Pożeracz","Mnich Czarnego Uroku","Stalowa Twarz","Krasnoludzki eksplorator","Berog Astron","Istota cienia","Strażnik kniei","Brzeginia","Rdzawy wyziew","Strażnik świętego ognia","Uriasog","Nieumarły krzyżowiec","Antyczny wojownik","Zabalsamowany wyznawca Seta","Wielka Macka","Demiurg argilla","Demiurg cretula","Demiurg lutum","Marid","Szkielet Bosmana","Anemoi","Golem władca lawy","Monstrualna łunka piżmowa","Monstrualna łunka ognista","Hanka patelnianka","Mistrz oscypków","Berserker Grilull","Berserker Okel","Upadły Lord","Biała Dama","Pogromca Wątpliwych","Duch Pradawnego Egzekutora","Strażnik Przyboczny","Profos Czarnej Gwardii","Patronka szronu","Córa Dębu","Zielone Karczycho","Bezsenny Patrycjusz","Madame Pompadour","Urwigłówka trójgłowa","Aragoth Władca Śnieżyc","Wilcza Zamieć","Ściółkowe monstrum","Myświór Byku","Hurysa Achajeta","Czarny Wdowiec","Demoniczny Strażnik","Potężny Furbol","Phoneutria","Wyznawca pajęczej bogini","Wysłanniczka matrony","Krokozaur jasnobrzuchy","Yaramaja krwiopijna","Pancerny maddok","Ofiara grzybyfikacji","Księżycowy strażnik","Bubalus","Cuachic","Czciciel Quetzalcoatla","Potworzak","Prawa wiedźma","Pokutujący bębniarz","Szalony brzdękacz","Twór chaosu","Drakosęp","Wyznawca Hebrehotha","Calathea Ornata","Strelitzia Reginae"];
const normalize = value => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pl-PL').trim();
const ELITE_KEYS = new Set(ELITE_NAMES.map(normalize));
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
const rarityOf = value => {
  const d = value?.d || value?.data || value || {};
  const raw = String(d.rarity ?? d.quality ?? d.itemRarity ?? d.stat ?? d.stats ?? '').toLocaleLowerCase('pl-PL');
  const numeric = Number(d.rarity ?? d.quality);
  if (raw.includes('legend') || numeric === 5 || numeric === 6) return 'legendary';
  if (raw.includes('hero') || numeric === 4) return 'heroic';
  if (raw.includes('unique') || raw.includes('unikat') || numeric === 3) return 'unique';
  return 'normal';
};

export default {
  id: 'lootlog',
  name: 'LootLog',
  version: '0.3.0',
  description: 'Samodzielnie zapisuje looty ze wszystkich potworów na dolnej belce gry.',
  icon: '✦',

  start() {
    if (location.hostname === 'www.margonem.pl') return () => {};
    function readEntries() {
      try {
        const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
        return Array.isArray(saved) ? saved.slice(0, 40) : [];
      } catch (_) { return []; }
    }
    let entries = readEntries();
    let trackedBattle = null;
    let wasBattle = false;
    let syncTimer = 0;

    function clientId() {
      try {
        let id = localStorage.getItem(CLIENT_KEY) || '';
        if (/^[a-zA-Z0-9_-]{16,64}$/.test(id)) return id;
        const bytes = new Uint8Array(16);
        crypto.getRandomValues(bytes);
        id = [...bytes].map(value => value.toString(16).padStart(2, '0')).join('');
        localStorage.setItem(CLIENT_KEY, id);
        return id;
      } catch (_) { return ''; }
    }

    const world = () => String(window.Engine?.hero?.d?.world || location.hostname.split('.')[0] || '').toLocaleLowerCase('pl-PL');

    const root = document.createElement('section');
    root.id = ROOT_ID;
    root.title = 'LootLog — kliknij, aby rozwinąć historię';
    document.body.append(root);

    const style = document.createElement('style');
    style.dataset.ysspackModule = 'lootlog';
    style.textContent = `
      #${ROOT_ID}{position:fixed;z-index:2147483500;left:50%;bottom:72px;transform:translateX(-50%);width:min(470px,calc(100vw - 28px));color:#eee2c5;font:11px/14px Verdana,Arial,sans-serif;filter:drop-shadow(0 2px 3px #000);user-select:none}
      #${ROOT_ID} .ll-bar{height:29px;display:grid;grid-template-columns:18px auto minmax(0,1fr) 16px;gap:6px;align-items:center;padding:0 9px;border:1px solid #1c1009;border-top-color:#b08a52;border-bottom-color:#120a05;background:repeating-linear-gradient(0deg,rgba(255,255,255,.035) 0 1px,transparent 1px 4px),linear-gradient(#694625,#3b2414 47%,#21130b 52%,#482c18);box-shadow:inset 0 1px rgba(255,231,172,.18),inset 0 -1px #090604}
      #${ROOT_ID} .ll-mark{color:#f4cc55;font-size:15px;text-shadow:0 0 4px #f2b500}#${ROOT_ID} .ll-title{color:#f3d879;font-weight:bold;white-space:nowrap;text-shadow:1px 1px #170c05}.ll-latest{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#d8cdb7}.ll-latest b{color:#f7e9ae}.ll-latest span{padding:0 4px;color:#9d896d}.ll-latest em{font-style:normal}.rarity-legendary{color:#f1a63e}.rarity-heroic{color:#65c9ff}.rarity-unique{color:#f3e34e}.waiting{color:#b6a88f}.ll-expand{color:#dbb861;font-size:12px;text-align:right}
      #${ROOT_ID} .ll-history{display:none;max-height:196px;overflow:auto;padding:8px 10px;border:1px solid #8f7043;border-top:0;background:linear-gradient(135deg,rgba(34,23,13,.98),rgba(13,11,9,.99));box-shadow:inset 0 0 0 1px #0a0806}#${ROOT_ID}.expanded .ll-history{display:block}#${ROOT_ID}.expanded .ll-expand{transform:rotate(180deg)}.ll-history-title{padding-bottom:5px;border-bottom:1px solid #6b502d;color:#f0d27c;font-weight:bold}.ll-history ol{padding:0;margin:4px 0;list-style:none}.ll-history li{display:grid;grid-template-columns:38px minmax(90px,1fr) minmax(100px,1.25fr);gap:6px;padding:4px 0;border-bottom:1px solid rgba(156,123,70,.28);color:#ded3be}.ll-history time{color:#aa9e88}.ll-history i{color:#f0cd71;font-style:normal}.ll-history .empty{display:block;color:#aaa08e}.ll-history small{display:block;padding-top:4px;color:#958b78;font-size:9px;line-height:12px}
      @media(max-width:700px){#${ROOT_ID}{bottom:46px;width:calc(100vw - 16px)}#${ROOT_ID} .ll-title{display:none}}
    `;
    document.head.append(style);

    const saveEntries = () => {
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(entries)); } catch (_) { /* brak miejsca nie blokuje gry */ }
    };

    function render() {
      const latest = entries[0];
      const feed = latest
        ? `<b>${escapeHtml(latest.elite)}</b><span>—</span><em class="rarity-${escapeHtml(latest.rarity)}">${escapeHtml(latest.item)}${latest.amount > 1 ? ' ×' + latest.amount : ''}</em>`
        : '<span class="waiting">LootLog: oczekiwanie na zdobyty łup…</span>';
      const history = entries.length
        ? entries.map(entry => `<li><time>${new Date(entry.at).toLocaleTimeString('pl-PL',{hour:'2-digit',minute:'2-digit'})}</time><span>${escapeHtml(entry.elite)}</span><i>${escapeHtml(entry.item)}${entry.amount > 1 ? ' ×' + entry.amount : ''}</i></li>`).join('')
        : '<li class="empty">Historia jest jeszcze pusta.</li>';
      root.innerHTML = `<div class="ll-bar"><span class="ll-mark">✦</span><span class="ll-title">LootLog</span><div class="ll-latest">${feed}</div><span class="ll-expand">▴</span></div><div class="ll-history"><div class="ll-history-title">Ostatnie looty</div><ol>${history}</ol><small>Wspólny log świata ${escapeHtml(world())} · wpisy są anonimowe.</small></div>`;
    }

    async function loadGlobalEntries() {
      try {
        const response = await fetch(`${API_URL}/lootlog?world=${encodeURIComponent(world())}&limit=30`);
        if (!response.ok) return;
        const data = await response.json();
        if (!Array.isArray(data?.entries)) return;
        const remote = data.entries.map(entry => ({
          elite: entry.elite_name,
          item: entry.item_name,
          rarity: entry.rarity,
          amount: 1,
          at: Number(entry.created_at) * 1000,
        })).filter(entry => entry.elite && entry.item && entry.at);
        if (remote.length) { entries = remote; render(); }
      } catch (_) { /* lokalny log pozostaje dostępny bez sieci */ }
    }

    async function publish(entry) {
      const id = clientId();
      if (!id) return;
      try {
        await fetch(`${API_URL}/lootlog`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ world: world(), eliteName: entry.elite, itemName: entry.item, rarity: entry.rarity, clientId: id }),
        });
      } catch (_) { /* zapis lokalny działa niezależnie od serwera */ }
    }

    function battleOpponent() {
      const battle = window.Engine?.battle;
      if (!battle) return null;
      const source = battle.warriorsList || battle.warriors || battle.fighters || {};
      const warriors = source instanceof Map ? [...source.values()] : Array.isArray(source) ? source : Object.values(source);
      const enemies = warriors.map(warrior => {
        const data = warrior?.d || warrior?.data || warrior;
        const name = data?.name || data?.nick;
        const npc = data?.npc;
        return name && (npc === true || Number(npc) === 1) ? String(name) : null;
      }).filter(Boolean);
      if (!enemies.length) return null;
      const unique = [...new Set(enemies)];
      return unique.length > 1 ? `${unique[0]} +${unique.length - 1}` : unique[0];
    }

    function inventory() {
      const state = new Map();
      const sources = [window.Engine?.items, window.Engine?.equipment, window.Engine?.hero?.items, window.g?.item, window.g?.items].filter(Boolean);
      const add = (value, key) => {
        if (!value || typeof value !== 'object') return;
        const d = value.d || value.data || value;
        const name = String(d.name || d.nick || d.n || '').trim();
        const id = d.id ?? d.itemId ?? d.item_id ?? key;
        if (!name || id === undefined || id === null) return;
        const amount = Math.max(1, Number(d.amount ?? d.count ?? d.quantity ?? 1) || 1);
        const itemKey = String(id) + '|' + name;
        const existing = state.get(itemKey);
        if (!existing || amount > existing.amount) state.set(itemKey, { name, amount, rarity: rarityOf(value) });
      };
      const addCollection = collection => {
        if (Array.isArray(collection)) collection.forEach(add);
        else if (collection instanceof Map) collection.forEach((value, key) => add(value, key));
        else if (collection && typeof collection === 'object') Object.entries(collection).forEach(([key, value]) => add(value, key));
      };
      sources.forEach(source => {
        ['getDrawableList', 'getList', 'getAll'].forEach(method => { try { if (typeof source?.[method] === 'function') addCollection(source[method]()); } catch (_) {} });
        addCollection(source); addCollection(source.items); addCollection(source.list); addCollection(source.data);
      });
      return state;
    }

    function finishTracking() {
      const after = inventory();
      const found = [];
      after.forEach((item, key) => {
        const before = trackedBattle.before.get(key);
        if (!before || item.amount > before.amount) {
          found.push({ ...item, amount: Math.max(1, item.amount - (before?.amount || 0)) });
        }
      });
      const distinct = [...new Map(found.map(item => [item.name + '|' + item.rarity, item])).values()];
      const newEntries = distinct.map(item => ({ elite: trackedBattle.elite, item: item.name, rarity: item.rarity, amount: item.amount, at: Date.now() }));
      newEntries.forEach(entry => entries.unshift(entry));
      if (distinct.length) { entries = entries.slice(0, 40); saveEntries(); render(); }
      newEntries.forEach(publish);
      trackedBattle = null;
    }

    const timer = window.setInterval(() => {
      const opponent = battleOpponent();
      if (opponent && !trackedBattle) trackedBattle = { elite: opponent, before: inventory() };
      if (wasBattle && !opponent && trackedBattle) window.setTimeout(() => { if (trackedBattle) finishTracking(); }, 1800);
      wasBattle = Boolean(opponent);
    }, 350);

    root.addEventListener('click', () => root.classList.toggle('expanded'));
    render();
    loadGlobalEntries();
    syncTimer = window.setInterval(loadGlobalEntries, 30000);

    return () => { window.clearInterval(timer); window.clearInterval(syncTimer); root.remove(); style.remove(); };
  }
};
