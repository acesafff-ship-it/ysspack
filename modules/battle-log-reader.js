const ROOT_CLASS = 'yss-readable-battle-log';
const STYLE_ID = 'yss-readable-battle-log-style';

export default {
  id: 'battle-log-reader',
  name: 'Czytelny log walki',
  version: '1.0.0',
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
        border-left:3px solid #777!important;
        font-size:12px!important;
        line-height:15px!important;
        letter-spacing:.05px!important;
        text-shadow:1px 1px 1px #000!important;
        overflow-wrap:anywhere!important;
      }
      .${ROOT_CLASS} .battle-controller .battle-msg.attack{border-left-color:#e05252!important;background:rgba(69,15,15,.86)!important}
      .${ROOT_CLASS} .battle-controller .battle-msg.attack2{border-left-color:#ff9b54!important;background:rgba(67,32,17,.88)!important}
      .${ROOT_CLASS} .battle-controller .battle-msg.neu{border-left-color:#6f9071!important;background:rgba(18,35,17,.86)!important}
      .${ROOT_CLASS} .battle-controller .battle-msg.win{border-left-color:#45d75b!important;background:rgba(13,48,18,.9)!important}
      .${ROOT_CLASS} .battle-controller .battle-msg.lose{border-left-color:#ff6868!important;background:rgba(61,14,14,.9)!important}
      .${ROOT_CLASS} .battle-controller .battle-msg.txt{border-left-color:#d3b35a!important;background:rgba(39,35,24,.92)!important}
      .${ROOT_CLASS} .battle-controller .battle-msg b[class^="dmg"],
      .${ROOT_CLASS} .battle-controller .battle-msg b[class*=" dmg"]{
        font-size:12.5px!important;
        font-weight:800!important;
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
