// Render PNG icons from public/icons/icon.svg (run: npm run icons).
import { Resvg } from '@resvg/resvg-js';
import { readFileSync, writeFileSync } from 'node:fs';

const svg = readFileSync('public/icons/icon.svg', 'utf8');
const render = (src, size, out) => {
  const png = new Resvg(src, { fitTo: { mode: 'width', value: size } }).render().asPng();
  writeFileSync(out, png);
  console.log('wrote', out);
};
render(svg, 192, 'public/icons/icon-192.png');
render(svg, 512, 'public/icons/icon-512.png');
render(svg, 180, 'public/icons/apple-touch-icon.png');
render(svg, 1024, 'resources/icon-1024.png');
// Maskable: full-bleed background, artwork inside the 80% safe zone.
const maskable = svg
  .replace('<rect width="512" height="512" rx="112" fill="#15302f"/>', '<rect width="512" height="512" fill="#15302f"/><g transform="translate(51 51) scale(0.8)">')
  .replace('</svg>', '</g></svg>');
render(maskable, 512, 'public/icons/icon-maskable-512.png');
render(maskable, 1024, 'resources/icon-maskable-1024.png');
// Monochrome badge for Android web notifications.
const badge = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><path d="M230 170 C172 144 98 200 78 300 C62 384 92 438 146 442 C196 446 226 416 230 374 Z M282 170 C340 144 414 200 434 300 C450 384 420 438 366 442 C316 446 286 416 282 374 Z" fill="#fff"/><path d="M256 88 V214" stroke="#fff" stroke-width="28" stroke-linecap="round"/></svg>';
render(badge, 96, 'public/icons/badge-96.png');
