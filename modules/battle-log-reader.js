const ROOT_CLASS = 'yss-readable-battle-log';
const STYLE_ID = 'yss-readable-battle-log-style';

export default {
  id: 'battle-log-reader',
  name: 'Czytelny log walki',
  version: '1.0.2',
  description: 'Zwiększa czytelność komunikatów walki, rozdziela kolejne akcje i poprawia kontrast obrażeń.',
  icon: '⚔',

  start() {
    if (location.hostname === 'www.margonem.pl') return () => {};

    document.documentElement.classList.add(ROOT_CLASS);
    document.getElementById(STYLE_ID)?.remove();

    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      .${ROOT_CLASS} .battle-controller .battle-msg{
        box-sizing:border-box!important;
        min-height:22px!important;
        margin:0 0 3px!important;
        padding:4px 6px!important;
        font-size:12px!important;
        line-height:15px!important;
        letter-spacing:.05px!important;
        text-shadow:1px 1px 1px #000!important;
        overflow-wrap:anywhere!important;
      }
      .${ROOT_CLASS} .battle-controller .battle-msg b[class^="dmg"],
      .${ROOT_CLASS} .battle-controller .battle-msg b[class*=" dmg"]{
        font-size:12.5px!important;
        font-weight:800!important;
        text-shadow:1px 1px #000,-1px -1px #000!important;
      }
      .${ROOT_CLASS} .battle-controller .battle-msg font{
        font-weight:800!important;
        letter-spacing:.15px!important;
        text-shadow:1px 1px #000,-1px -1px #000!important;
      }
      .${ROOT_CLASS} .battle-controller .scroll-wrapper,
      .${ROOT_CLASS} .battle-controller .scroll-pane{scrollbar-width:auto;scrollbar-color:#8b7044 #18120d}`;
    document.head.appendChild(style);

    return () => {
      document.documentElement.classList.remove(ROOT_CLASS);
      style.remove();
    };
  }
};
