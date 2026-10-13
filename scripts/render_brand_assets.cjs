// The approved PNG is never repainted: SVG controls only placement and clipping.
const fs = require('node:fs');
const path = require('node:path');
const { Resvg } = require(require.resolve('@resvg/resvg-js', {
  paths: [path.resolve(__dirname, '../branding/toolchain')],
}));
const tasks = JSON.parse(fs.readFileSync(0, 'utf8'));
for (const { svg, output, size } of tasks) {
  const renderer = new Resvg(svg, {
    fitTo: { mode: 'width', value: size },
    font: { loadSystemFonts: false },
  });
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, renderer.render().asPng());
}
console.log(`Rendered ${tasks.length} approved-brand exports.`);
