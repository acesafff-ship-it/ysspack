const ROOT_CLASS = 'yss-readable-battle-log';
const STYLE_ID = 'yss-readable-battle-log-style';

export default {
  id: 'battle-log-reader',
  name: 'Czytelny log walki',
  version: '1.0.3',
  description: 'Pogrubia wyróżnione akcje i efekty w oryginalnym logu walki.',
  icon: '⚔',

  start() {
    if (location.hostname === 'www.margonem.pl') return () => {};

    document.documentElement.classList.add(ROOT_CLASS);
    document.getElementById(STYLE_ID)?.remove();

    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `.${ROOT_CLASS} .battle-controller .battle-msg font{font-weight:800!important}`;
    document.head.appendChild(style);

    return () => {
      document.documentElement.classList.remove(ROOT_CLASS);
      style.remove();
    };
  }
};
