// Game state for Skylark Ridge Run: the mission, the score, the messages,
// and the autopilot that flies the scripted screenshot runs. The flight
// model lives in physics.js, the course in rings.js; this file is the glue.

import { DT, initialFlightState, stepFlight, headingDegrees } from './physics.js';
import { ringCourse, checkRingPass } from './rings.js';
import { RUNWAY_HOME, RUNWAY_FAR, groundHeight, valleyCenterX } from './terrain.js';

export function createGame() {
  const course = ringCourse();
  return {
    mode: 'menu', // menu | flying | landed | crashed
    flight: initialFlightState(RUNWAY_HOME),
    course,
    ringsPassed: 0,
    score: 0,
    elapsed: 0,
    flash: null,
    flashUntil: 0,
    time: 0, // sim time in seconds, the only clock the game knows
    events: [],
  };
}

export function startFlight(game) {
  game.mode = 'flying';
  game.flight = initialFlightState(RUNWAY_HOME);
  game.course = ringCourse();
  game.ringsPassed = 0;
  game.score = 0;
  game.elapsed = 0;
  game.flash = 'TAKE OFF — FULL THROTTLE, PULL UP AT 110 KM/H';
  game.flashUntil = 6;
  game.events = [];
}

function onRunway(x, z) {
  for (const r of [RUNWAY_HOME, RUNWAY_FAR]) {
    const dx = Math.abs(x - r.x);
    const dz = Math.abs(z - r.z);
    if (dx < r.width / 2 + 4 && dz < r.length / 2 + 4) return r;
  }
  return null;
}

export function isOnRunway(x, z) {
  return onRunway(x, z) !== null;
}

export function landingScore(game) {
  const s = game.flight;
  const timeBonus = Math.max(0, Math.round((300 - game.elapsed) * 2));
  const fuelBonus = Math.round(s.fuel) * 3;
  const landingBonus = Math.round(500 * (1 - s.damage / 100));
  return game.score + landingBonus + fuelBonus + timeBonus;
}

// One fixed step of the game. Input is { pitch, roll, throttle }.
export function updateGame(game, input, audio) {
  if (game.mode !== 'flying') return;
  const s = game.flight;
  const prev = { x: s.x, y: s.y, z: s.z };
  const event = stepFlight(s, input, DT, groundHeight, isOnRunway);
  game.time += DT;
  game.elapsed += DT;

  if (event === 'takeoff') {
    game.flash = 'AIRBORNE — GEAR UP, FLY THE RINGS';
    game.flashUntil = game.time + 4;
    game.events.push('takeoff');
  } else if (event === 'landed') {
    const strip = onRunway(s.x, s.z);
    if (strip === RUNWAY_FAR && game.ringsPassed >= game.course.length) {
      game.mode = 'landed';
      game.score = landingScore(game);
      game.events.push('landed');
      if (audio) audio.thud();
    } else if (strip === RUNWAY_FAR) {
      // Landed early at the far strip: a safe landing, but the mail is late.
      game.mode = 'landed';
      game.score = game.score + Math.round(200 * (1 - s.damage / 100));
      game.events.push('landed-early');
      if (audio) audio.thud();
    } else {
      // Back on the home strip: the sortie is over, wheels down.
      game.mode = 'landed';
      game.score = game.score + Math.round(100 * (1 - s.damage / 100));
      game.events.push('landed-home');
      if (audio) audio.thud();
    }
  } else if (event === 'rough') {
    game.flash = `ROUGH LANDING — DAMAGE ${Math.round(s.damage)}%`;
    game.flashUntil = game.time + 4;
    game.events.push('rough');
    if (audio) audio.thud();
  } else if (event === 'crashed') {
    game.mode = 'crashed';
    game.events.push('crashed');
    if (audio) audio.thud();
  }

  // Ring passes: only the next ring in the course counts.
  const passed = checkRingPass(game.course, game.ringsPassed, prev, s);
  if (passed >= 0) {
    game.course[passed].passed = true;
    game.ringsPassed += 1;
    game.score += 100;
    s.fuel = Math.min(100, s.fuel + 4);
    game.flash = `RING ${game.ringsPassed} / ${game.course.length}  +100`;
    game.flashUntil = game.time + 2.5;
    game.events.push(`ring-${passed + 1}`);
    if (audio) audio.chime();
  }

  if (s.fuel <= 0 && !game.events.includes('fuel-empty')) {
    game.flash = 'FUEL EMPTY — GLIDING, FIND A STRIP';
    game.flashUntil = game.time + 5;
    game.events.push('fuel-empty');
  }
  if (game.time > game.flashUntil) game.flash = null;
}

export function objectiveText(game) {
  if (game.mode === 'menu') return 'Take off, fly 8 rings, land at Ridge Top';
  if (game.ringsPassed >= game.course.length) return 'All rings flown — land at Ridge Top';
  return `Fly ring ${game.ringsPassed + 1} of ${game.course.length}`;
}

export function endScreen(game) {
  if (game.mode === 'landed') {
    const complete = game.ringsPassed >= game.course.length;
    return {
      title: complete ? 'MISSION COMPLETE' : 'LANDED',
      color: '#7be495',
      lines: [
        `Rings flown  ${game.ringsPassed} / ${game.course.length}`,
        `Score  ${game.score}`,
        `Time  ${Math.floor(game.elapsed / 60)}:${String(Math.floor(game.elapsed % 60)).padStart(2, '0')}   Fuel left  ${Math.round(game.flight.fuel)}%   Damage  ${Math.round(game.flight.damage)}%`,
      ],
      hint: 'Press R to fly again — the valley never changes, the flying does',
    };
  }
  if (game.mode === 'crashed') {
    return {
      title: 'CRASHED',
      color: '#ff6a55',
      lines: [
        `Rings flown  ${game.ringsPassed} / ${game.course.length}`,
        `Score  ${game.score}`,
        'The Kestrel is a write-off, but the mail must go through.',
      ],
      hint: 'Press R to fly again',
    };
  }
  return null;
}

