import geist400Woff2 from '@fontsource/geist/files/geist-latin-400-normal.woff2';
import geist500Woff2 from '@fontsource/geist/files/geist-latin-500-normal.woff2';
import geist600Woff2 from '@fontsource/geist/files/geist-latin-600-normal.woff2';
import jetbrainsMono400Woff2 from '@fontsource/jetbrains-mono/files/jetbrains-mono-latin-400-normal.woff2';

const STYLE_ID = 'pane-fonts';

function fontUrl(asset: string | number) {
  return typeof asset === 'string' ? asset : String(asset);
}

/** Register Fontsource assets before the first app paint. */
function registerPaneFonts() {
  if (typeof document === 'undefined') return;
  if (document.getElementById(STYLE_ID)) return;

  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    @font-face{font-family:'Geist';src:url(${JSON.stringify(fontUrl(geist400Woff2))}) format('woff2');font-weight:400;font-style:normal;font-display:swap}
    @font-face{font-family:'Geist';src:url(${JSON.stringify(fontUrl(geist500Woff2))}) format('woff2');font-weight:500;font-style:normal;font-display:swap}
    @font-face{font-family:'Geist';src:url(${JSON.stringify(fontUrl(geist600Woff2))}) format('woff2');font-weight:600;font-style:normal;font-display:swap}
    @font-face{font-family:'JetBrains Mono';src:url(${JSON.stringify(fontUrl(jetbrainsMono400Woff2))}) format('woff2');font-weight:400;font-style:normal;font-display:swap}
  `;
  document.head.appendChild(style);
}

registerPaneFonts();
