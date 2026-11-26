// The cockpit overlay: every instrument is drawn on a 2D canvas above the
// 3D view — airspeed, altitude, heading, attitude, throttle, fuel, damage,
// the ring count and the mission text. Nothing here is an image file.

export function createHud(canvas) {
  const ctx = canvas.getContext('2d');
  return { canvas, ctx };
}

function panel(ctx, x, y, w, h) {
  ctx.fillStyle = 'rgba(8, 14, 24, 0.62)';
  ctx.strokeStyle = 'rgba(140, 200, 255, 0.55)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 10);
  ctx.fill();
  ctx.stroke();
}

function bar(ctx, x, y, w, h, frac, color, bg) {
  ctx.fillStyle = bg || 'rgba(255,255,255,0.18)';
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w * Math.max(0, Math.min(1, frac)), h);
}

function text(ctx, str, x, y, size, color, align, weight) {
  ctx.font = `${weight || 600} ${size}px "Segoe UI", system-ui, sans-serif`;
  ctx.fillStyle = color || '#eaf4ff';
  ctx.textAlign = align || 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(str, x, y);
}

// Compass tape: a scrolling strip of headings with N/E/S/W marks.
function drawCompass(ctx, w, headingDeg) {
  const cy = 66;
  const cx = w / 2;
  ctx.save();
  ctx.beginPath();
  ctx.rect(cx - 190, cy - 20, 380, 40);
  ctx.clip();
  for (let d = -180; d <= 180; d += 5) {
    const rel = ((d - headingDeg + 540) % 360) - 180;
    const x = cx + rel * 3.2;
    if (x < cx - 200 || x > cx + 200) continue;
    const major = d % 30 === 0;
    ctx.strokeStyle = major ? '#eaf4ff' : 'rgba(234,244,255,0.45)';
    ctx.lineWidth = major ? 2 : 1;
    ctx.beginPath();
    ctx.moveTo(x, cy + 6);
    ctx.lineTo(x, cy + (major ? 18 : 12));
    ctx.stroke();
    if (major) {
      const deg = ((d % 360) + 360) % 360;
      const label = deg === 0 ? 'N' : deg === 90 ? 'E' : deg === 180 ? 'S' : deg === 270 ? 'W' : String(deg);
      text(ctx, label, x, cy - 10, 13, '#cfe6ff', 'center');
    }
  }
  ctx.restore();
  ctx.fillStyle = '#ffd34d';
  ctx.beginPath();
  ctx.moveTo(cx, cy + 22);
  ctx.lineTo(cx - 7, cy + 12);
  ctx.lineTo(cx + 7, cy + 12);
  ctx.closePath();
  ctx.fill();
  text(ctx, `${String(Math.round(headingDeg) % 360).padStart(3, '0')}°`, cx, cy + 34, 15, '#ffd34d', 'center', 700);
}

// Artificial horizon: a circle split sky/ground, rotated by bank, shifted
// by pitch, with a fixed aircraft symbol in the middle.
function drawAttitude(ctx, cx, cy, r, pitch, roll) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.clip();
  ctx.translate(cx, cy);
  ctx.rotate(-roll);
  const pitchPx = pitch * r * 1.6;
  ctx.fillStyle = '#3f7fc4';
  ctx.fillRect(-r, -r - pitchPx, r * 2, r + pitchPx);
  ctx.fillStyle = '#7a5a34';
  ctx.fillRect(-r, -pitchPx, r * 2, r + pitchPx);
  ctx.strokeStyle = 'rgba(255,255,255,0.85)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-r, -pitchPx);
  ctx.lineTo(r, -pitchPx);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.5)';
  ctx.lineWidth = 1;
  for (const dp of [-0.35, -0.18, 0.18, 0.35]) {
    const y = -pitchPx - dp * r * 1.6;
    ctx.beginPath();
    ctx.moveTo(-r * 0.45, y);
    ctx.lineTo(r * 0.45, y);
    ctx.stroke();
  }
  ctx.restore();
  ctx.strokeStyle = 'rgba(140,200,255,0.7)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.stroke();
  // Fixed aircraft symbol.
  ctx.strokeStyle = '#ffd34d';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(cx - 16, cy);
  ctx.lineTo(cx + 16, cy);
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx, cy + 7);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, cy, 3, 0, Math.PI * 2);
  ctx.fillStyle = '#ffd34d';
  ctx.fill();
}

