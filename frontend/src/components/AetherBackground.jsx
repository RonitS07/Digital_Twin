import React, { useRef, useEffect } from 'react';

const PARTICLES = Array.from({ length: 40 }, () => ({
  x: Math.random() * 1920, y: Math.random() * 1080,
  vx: (Math.random() - 0.5) * 0.1, vy: (Math.random() - 0.5) * 0.1,
  r: Math.random() * 2 + 1,
  op: Math.random() * 0.4 + 0.1,
  col: ['rgba(110,90,255,', 'rgba(0,180,230,', 'rgba(0,200,130,'][Math.floor(Math.random() * 3)],
}));

export default function AetherBackground() {
  const ref = useRef(null);
  useEffect(() => {
    const c = ref.current; if (!c) return;
    const ctx = c.getContext('2d');
    let id, t = 0;
    const resize = () => { c.width = window.innerWidth; c.height = window.innerHeight; };
    resize(); window.addEventListener('resize', resize);
    const draw = () => {
      t += 0.002; ctx.clearRect(0, 0, c.width, c.height);
      const orbs = [
        { x: 0.28 + Math.sin(t*0.4)*0.1, y: 0.2 + Math.cos(t*0.3)*0.09, col: '110,90,255', op: 0.05 },
        { x: 0.72 + Math.cos(t*0.33)*0.09, y: 0.65 + Math.sin(t*0.24)*0.1, col: '0,180,230', op: 0.03 },
        { x: 0.12 + Math.sin(t*0.19)*0.07, y: 0.78 + Math.cos(t*0.27)*0.07, col: '0,200,130', op: 0.04 },
        { x: 0.85, y: 0.15, col: '240,60,95', op: 0.02 },
      ];
      orbs.forEach(o => {
        const g = ctx.createRadialGradient(c.width*o.x, c.height*o.y, 0, c.width*o.x, c.height*o.y, c.width*0.5);
        g.addColorStop(0, `rgba(${o.col},${o.op})`);
        g.addColorStop(1, 'transparent');
        ctx.fillStyle = g; ctx.fillRect(0, 0, c.width, c.height);
      });
      PARTICLES.forEach(p => {
        p.x += p.vx; p.y += p.vy;
        if (p.x < 0) p.x = c.width; if (p.x > c.width) p.x = 0;
        if (p.y < 0) p.y = c.height; if (p.y > c.height) p.y = 0;
        const pulse = 0.5 + Math.sin(t*2 + p.x*0.01)*0.3;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI*2);
        ctx.fillStyle = p.col + (p.op * pulse) + ')'; ctx.fill();
      });
      id = requestAnimationFrame(draw);
    };
    draw();
    return () => { cancelAnimationFrame(id); window.removeEventListener('resize', resize); };
  }, []);
  return <canvas ref={ref} className="fixed inset-0 pointer-events-none z-0" style={{ mixBlendMode: 'multiply', opacity: 0.8 }} />;
}
