import { defineConfig } from 'vite';

// Relative base so the same build works on Vercel/Netlify/GitHub Pages and
// inside the Capacitor WebView.
export default defineConfig({
  base: './',
  build: { outDir: 'dist', target: 'es2020' },
});
