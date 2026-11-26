// Skylark Ridge Run — bootstrap: renderer, sky, camera, input and the game
// loop. The game itself lives in game.js, physics.js, terrain.js, rings.js
// and hud.js; this file only wires them to the browser.
//
// Screenshot mode: ?shot=takeoff|play|rings|land runs the simulation a
// fixed number of fixed steps from the fixed seed, renders one frame and
// sets window.__shotReady. The same shot always makes the same picture.

import { createGame, startFlight, updateGame, hudView, setupShot } from './game.js';
import { DT, initialFlightState } from './physics.js';
import { buildTerrain, groundHeight, RUNWAY_HOME } from './terrain.js';
import { buildAircraft, spinPropeller } from './aircraft.js';
import { buildRings, paintRings, ringCourse } from './rings.js';
import { createHud, drawHud } from './hud.js';
import { createAudio } from './audio.js';

const THREE = window.THREE;
const params = new URLSearchParams(window.location.search);
const shotName = params.get('shot');
const SHOT_MODE = shotName !== null;

const gameCanvas = document.getElementById('game');
const hudCanvas = document.getElementById('hud');
const hud = createHud(hudCanvas);
const audio = createAudio();
const game = createGame();

const renderer = new THREE.WebGLRenderer({ canvas: gameCanvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xc4d9ec, 500, 3400);

const camera = new THREE.PerspectiveCamera(62, 1, 0.5, 6000);

// --- Sky dome: a gradient sphere, vertex colours, never fogged -------------
function buildSky() {
  const geo = new THREE.SphereGeometry(4200, 24, 16);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const top = [0.16, 0.42, 0.72];
  const horizon = [0.78, 0.87, 0.95];
  const below = [0.55, 0.6, 0.6];
  for (let i = 0; i < pos.count; i += 1) {
    const t = Math.max(-1, Math.min(1, pos.getY(i) / 4200));
    const c = t > 0
      ? top.map((v, k) => v + (horizon[k] - v) * (1 - t))
      : horizon.map((v, k) => v + (below[k] - v) * -t);
    colors[i * 3] = c[0];
    colors[i * 3 + 1] = c[1];
    colors[i * 3 + 2] = c[2];
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const sky = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false }));
  return sky;
}
scene.add(buildSky());

// Sun disc, fixed in the sky toward the south-west.
const sunDisc = new THREE.Mesh(
  new THREE.CircleGeometry(90, 32),
  new THREE.MeshBasicMaterial({ color: 0xfff3c4, fog: false }),
);
sunDisc.position.set(-1600, 1500, 2600);
sunDisc.lookAt(0, 0, 0);
scene.add(sunDisc);

// --- Lights ------------------------------------------------------------------
const hemi = new THREE.HemisphereLight(0xbfd9ff, 0x55663f, 0.85);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff2d8, 1.7);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -180;
sun.shadow.camera.right = 180;
sun.shadow.camera.top = 180;
sun.shadow.camera.bottom = -180;
sun.shadow.camera.near = 50;
sun.shadow.camera.far = 1600;
sun.shadow.bias = -0.0004;
scene.add(sun);
scene.add(sun.target);

// --- World -------------------------------------------------------------------
const terrain = buildTerrain(THREE);
scene.add(terrain.group);
const rings = buildRings(THREE, ringCourse());
scene.add(rings.group);
const plane = buildAircraft(THREE);
scene.add(plane);

function resize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  hudCanvas.width = Math.round(w * dpr);
  hudCanvas.height = Math.round(h * dpr);
  hudCanvas.style.width = `${w}px`;
  hudCanvas.style.height = `${h}px`;
  hud.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  hud.canvas.width = w;
  hud.canvas.height = h;
}
window.addEventListener('resize', resize);
resize();

// --- Input -------------------------------------------------------------------
const keys = {};
const input = { pitch: 0, roll: 0, throttle: 0 };
let mouseSteer = { x: 0, y: 0, active: false };

window.addEventListener('keydown', (e) => {
  keys[e.code] = true;
  audio.start();
  if (e.code === 'Enter' && game.mode === 'menu') startFlight(game);
  if (e.code === 'KeyR' && (game.mode === 'landed' || game.mode === 'crashed')) startFlight(game);
  if (e.code === 'KeyM') audio.toggleMute();
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
});
window.addEventListener('keyup', (e) => {
  keys[e.code] = false;
});
window.addEventListener('mousedown', () => {
  audio.start();
  if (game.mode === 'menu') startFlight(game);
});
window.addEventListener('mousemove', (e) => {
  mouseSteer.x = (e.clientX / window.innerWidth) * 2 - 1;
  mouseSteer.y = (e.clientY / window.innerHeight) * 2 - 1;
  mouseSteer.active = true;
});

function readInput() {
  let pitch = 0;
  let roll = 0;
  let throttle = 0;
  if (keys.ArrowUp || keys.KeyW) throttle += 1;
  if (keys.ArrowDown || keys.KeyS) throttle -= 1;
  if (keys.KeyI || keys.Numpad8) pitch += 1;
  if (keys.KeyK || keys.Numpad2) pitch -= 1;
  if (keys.ArrowLeft || keys.KeyA) roll -= 1;
  if (keys.ArrowRight || keys.KeyD) roll += 1;
  // Mouse: hold the pointer off-centre to steer, like a stick.
  if (mouseSteer.active && game.mode === 'flying') {
    roll += Math.max(-1, Math.min(1, mouseSteer.x * 1.2));
    pitch += Math.max(-1, Math.min(1, -mouseSteer.y * 0.9));
  }
  input.pitch = Math.max(-1, Math.min(1, pitch));
  input.roll = Math.max(-1, Math.min(1, roll));
  input.throttle = Math.max(-1, Math.min(1, throttle));
  return input;
}

