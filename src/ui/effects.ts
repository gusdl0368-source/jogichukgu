// 축포(색종이) 연출. 캔버스 하나를 잠깐 띄웠다가 지운다.

const COLORS = ['#f5b81c', '#2f6fed', '#e5484d', '#2fb35a', '#8a5cf0', '#ffffff', '#ef4f9a'];

export function confetti(root: HTMLElement, amount = 120): void {
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
  const c = document.createElement('canvas');
  const w = root.clientWidth;
  const h = root.clientHeight;
  c.width = w;
  c.height = h;
  c.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:95';
  root.appendChild(c);
  const g = c.getContext('2d')!;
  const parts = Array.from({ length: amount }, () => ({
    x: w / 2 + (Math.random() - 0.5) * w * 0.3,
    y: h * 0.35,
    vx: (Math.random() - 0.5) * 9,
    vy: -Math.random() * 11 - 4,
    r: Math.random() * Math.PI,
    vr: (Math.random() - 0.5) * 0.4,
    s: 5 + Math.random() * 6,
    color: COLORS[Math.floor(Math.random() * COLORS.length)],
  }));
  const start = performance.now();
  const step = (t: number) => {
    const age = t - start;
    g.clearRect(0, 0, w, h);
    for (const p of parts) {
      p.vy += 0.28;
      p.vx *= 0.99;
      p.x += p.vx;
      p.y += p.vy;
      p.r += p.vr;
      g.save();
      g.globalAlpha = Math.max(0, 1 - age / 2600);
      g.translate(p.x, p.y);
      g.rotate(p.r);
      g.fillStyle = p.color;
      g.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2);
      g.restore();
    }
    if (age < 2600) requestAnimationFrame(step);
    else c.remove();
  };
  requestAnimationFrame(step);
}