export function drawHud(hud, view) {
  const { ctx, canvas } = hud;
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  const s = view.flight;
  const kmh = Math.round(s.speed * 3.6);
  const altAgl = Math.max(0, Math.round(s.y - view.groundBelow));
  const altMsl = Math.round(s.y);
  const vs = Math.round(s.vy * 10) / 10;

  // --- Top-left: mission ---------------------------------------------------
  panel(ctx, 16, 14, 330, 86);
  text(ctx, 'SKYLARK AIR MAIL  ·  RIDGE RUN', 30, 32, 14, '#9fd0ff', 'left', 700);
  text(ctx, view.objective, 30, 56, 16, '#eaf4ff', 'left', 600);
  text(ctx, `RINGS  ${view.ringsPassed} / ${view.ringsTotal}      SCORE  ${view.score}`, 30, 80, 15, '#ffd34d', 'left', 700);

  // --- Top-right: time and fuel --------------------------------------------
  panel(ctx, w - 246, 14, 230, 86);
  const mm = String(Math.floor(view.elapsed / 60)).padStart(2, '0');
  const ss = String(Math.floor(view.elapsed % 60)).padStart(2, '0');
  text(ctx, `TIME  ${mm}:${ss}`, w - 232, 32, 15, '#eaf4ff', 'left', 700);
  text(ctx, 'FUEL', w - 232, 56, 13, '#9fd0ff', 'left', 700);
  bar(ctx, w - 180, 48, 150, 14, s.fuel / 100, s.fuel > 25 ? '#37c978' : '#ff5040');
  text(ctx, `${Math.round(s.fuel)}%`, w - 26, 56, 13, '#eaf4ff', 'right', 700);
  text(ctx, 'DAMAGE', w - 232, 80, 13, '#9fd0ff', 'left', 700);
  bar(ctx, w - 180, 72, 150, 14, s.damage / 100, '#ff9040');
  text(ctx, `${Math.round(s.damage)}%`, w - 26, 80, 13, '#eaf4ff', 'right', 700);

  // --- Compass ---------------------------------------------------------------
  drawCompass(ctx, w, view.headingDeg);

  // --- Bottom-left: airspeed --------------------------------------------------
  panel(ctx, 16, h - 108, 150, 92);
  text(ctx, 'AIRSPEED', 30, h - 88, 12, '#9fd0ff', 'left', 700);
  text(ctx, String(kmh), 30, h - 54, 34, '#eaf4ff', 'left', 700);
  text(ctx, 'km/h', 118, h - 44, 14, '#9fd0ff', 'left');
  if (s.airborne && s.speed < 26) {
    text(ctx, 'STALL!', 30, h - 26, 15, '#ff5040', 'left', 800);
  }

  // --- Bottom-right: altitude ---------------------------------------------------
  panel(ctx, w - 186, h - 108, 170, 92);
  text(ctx, 'ALTITUDE  AGL', w - 172, h - 88, 12, '#9fd0ff', 'left', 700);
  text(ctx, `${altAgl} m`, w - 172, h - 54, 30, '#eaf4ff', 'left', 700);
  text(ctx, `MSL ${altMsl} m   V/S ${vs >= 0 ? '+' : ''}${vs} m/s`, w - 172, h - 26, 13, '#cfe6ff', 'left');

  // --- Bottom-centre: attitude + throttle ----------------------------------------
  drawAttitude(ctx, w / 2, h - 66, 52, s.pitch, s.roll);
  text(ctx, 'THR', w / 2 + 78, h - 82, 12, '#9fd0ff', 'left', 700);
  bar(ctx, w / 2 + 78, h - 72, 110, 12, s.throttle, '#57b6ff');
  text(ctx, `${Math.round(s.throttle * 100)}%`, w / 2 + 192, h - 65, 12, '#eaf4ff', 'left', 700);

  // --- Next-ring pointer ----------------------------------------------------------
  if (view.nextRing) {
    const a = view.nextRing.angle; // -PI..PI, 0 = straight ahead
    const dist = Math.round(view.nextRing.distance);
    const cx = w / 2;
    const cy = h / 2 - 130;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(Math.max(-1.2, Math.min(1.2, a)));
    ctx.fillStyle = '#ffb020';
    ctx.beginPath();
    ctx.moveTo(0, -34);
    ctx.lineTo(16, 6);
    ctx.lineTo(-16, 6);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    text(ctx, `NEXT RING  ${dist} m`, cx, cy + 30, 15, '#ffb020', 'center', 700);
  }

  // --- Centre flash message: small, high, clear of the ring pointer -----------
  if (view.flash) {
    ctx.font = '800 34px "Segoe UI", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(8,14,24,0.55)';
    const tw = ctx.measureText(view.flash).width;
    ctx.fillRect(w / 2 - tw / 2 - 20, h / 2 - 218, tw + 40, 52);
    ctx.fillStyle = view.flashColor || '#ffd34d';
    ctx.fillText(view.flash, w / 2, h / 2 - 192);
  }

  // --- Big end screens ----------------------------------------------------------------
  if (view.screen) {
    ctx.fillStyle = 'rgba(6, 10, 18, 0.66)';
    ctx.fillRect(0, 0, w, h);
    text(ctx, view.screen.title, w / 2, h / 2 - 90, 52, view.screen.color || '#ffd34d', 'center', 800);
    for (let i = 0; i < view.screen.lines.length; i += 1) {
      text(ctx, view.screen.lines[i], w / 2, h / 2 - 20 + i * 34, 20, '#eaf4ff', 'center', 600);
    }
    text(ctx, view.screen.hint, w / 2, h / 2 + 120, 17, '#9fd0ff', 'center', 600);
  }
}