// --- Camera ------------------------------------------------------------------
const camPos = new THREE.Vector3(0, 80, 320);
const camTarget = new THREE.Vector3(0, 60, 0);

function updateCamera(dt) {
  const s = game.flight;
  if (game.mode === 'menu') {
    const a = game.time * 0.12;
    const cx = s.x + Math.sin(a) * 26;
    const cz = s.z + Math.cos(a) * 26;
    camPos.lerp(new THREE.Vector3(cx, s.y + 7, cz), Math.min(1, dt * 2));
    camTarget.lerp(new THREE.Vector3(s.x, s.y + 1, s.z - 6), Math.min(1, dt * 3));
  } else {
    const fx = Math.sin(s.heading);
    const fz = -Math.cos(s.heading);
    const desired = new THREE.Vector3(
      s.x - fx * 15,
      s.y + 4.6 + s.pitch * 3,
      s.z - fz * 15,
    );
    const ground = groundHeight(desired.x, desired.z) + 2.2;
    if (desired.y < ground) desired.y = ground;
    camPos.lerp(desired, Math.min(1, dt * 5));
    camTarget.lerp(new THREE.Vector3(s.x + fx * 26, s.y + 0.5 + s.pitch * 8, s.z + fz * 26), Math.min(1, dt * 7));
  }
  camera.position.copy(camPos);
  camera.lookAt(camTarget);
}

// --- Frame -------------------------------------------------------------------
function renderFrame() {
  const s = game.flight;
  plane.position.set(s.x, s.y, s.z);
  plane.rotation.order = 'YXZ';
  plane.rotation.y = -s.heading;
  plane.rotation.x = s.pitch;
  plane.rotation.z = -s.roll;
  spinPropeller(plane, s.throttle, DT);
  paintRings(rings.meshes, game.ringsPassed);
  // Clouds drift with sim time only, so a shot is reproducible.
  for (const cloud of terrain.clouds) {
    cloud.position.x = cloud.userData.baseX + game.time * 1.5;
    if (cloud.position.x > 1900) cloud.position.x -= 3800;
  }
  // The sun's shadow frustum follows the plane.
  sun.position.set(s.x + 320, s.y + 520, s.z + 260);
  sun.target.position.set(s.x, s.y, s.z);
  sun.target.updateMatrixWorld();
  renderer.render(scene, camera);
  drawHud(hud, hudView(game));
  if (game.mode === 'menu') drawMenu();
}

function drawMenu() {
  const ctx = hud.ctx;
  const w = hud.canvas.width;
  const h = hud.canvas.height;
  ctx.fillStyle = 'rgba(6, 10, 18, 0.45)';
  ctx.fillRect(0, 0, w, h);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#ffd34d';
  ctx.font = '800 64px "Segoe UI", system-ui, sans-serif';
  ctx.fillText('SKYLARK RIDGE RUN', w / 2, h / 2 - 120);
  ctx.fillStyle = '#eaf4ff';
  ctx.font = '600 24px "Segoe UI", system-ui, sans-serif';
  ctx.fillText('Alpine air mail in the Kestrel K-9 — eight rings, one valley, one strip to land on', w / 2, h / 2 - 62);
  ctx.font = '600 19px "Segoe UI", system-ui, sans-serif';
  ctx.fillStyle = '#cfe6ff';
  const lines = [
    'W / S or ↑ / ↓ — throttle      A / D or ← / → — bank and turn',
    'I / K — pull up / push down      mouse — steer like a stick',
    'Fly all 8 gold rings, then land on the Ridge Top strip. Watch the fuel.',
  ];
  lines.forEach((line, i) => ctx.fillText(line, w / 2, h / 2 + 10 + i * 32));
  ctx.fillStyle = '#ffd34d';
  ctx.font = '700 22px "Segoe UI", system-ui, sans-serif';
  ctx.fillText('Press ENTER or click to fly', w / 2, h / 2 + 130);
}

window.addEventListener('error', (e) => {
  window.__pageError = String(e.message || e.error);
});

// --- Run ---------------------------------------------------------------------
if (SHOT_MODE) {
  // Deterministic screenshot: fixed steps, one frame, then stop.
  const shot = setupShot(game, shotName);
  const prev = { x: game.flight.x, y: game.flight.y, z: game.flight.z };
  for (let i = 0; i < shot.steps; i += 1) {
    const inp = shot.input(i * DT);
    updateGame(game, inp, null);
    prev.x = game.flight.x;
    prev.y = game.flight.y;
    prev.z = game.flight.z;
  }
  updateCamera(10); // snap the camera into place
  renderFrame();
  window.__shotReady = true;
  window.__shotState = {
    shot: shotName,
    steps: shot.steps,
    mode: game.mode,
    rings: game.ringsPassed,
    score: game.score,
    pos: { x: game.flight.x, y: game.flight.y, z: game.flight.z },
    speed: game.flight.speed,
    fuel: game.flight.fuel,
  };
} else {
  let last = performance.now();
  let acc = 0;
  function loop(now) {
    requestAnimationFrame(loop);
    const frameDt = Math.min(0.1, (now - last) / 1000);
    last = now;
    if (game.mode === 'flying') {
      acc += frameDt;
      while (acc >= DT) {
        updateGame(game, readInput(), audio);
        acc -= DT;
      }
      audio.update(game.flight.throttle, game.flight.speed);
    } else {
      game.time += frameDt;
      acc = 0;
    }
    updateCamera(frameDt);
    renderFrame();
  }
  requestAnimationFrame(loop);
}
