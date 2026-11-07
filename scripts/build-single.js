// Bundles index.html, styles.css, tax.js and app.js into one self-contained
// page body at dist/taxback.html (used for the hosted web-link version).
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');

const html = read('index.html');
const css = read('styles.css');
const js = ['tax.js', 'app.js'].map(read);
js.concat(css).forEach((src) => {
  if (/<\/(script|style)/i.test(src)) throw new Error('Source contains a closing script/style tag');
});

const title = html.match(/<title>[\s\S]*?<\/title>/)[0];
const desc = html.match(/<meta name="description"[^>]*>/)[0];
const body = html.match(/<body>([\s\S]*)<\/body>/)[1]
  .replace(/\s*<script src="[^"]+"><\/script>/g, '');

const out = [
  title,
  '<meta name="claude:viewport-fit-sides" content="cover">',
  desc,
  `<style>\n${css}</style>`,
  body.trim(),
  `<script>\n${js[0]}</script>`,
  `<script>\n${js[1]}</script>`,
  '',
].join('\n');

fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
fs.writeFileSync(path.join(root, 'dist', 'taxback.html'), out);
console.log(`dist/taxback.html (${(out.length / 1024).toFixed(1)} KB)`);
