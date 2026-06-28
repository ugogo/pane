import geistWoff2 from '../../assets/fonts/Geist-Variable.woff2';

const STYLE_ID = 'pane-geist-font';

function geistFontUrl() {
  if (typeof geistWoff2 === 'string') return geistWoff2;
  return String(geistWoff2);
}

/** Inject Geist via CSS so WebView2 gets the font before the first app paint. */
export function registerGeistFont() {
  if (typeof document === 'undefined') return;
  if (document.getElementById(STYLE_ID)) return;

  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `@font-face{font-family:'Geist Variable';src:url(${JSON.stringify(geistFontUrl())}) format('woff2');font-weight:100 900;font-style:normal;font-display:swap}`;
  document.head.appendChild(style);
}

registerGeistFont();
