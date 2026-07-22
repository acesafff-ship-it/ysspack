const MODULE_ID = 'hp-value';

export default {
  id: MODULE_ID,
  name: 'HP zamiast procentu',
  version: '1.0.0',
  description: 'Pokazuje aktualną liczbę punktów życia oraz pozwala ustawić kolor i rozmiar tekstu.',
  icon: '❤',
  settings: [
    { key: 'color', label: 'Kolor HP', type: 'color', defaultValue: '#ffffff' },
    { key: 'fontSize', label: 'Rozmiar tekstu', type: 'range', min: 8, max: 24, step: 1, defaultValue: 12, suffix: ' px' }
  ],

  start(context) {
    let timer = 0;
    let observer = null;

    const update = () => {
      const hp = Number(window.Engine?.hero?.d?.warrior_stats?.hp);
      const label = document.querySelector('.hpp .value');
      if (!Number.isFinite(hp) || !label) return;

      const color = context.getSetting('color', '#ffffff');
      const fontSize = Number(context.getSetting('fontSize', 12)) || 12;
      label.textContent = Math.max(0, Math.round(hp)).toLocaleString('pl-PL');
      label.style.setProperty('color', color, 'important');
      label.style.setProperty('font-size', `${fontSize}px`, 'important');
    };

    observer = new MutationObserver(update);
    observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
    timer = window.setInterval(update, 250);
    update();

    return () => {
      observer?.disconnect();
      window.clearInterval(timer);
      const label = document.querySelector('.hpp .value');
      if (label) {
        label.style.removeProperty('color');
        label.style.removeProperty('font-size');
      }
    };
  }
};
