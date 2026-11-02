// Deterministic architectural surface atlas. Canvas only; no network assets.
function texture(THREE, width, height, paint, repeat = [1, 1]) {
  const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext('2d'); paint(ctx, width, height);
  const map = new THREE.CanvasTexture(canvas); map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = map.wrapT = THREE.RepeatWrapping; map.repeat.set(repeat[0], repeat[1]); map.anisotropy = 4;
  return map;
}
function noise(ctx, w, h, alpha = 10) {
  const image = ctx.getImageData(0, 0, w, h), p = image.data;
  let seed = 73856093; const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  for (let i = 0; i < p.length; i += 4) { const n = (rand() - .5) * alpha; p[i] += n; p[i + 1] += n; p[i + 2] += n; }
  ctx.putImageData(image, 0, 0);
}
export function createSurfaces(THREE) {
  const marble = texture(THREE, 768, 768, (c, w, h) => {
    c.fillStyle = '#eee8dc'; c.fillRect(0, 0, w, h); c.strokeStyle = 'rgba(154,145,127,.22)'; c.lineWidth = 3;
    for (let i = -2; i < 7; i++) { c.beginPath(); c.moveTo(i * 180, 0); c.bezierCurveTo(i * 180 + 110, 220, i * 180 - 100, 400, i * 180 + 130, h); c.stroke(); }
    c.strokeStyle = 'rgba(255,255,255,.32)'; c.lineWidth = 8; for (let i = -1; i < 6; i++) { c.beginPath(); c.moveTo(i * 230, 0); c.quadraticCurveTo(i * 230 + 80, 400, i * 230 - 30, h); c.stroke(); } noise(c, w, h, 7);
  c.strokeStyle = 'rgba(127,119,104,.13)'; c.lineWidth = 2; c.strokeRect(1, 1, w - 2, h - 2);
  }, [10, 10]);
  const wood = texture(THREE, 512, 1024, (c, w, h) => {
    c.fillStyle = '#9b7652'; c.fillRect(0, 0, w, h); for (let x = 0; x < w; x += 7) { c.strokeStyle = x % 21 ? 'rgba(62,39,24,.18)' : 'rgba(235,192,137,.17)'; c.lineWidth = x % 21 ? 1 : 2; c.beginPath(); c.moveTo(x, 0); c.bezierCurveTo(x + 10, 260, x - 8, 620, x + 5, h); c.stroke(); } noise(c, w, h, 9);
  }, [3, 1]);
  const carpet = texture(THREE, 512, 512, (c, w, h) => {
    c.fillStyle = '#a9a69b'; c.fillRect(0, 0, w, h); c.strokeStyle = 'rgba(255,255,255,.12)'; c.lineWidth = 1; for (let y = 0; y < h; y += 4) { c.beginPath(); c.moveTo(0, y); c.lineTo(w, y + 8); c.stroke(); } noise(c, w, h, 18);
  }, [8, 8]);
  const stone = texture(THREE, 768, 512, (c, w, h) => {
    c.fillStyle = '#313a3a'; c.fillRect(0, 0, w, h); c.strokeStyle = 'rgba(150,165,157,.16)'; c.lineWidth = 2; for (let i = -h; i < w; i += 90) { c.beginPath(); c.moveTo(i, 0); c.lineTo(i + h, h); c.stroke(); } noise(c, w, h, 12);
  }, [5, 5]);
  const screen = texture(THREE, 1024, 512, (c, w, h) => {
    const g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#153e5b'); g.addColorStop(1, '#071d30'); c.fillStyle = g; c.fillRect(0, 0, w, h); c.strokeStyle = 'rgba(83,191,220,.3)'; c.lineWidth = 2; for (let x = 40; x < w; x += 80) { c.beginPath(); c.moveTo(x, 40); c.lineTo(x, h - 34); c.stroke(); } for (let y = 55; y < h; y += 65) { c.beginPath(); c.moveTo(30, y); c.lineTo(w - 30, y); c.stroke(); } c.strokeStyle = '#4dd4df'; c.lineWidth = 7; c.beginPath(); c.moveTo(50, 370); c.bezierCurveTo(180, 230, 260, 340, 390, 180); c.bezierCurveTo(520, 45, 650, 220, 760, 120); c.bezierCurveTo(850, 45, 930, 130, 980, 75); c.stroke(); c.fillStyle = '#b4f4e4'; c.font = '600 25px system-ui'; c.fillText('CAMPUS LIVE', 38, 42);
  }, [1, 1]); screen.wrapS = screen.wrapT = THREE.ClampToEdgeWrapping;
  const wallArt = texture(THREE, 768, 512, (c, w, h) => {
    c.fillStyle = '#ebe2cf'; c.fillRect(0, 0, w, h);
    c.fillStyle = '#a0aca0'; c.beginPath(); c.arc(265, 230, 165, Math.PI, 0); c.lineTo(430, h); c.lineTo(100, h); c.fill();
    c.fillStyle = '#b38963'; c.beginPath(); c.arc(550, 350, 150, Math.PI, 0); c.lineTo(700, h); c.lineTo(400, h); c.fill();
    c.fillStyle = '#d0ae73'; c.beginPath(); c.arc(565, 120, 58, 0, Math.PI * 2); c.fill();
    c.strokeStyle = '#faf6e9'; c.lineWidth = 3; for (let i = 0; i < 7; i++) { c.beginPath(); c.moveTo(120 + i * 23, h); c.bezierCurveTo(250 + i * 17, 310, 60 + i * 30, 120, 330 + i * 26, 20); c.stroke(); } noise(c, w, h, 8);
  }); wallArt.wrapS = wallArt.wrapT = THREE.ClampToEdgeWrapping;
  const brand = texture(THREE, 768, 288, (c, w, h) => { c.fillStyle = '#263334'; c.fillRect(0, 0, w, h); c.strokeStyle = '#d7b36b'; c.lineWidth = 5; c.beginPath(); c.moveTo(360, 36); c.lineTo(360, 104); c.moveTo(408, 36); c.lineTo(408, 104); c.moveTo(360, 69); c.lineTo(408, 69); c.stroke();c.save();c.translate(384,70);c.rotate(Math.PI/4);c.strokeRect(-43,-43,86,86);c.restore(); c.fillStyle = '#e7c989';c.textAlign='center'; c.font = '500 46px Georgia'; c.fillText('SOFTKLINIK HARMES', w/2, 183);c.fillStyle='#c4b391';c.font='500 19px system-ui';c.fillText('KANTOR AI  /  RUANG KOLABORASI',w/2,227); }, [1, 1]); brand.wrapS = brand.wrapT = THREE.ClampToEdgeWrapping;
  const glow = texture(THREE, 256, 256, (c, w, h) => { const g = c.createRadialGradient(128, 128, 5, 128, 128, 128); g.addColorStop(0, 'rgba(255,231,164,.95)'); g.addColorStop(.35, 'rgba(255,194,96,.35)'); g.addColorStop(1, 'rgba(255,160,52,0)'); c.fillStyle = g; c.fillRect(0, 0, w, h); }, [1, 1]); glow.wrapS = glow.wrapT = THREE.ClampToEdgeWrapping;
  return { marble, wood, carpet, stone, screen, wallArt, brand, glow };
}
