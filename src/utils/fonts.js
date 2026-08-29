const READER_FONT_REQUESTS = {
  Literata: 'family=Literata:ital,opsz,wght@0,7..72,300..800;1,7..72,300..800',
  'Source Serif 4': 'family=Source+Serif+4:ital,opsz,wght@0,8..60,300..800;1,8..60,300..800',
  'Old Standard TT': 'family=Old+Standard+TT:ital,wght@0,400;0,700;1,400',
  Kurale: 'family=Kurale',
};

function getReaderFontName(fontFamily) {
  return Object.keys(READER_FONT_REQUESTS).find((name) => fontFamily.includes(name));
}

export function ensureReaderFontLoaded(fontFamily) {
  const fontName = getReaderFontName(fontFamily);
  if (!fontName || document.querySelector(`link[data-reader-font="${fontName}"]`)) return;

  const stylesheet = document.createElement('link');
  stylesheet.rel = 'stylesheet';
  stylesheet.dataset.readerFont = fontName;
  stylesheet.href = `https://fonts.googleapis.com/css2?${READER_FONT_REQUESTS[fontName]}&display=swap`;
  document.head.appendChild(stylesheet);
}
