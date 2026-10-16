// Inline SVG icons. Unicode symbols (▶ ◻ 📅) render as colourful emoji on
// many Android phones, so every icon in the UI is drawn here instead.
const svg = (body, extra = '') =>
  `<svg class="ico" viewBox="0 0 24 24" aria-hidden="true" ${extra}>${body}</svg>`;

export const ICONS = {
  box: svg('<rect x="5" y="5" width="14" height="14" rx="2.5"/><path d="M9 5v-2M15 19v2M5 15H3M19 9h2"/>'),
  coherence: svg('<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/><path d="M6 12h3l1.5-2.5L13 15l1.5-3H18"/>'),
  sigh: svg('<path d="M3 10c2.5-3 4.5-3 7 0s4.5 3 7 0 3-2 4-1"/><path d="M3 16c2.5-2 4.5-2 7 0s4.5 2 7 0"/>'),
  spirometer: svg('<rect x="3" y="4" width="5" height="16" rx="2.5"/><rect x="9.5" y="4" width="5" height="16" rx="2.5"/><rect x="16" y="4" width="5" height="16" rx="2.5"/><circle cx="5.5" cy="8" r="1.4" class="fill"/><circle cx="12" cy="12" r="1.4" class="fill"/><circle cx="18.5" cy="16.5" r="1.4" class="fill"/>'),
  play: svg('<path d="M8 5.5v13l11-6.5z" class="fill"/>'),
  close: svg('<path d="M6 6l12 12M18 6L6 18"/>'),
  plus: svg('<path d="M12 5v14M5 12h14"/>'),
  minus: svg('<path d="M5 12h14"/>'),
  calendar: svg('<rect x="4" y="5" width="16" height="15" rx="2.5"/><path d="M4 10h16M9 3v4M15 3v4"/><circle cx="12" cy="15" r="1.3" class="fill"/>'),
  download: svg('<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>'),
};
