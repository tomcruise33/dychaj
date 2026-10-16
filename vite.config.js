import { defineConfig } from 'vite';

// Relative base so the same build works on Vercel/Netlify/GitHub Pages and
// inside the Capacitor WebView.
export default defineConfig({
  base: './',
  // Old Android System WebView (Chrome 61+) must still run the app.
  build: { outDir: 'dist', target: ['es2017', 'chrome61', 'safari13'] },
});
