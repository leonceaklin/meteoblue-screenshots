// meteoblue map → B/W PNG, no text labels, no UI overlays.
// Paste into the DevTools console on any meteoblue map/widget page (e.g. cityclimate widget) and press Enter.
// Asks for width x height, captures whatever the map currently shows; downloads meteoblue-bw-<timestamp>.png.
(async () => {
  // Grab the mapbox Map instance by catching `this` in any prototype call during a forced repaint.
  const map = window.__map || await new Promise((resolve, reject) => {
    const P = mapboxgl.Map.prototype;
    const names = Object.getOwnPropertyNames(P).filter(n => { try { return n !== 'constructor' && typeof P[n] === 'function'; } catch { return false; } });
    const origs = {};
    const restore = () => names.forEach(n => (P[n] = origs[n]));
    names.forEach(n => {
      origs[n] = P[n];
      P[n] = function (...a) { restore(); resolve(this); return origs[n].apply(this, a); };
    });
    const c = document.querySelector('.mapboxgl-canvas');
    c.dispatchEvent(new MouseEvent('mousemove', { clientX: 10, clientY: 10, bubbles: true }));
    setTimeout(() => { restore(); reject(new Error('Map instance not found')); }, 5000);
  });
  window.__map = map;

  // Hide all text/icon layers.
  map.getStyle().layers.filter(l => l.type === 'symbol')
    .forEach(l => map.setLayoutProperty(l.id, 'visibility', 'none'));
  await new Promise(r => { map.once('idle', r); map.triggerRepaint(); setTimeout(r, 3000); });

  // Ask for output size; resize the map container so the map actually renders that area (not just scaled).
  const src = map.getCanvas();
  const answer = prompt('Screenshot size in pixels (width x height):', `${src.width}x${src.height}`);
  if (answer === null) return console.log('Cancelled');
  const [W, H] = answer.split(/\s*[x×, ]\s*/).map(Number);
  if (!(W > 0 && H > 0)) return console.error(`Invalid size: "${answer}"`);
  const container = map.getContainer();
  const oldCss = container.style.cssText;
  const dpr = window.devicePixelRatio || 1;
  container.style.cssText += `;position:fixed;left:0;top:0;width:${W / dpr}px;height:${H / dpr}px`;
  map.resize();
  // The wind particle layer only rebuilds its buffers on window resize, and needs a second one once the canvas has settled.
  window.dispatchEvent(new Event('resize'));
  await new Promise(r => setTimeout(r, 1500));
  window.dispatchEvent(new Event('resize'));
  await new Promise(r => { map.once('idle', r); setTimeout(r, 5000); });

  // Read the composited canvas via captureStream (includes the custom particle layer drawn outside mapbox's render event).
  // Played through a <video> element (works in Chrome and Firefox). Let it run a while so animated layers (wind particles)
  // rebuild after the resize, then take the next fresh frame.
  // No triggerRepaint() here: forced repaints make the particle layer re-take its plain-map background instead of drawing particles.
  const stream = src.captureStream(30);
  const video = document.createElement('video');
  video.muted = true; video.srcObject = stream; await video.play();
  await new Promise(r => setTimeout(r, 2500));
  if (video.requestVideoFrameCallback) await new Promise(r => { video.requestVideoFrameCallback(r); setTimeout(r, 1000); });

  const out = document.createElement('canvas');
  out.width = W; out.height = H;
  const ctx = out.getContext('2d');
  ctx.filter = 'grayscale(1)';
  ctx.drawImage(video, 0, 0, W, H);
  stream.getTracks().forEach(t => t.stop());
  container.style.cssText = oldCss;
  map.resize();
  window.dispatchEvent(new Event('resize'));
  setTimeout(() => window.dispatchEvent(new Event('resize')), 1500);

  const blob = await new Promise(r => out.toBlob(r, 'image/png'));
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `meteoblue-bw-${new Date().toISOString().replace(/[:.]/g, '-')}.png`;
  document.body.appendChild(a); a.click(); a.remove();
  console.log(`Saved ${a.download} (${out.width}x${out.height})`);
})();
