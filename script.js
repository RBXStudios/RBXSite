// ===== PARTICLES =====
const PARTICLE_COUNT = 40;
const container = document.getElementById('particles');
let particlesEnabled = true;

function createParticles() {
  container.innerHTML = '';
  if (!particlesEnabled) return;
  for (let i = 0; i < PARTICLE_COUNT; i++) {
    const p = document.createElement('div');
    p.className = 'particle';
    p.style.left = Math.random() * 100 + 'vw';
    p.style.animationDuration = (8 + Math.random() * 14) + 's';
    p.style.animationDelay = (Math.random() * 12) + 's';
    p.style.width = p.style.height = (1 + Math.random() * 2.5) + 'px';
    p.style.opacity = 0;
    container.appendChild(p);
  }
}

createParticles();

// ===== SETTINGS PANEL =====
function toggleSettings() {
  const panel = document.getElementById('settingsPanel');
  panel.classList.toggle('open');
}

document.addEventListener('click', (e) => {
  const panel = document.getElementById('settingsPanel');
  const btn = document.querySelector('.settings-btn');
  if (panel.classList.contains('open') && !panel.contains(e.target) && !btn.contains(e.target)) {
    panel.classList.remove('open');
  }
});

// ===== NEON COLOR =====
const colorMap = {
  cyan:   { neon: '#00ffe7', dim: 'rgba(0,255,231,0.15)', glow: '0 0 10px #00ffe7, 0 0 30px #00ffe7, 0 0 60px #00ffe780' },
  pink:   { neon: '#ff00c8', dim: 'rgba(255,0,200,0.15)',  glow: '0 0 10px #ff00c8, 0 0 30px #ff00c8, 0 0 60px #ff00c880' },
  green:  { neon: '#00ff88', dim: 'rgba(0,255,136,0.15)',  glow: '0 0 10px #00ff88, 0 0 30px #00ff88, 0 0 60px #00ff8880' },
  orange: { neon: '#ff8800', dim: 'rgba(255,136,0,0.15)',  glow: '0 0 10px #ff8800, 0 0 30px #ff8800, 0 0 60px #ff880080' },
};

function setColor(name) {
  const c = colorMap[name];
  if (!c) return;
  const root = document.documentElement;
  root.style.setProperty('--neon', c.neon);
  root.style.setProperty('--neon-dim', c.dim);
  root.style.setProperty('--neon-glow', c.glow);
  document.querySelectorAll('.color-dot').forEach(d => d.classList.remove('active'));
  const target = document.querySelector(`.color-dot.${name}`);
  if (target) {
    target.classList.add('active');
    // Remove previous color classes and set just the one that matches the active state
    target.style.borderColor = '#fff';
  }
  // Recreate particles with new color
  createParticles();
}

// ===== TOGGLES =====
function toggleParticles() {
  particlesEnabled = document.getElementById('particleToggle').checked;
  createParticles();
}

function toggleScanlines() {
  const sl = document.querySelector('.scanlines');
  sl.style.display = document.getElementById('scanlineToggle').checked ? 'block' : 'none';
}

// ===== SCROLL REVEAL =====
const observer = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.style.opacity = '1';
      entry.target.style.transform = 'translateY(0)';
      observer.unobserve(entry.target);
    }
  });
}, { threshold: 0.1 });

document.querySelectorAll('.about-card, .notes-box, .stat-card').forEach(el => {
  el.style.opacity = '0';
  el.style.transform = 'translateY(30px)';
  el.style.transition = 'opacity 0.7s ease, transform 0.7s ease';
  observer.observe(el);
});

// Stagger stat cards
document.querySelectorAll('.stat-card').forEach((el, i) => {
  el.style.transitionDelay = (i * 0.15) + 's';
});
