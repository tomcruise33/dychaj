// SVG visuals: breathing lungs and the three-ball Triflo device.

export function lungsSvg() {
  return `
<svg class="lungs" viewBox="0 0 240 220" aria-hidden="true">
  <defs>
    <radialGradient id="lg" cx="50%" cy="40%" r="70%">
      <stop offset="0%" stop-color="var(--lung-hi)"/>
      <stop offset="100%" stop-color="var(--lung)"/>
    </radialGradient>
  </defs>
  <g class="halo"><circle cx="120" cy="120" r="104"/></g>
  <path class="trachea" d="M120 18 V82 M120 82 C112 92 100 98 90 104 M120 82 C128 92 140 98 150 104"/>
  <g class="lobe left">
    <path d="M108 70 C80 58 44 84 34 132 C26 172 40 200 66 202 C90 204 104 190 108 170 Z"/>
    <path class="vein" d="M104 98 C90 108 78 122 70 140 M98 132 C84 142 74 156 68 172"/>
  </g>
  <g class="lobe right">
    <path d="M132 70 C160 58 196 84 206 132 C214 172 200 200 174 202 C150 204 136 190 132 170 Z"/>
    <path class="vein" d="M136 98 C150 108 162 122 170 140 M142 132 C156 142 166 156 172 172"/>
  </g>
</svg>`;
}

export function trifloSvg(target = 2) {
  const chambers = [0, 1, 2].map((i) => {
    const x = 30 + i * 62;
    const isTarget = i < target;
    return `
    <g class="chamber ${isTarget ? 'is-target' : ''}" data-i="${i}">
      <rect class="tube" x="${x}" y="20" width="44" height="150" rx="18"/>
      <text class="flow" x="${x + 22}" y="190" text-anchor="middle">${[600, 900, 1200][i]}</text>
      <circle class="ball b${i}" cx="${x + 22}" cy="150" r="15"/>
    </g>`;
  }).join('');
  return `
<svg class="triflo" viewBox="0 0 240 200" aria-hidden="true">
  ${chambers}
</svg>`;
}

// fill 0..1 for the lungs
export function setLungs(root, fill) {
  root.style.setProperty('--fill', fill.toFixed(3));
}

// Balls rise one after another as the inhale progresses toward the target.
export function setTriflo(root, fill, target) {
  const balls = root.querySelectorAll('.ball');
  balls.forEach((b, i) => {
    let lift = 0;
    if (i < target) {
      const start = i / target;
      const end = (i + 1) / target;
      lift = Math.max(0, Math.min(1, (fill - start) / (end - start)));
    }
    b.setAttribute('cy', String(150 - lift * 112));
    b.classList.toggle('up', lift > 0.95);
  });
}