// --- Scripted flying: the autopilot behind the screenshots ----------------
// A pure function of the game state. It follows the valley centreline with
// a lookahead point — the rings sit on that line, so a plane tracking it
// threads them — blends its height toward the next ring's height as it
// closes in, and eases the throttle off inside 450 m of a ring so the turn
// onto it stays makeable. The same seed and the same step count always
// produce the same frame. Note: throttle here is a delta, like a held key.
export function autopilotInput(game) {
  const s = game.flight;
  const ring = game.course[Math.min(game.ringsPassed, game.course.length - 1)];
  const dxRing = ring.x - s.x;
  const dzRing = ring.z - s.z;
  const distToRing = Math.sqrt(dxRing * dxRing + dzRing * dzRing);

  // Lookahead point 160 m ahead on the valley centreline.
  const aheadZ = s.z - 160;
  const aheadX = valleyCenterX(aheadZ);
  const valleyAlt = Math.max(125, groundHeight(aheadX, aheadZ) + 95);
  // Blend height toward the ring's height while closing in.
  const blend = Math.max(0, Math.min(1, 1 - distToRing / 600));
  const targetAlt = valleyAlt * (1 - blend) + ring.y * blend;

  const desiredHeading = Math.atan2(aheadX - s.x, -(aheadZ - s.z));
  let diff = desiredHeading - s.heading;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  const roll = Math.max(-0.95, Math.min(0.95, diff * 1.8));
  const altError = targetAlt - s.y;
  let pitch = Math.max(-0.5, Math.min(0.5, altError * 0.012 + 0.05));
  if (s.speed < 34) pitch = Math.min(pitch, 0.15); // never climb steeply while slow
  const targetThrottle = distToRing < 450 ? 0.55 : 0.75;
  const throttle = Math.max(-1, Math.min(1, (targetThrottle - s.throttle) * 3));
  return { pitch, roll, throttle };
}

// Set the game up for one named screenshot, then return how many fixed
// steps to run before taking it. The plane always starts on a legal state.
export function setupShot(game, name) {
  startFlight(game);
  // The take-off banner belongs to a real take-off: scripted mid-flight
  // shots start clean, with no stale message across the frame.
  if (name !== 'takeoff') {
    game.flash = null;
    game.flashUntil = 0;
  }
  const s = game.flight;
  if (name === 'takeoff') {
    // Rolling down the home runway, nose just lifting.
    return { steps: 150, input: (t) => ({ pitch: t > 1.6 ? 0.6 : 0.15, roll: 0, throttle: 1 }) };
  }
  if (name === 'rings') {
    // 150 m out from ring 1, lined up on the valley's approach line, then
    // fly straight through it.
    const ring = game.course[0];
    s.x = valleyCenterX(ring.z + 150);
    s.z = ring.z + 150;
    s.y = ring.y;
    s.heading = ring.heading;
    s.speed = 58;
    s.throttle = 0.75;
    s.airborne = true;
    return { steps: 100, input: () => ({ pitch: 0.05, roll: 0, throttle: 0 }) };
  }
  if (name === 'land') {
    // Final approach to the Ridge Top strip, lined up on the centreline,
    // gear down, throttle held for a gentle descent onto the threshold.
    // The rings are already flown (score 800), so the HUD reads as the
    // end of the mission, not the start of it.
    game.ringsPassed = game.course.length;
    game.course.forEach((ring) => { ring.passed = true; });
    game.score = 800;
    const r = RUNWAY_FAR;
    s.x = r.x + 6;
    s.z = r.z + 310;
    s.y = r.elevation + 58;
    s.heading = 0.02;
    s.speed = 44;
    s.throttle = 0.45;
    s.airborne = true;
    return {
      steps: 200,
      input: () => {
        const dx = r.x - s.x;
        const dz = r.z - s.z;
        const desired = Math.atan2(dx, -dz);
        let diff = desired - s.heading;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        return { pitch: -0.15, roll: Math.max(-0.6, Math.min(0.6, diff * 1.4)), throttle: 0 };
      },
    };
  }
  // 'play': the cover — the autopilot flies the course, mid-valley.
  return { steps: 2700, input: () => autopilotInput(game) };
}

// What the HUD needs, in one plain object.
export function hudView(game) {
  const s = game.flight;
  const ring = game.course[Math.min(game.ringsPassed, game.course.length - 1)];
  let nextRing = null;
  if (game.mode === 'flying' && game.ringsPassed < game.course.length) {
    const dx = ring.x - s.x;
    const dz = ring.z - s.z;
    const dist = Math.sqrt(dx * dx + dz * dz + (ring.y - s.y) * (ring.y - s.y));
    const bearing = Math.atan2(dx, -dz);
    let angle = bearing - s.heading;
    while (angle > Math.PI) angle -= Math.PI * 2;
    while (angle < -Math.PI) angle += Math.PI * 2;
    nextRing = { angle, distance: dist };
  }
  return {
    flight: s,
    groundBelow: groundHeight(s.x, s.z),
    headingDeg: headingDegrees(s.heading),
    ringsPassed: game.ringsPassed,
    ringsTotal: game.course.length,
    score: game.score,
    elapsed: game.elapsed,
    objective: objectiveText(game),
    flash: game.time <= game.flashUntil ? game.flash : null,
    flashColor: '#ffd34d',
    nextRing,
    screen: endScreen(game),
  };
}
