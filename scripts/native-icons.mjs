// Write launcher icons into the generated native projects (run after `cap add`).
import { Resvg } from '@resvg/resvg-js';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const svg = readFileSync('public/icons/icon.svg', 'utf8');
const png = (src, size) => new Resvg(src, { fitTo: { mode: 'width', value: size } }).render().asPng();
const art = svg.replace(/<rect[^>]*\/>/, ''); // artwork without background
// Adaptive foreground: 108dp canvas, artwork in the inner 66dp safe zone.
const fg = art.replace('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">',
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><g transform="translate(100 100) scale(0.61)">').replace('</svg>', '</g></svg>');
const round = svg.replace(/<rect[^>]*\/>/, '<circle cx="256" cy="256" r="256" fill="#15302f"/>');

const dens = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
if (existsSync('android')) {
  for (const [d, k] of Object.entries(dens)) {
    const dir = `android/app/src/main/res/mipmap-${d}`;
    writeFileSync(`${dir}/ic_launcher.png`, png(svg, 48 * k));
    writeFileSync(`${dir}/ic_launcher_round.png`, png(round, 48 * k));
    writeFileSync(`${dir}/ic_launcher_foreground.png`, png(fg, 108 * k));
  }
  writeFileSync('android/app/src/main/res/values/ic_launcher_background.xml',
    '<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">#15302F</color>\n</resources>\n');
  // Monochrome status-bar icon for notifications (white lungs on transparent).
  writeFileSync('android/app/src/main/res/drawable/ic_stat_lungs.xml', `<?xml version="1.0" encoding="utf-8"?>
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="24dp" android:height="24dp" android:viewportWidth="512" android:viewportHeight="512">
    <path android:fillColor="#FFFFFFFF" android:pathData="M230,170 C172,144 98,200 78,300 C62,384 92,438 146,442 C196,446 226,416 230,374 Z"/>
    <path android:fillColor="#FFFFFFFF" android:pathData="M282,170 C340,144 414,200 434,300 C450,384 420,438 366,442 C316,446 286,416 282,374 Z"/>
    <path android:strokeColor="#FFFFFFFF" android:strokeWidth="30" android:strokeLineCap="round" android:pathData="M256,70 L256,230"/>
</vector>
`);
  console.log('android icons written');
}
if (existsSync('ios')) {
  writeFileSync('ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png',
    png(svg.replace(/rx="112" /, ''), 1024));
  console.log('ios icon written');
}
