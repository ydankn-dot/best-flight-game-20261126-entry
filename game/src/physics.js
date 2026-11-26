// Flight model for the Kestrel K-9: an arcade model with real trade-offs.
// Throttle sets the speed the engine wants; pitch trades speed for height;
// banking turns the plane; below the stall speed the wing stops flying and
// the nose drops. Fuel burns with throttle, and the ground is unforgiving.
// Pure functions over a plain state object, stepped at a fixed 1/60 s.

export const DT = 1 / 60;
export const MAX_SPEED = 88; // m/s at full throttle, about 317 km/h
export const STALL_SPEED = 24; // m/s: below this the wing gives up
export const TAKEOFF_SPEED = 30; // m/s: the wheels leave the runway
export const GEAR_HEIGHT = 1.4; // metres from the plane origin to the wheels

export function initialFlightState(home) {
  return {
    x: home.x,
    y: home.elevation + GEAR_HEIGHT,
    z: home.z + home.length / 2 - 18, // parked near the south end, facing north
    heading: 0, // 0 = north, toward -z; grows clockwise
    pitch: 0,
    roll: 0,
    speed: 0,
    throttle: 0,
    vy: 0,
    fuel: 100,
    damage: 0,
    airborne: false,
    landed: false,
    crashed: false,
    distanceFlown: 0,
  };
}

// Input: { pitch: -1..1 (positive = pull up), roll: -1..1 (positive = bank
// right), throttle: -1 | 0 | 1 }. Returns an event string or null:
// 'takeoff' | 'landed' | 'crashed' | 'rough' (a hard but survivable touch).
export function stepFlight(s, input, dt, ground, onRunway) {
  if (s.crashed || s.landed) return null;

  // --- Throttle and speed -------------------------------------------------
  s.throttle = Math.min(1, Math.max(0, s.throttle + input.throttle * dt * 0.55));
  const targetSpeed = 12 + s.throttle * (MAX_SPEED - 12);
  s.speed += (targetSpeed - s.speed) * Math.min(1, dt * 0.45);
  if (s.fuel <= 0) {
    s.throttle = Math.max(0, s.throttle - dt * 0.5);
    s.speed += (12 - s.speed) * Math.min(1, dt * 0.3); // gliding, sinking
  }

  // --- Attitude ------------------------------------------------------------
  const authority = Math.min(1, s.speed / 30); // sluggish when slow
  const targetPitch = input.pitch * 0.5 * authority;
  s.pitch += (targetPitch - s.pitch) * Math.min(1, dt * 2.2);
  const targetRoll = input.roll * 1.05 * authority;
  s.roll += (targetRoll - s.roll) * Math.min(1, dt * 3.0);

  // A banked turn: heading rate grows with bank and falls with speed.
  // Banking right (positive roll) turns the nose clockwise, so the heading
  // grows: east is +90 degrees from north.
  s.heading += Math.tan(s.roll) * (9.81 / Math.max(s.speed, 16)) * dt * 1.1;

  // --- Motion ---------------------------------------------------------------
  const forwardX = Math.sin(s.heading);
  const forwardZ = -Math.cos(s.heading);
  const stalled = s.speed < STALL_SPEED;
  let vy = s.speed * Math.sin(s.pitch);
  if (stalled && s.airborne) vy -= (STALL_SPEED - s.speed) * 0.85; // the wing quits
  if (!s.airborne) vy = 0;
  s.vy = vy;
  const horizontal = s.speed * Math.cos(s.pitch);
  s.x += forwardX * horizontal * dt;
  s.z += forwardZ * horizontal * dt;
  s.y += vy * dt;
  s.distanceFlown += s.speed * dt;

  // --- Fuel ------------------------------------------------------------------
  if (s.airborne || s.speed > 5) {
    s.fuel = Math.max(0, s.fuel - (0.10 + s.throttle * 0.34) * dt);
  }

  // --- Ground ------------------------------------------------------------------
  const gh = ground(s.x, s.z);
  const groundClearance = s.y - gh;
  if (groundClearance <= GEAR_HEIGHT) {
    s.y = gh + GEAR_HEIGHT;
    const onStrip = onRunway(s.x, s.z);
    const gentle = Math.abs(vy) < 4.5 && Math.abs(s.roll) < 0.28 && Math.abs(s.pitch) < 0.3;
    if (s.airborne) {
      if (onStrip && gentle && s.speed < 58) {
        s.landed = true;
        s.airborne = false;
        s.pitch = 0;
        s.roll = 0;
        return 'landed';
      }
      if (Math.abs(vy) < 3.2 && s.speed < 34) {
        // A rough field landing: survivable, but it costs the airframe.
        s.damage = Math.min(100, s.damage + 18 + Math.abs(vy) * 4);
        s.airborne = false;
        s.pitch = 0;
        s.roll = 0;
        return s.damage >= 100 ? 'crashed' : 'rough';
      }
      s.crashed = true;
      return 'crashed';
    }
    // Rolling on the ground: brakes and drag slow the plane.
    s.speed = Math.max(0, s.speed - dt * (s.throttle > 0.1 ? 0 : 9));
    if (s.speed >= TAKEOFF_SPEED && s.throttle > 0.55 && s.pitch > 0.04) {
      s.airborne = true;
      return 'takeoff';
    }
  }
  return null;
}

// Forward unit vector for the camera and the ring checks.
export function forwardVector(heading) {
  return { x: Math.sin(heading), z: -Math.cos(heading) };
}

// Heading in degrees, compass style: 0 = N, 90 = E, 180 = S, 270 = W.
export function headingDegrees(heading) {
  let d = (heading * 180) / Math.PI;
  d = ((d % 360) + 360) % 360;
  return d;
}
