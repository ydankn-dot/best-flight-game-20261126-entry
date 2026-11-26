// The air-mail course: eight target rings strung down the valley from Pine
// Hollow to the Ridge Top strip. Fly through each in turn, then land. Ring
// positions are fixed by the seed, so the course never changes.

import { valleyCenterX, groundHeight } from './terrain.js';

export const RING_COUNT = 8;

export function ringCourse() {
  const stops = [
    { z: -260, alt: 130, radius: 26 },
    { z: -620, alt: 170, radius: 24 },
    { z: -1000, alt: 150, radius: 26 },
    { z: -1380, alt: 200, radius: 22 },
    { z: -1760, alt: 165, radius: 24 },
    { z: -2140, alt: 190, radius: 22 },
    { z: -2500, alt: 140, radius: 26 },
    { z: -2780, alt: 110, radius: 28 },
  ];
  return stops.map((stop, i) => {
    const x = valleyCenterX(stop.z);
    const y = Math.max(stop.alt, groundHeight(x, stop.z) + 55);
    return {
      index: i,
      x,
      y,
      z: stop.z,
      radius: stop.radius,
      passed: false,
      // Rings face along the valley so you fly through them, not past them.
      heading: Math.atan2(
        valleyCenterX(stop.z - 120) - valleyCenterX(stop.z + 120),
        240,
      ),
    };
  });
}

// Build the visible rings: a glowing torus for each, gold for the next one,
// dim blue for the ones after, green once flown through.
export function buildRings(THREE, course) {
  const group = new THREE.Group();
  const meshes = course.map((ring) => {
    const geo = new THREE.TorusGeometry(ring.radius, 1.5, 12, 40);
    const mat = new THREE.MeshBasicMaterial({ color: 0x3a6fd8, transparent: true, opacity: 0.85 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(ring.x, ring.y, ring.z);
    mesh.rotation.y = ring.heading;
    group.add(mesh);
    // A small beacon light above each ring so it reads from far away.
    const beacon = new THREE.Mesh(
      new THREE.SphereGeometry(1.6, 10, 8),
      new THREE.MeshBasicMaterial({ color: 0xffd34d }),
    );
    beacon.position.set(ring.x, ring.y + ring.radius + 7, ring.z);
    group.add(beacon);
    return { mesh, beacon };
  });
  return { group, meshes };
}

export function paintRings(meshes, nextIndex) {
  meshes.forEach((m, i) => {
    if (i < nextIndex) {
      m.mesh.material.color.setHex(0x2fae5f); // flown: green
      m.mesh.material.opacity = 0.45;
      m.beacon.material.color.setHex(0x2fae5f);
    } else if (i === nextIndex) {
      m.mesh.material.color.setHex(0xffb020); // next: gold, bright
      m.mesh.material.opacity = 1.0;
      m.beacon.material.color.setHex(0xffb020);
    } else {
      m.mesh.material.color.setHex(0x3a6fd8); // later: dim blue
      m.mesh.material.opacity = 0.6;
      m.beacon.material.color.setHex(0x3a6fd8);
    }
  });
}

// A ring counts when the plane crosses its plane within its radius.
// Returns the index of a newly passed ring, or -1.
export function checkRingPass(course, nextIndex, prev, now) {
  if (nextIndex >= course.length) return -1;
  const ring = course[nextIndex];
  // Ring plane normal: along the valley (the ring faces the flight path).
  const nx = Math.sin(ring.heading);
  const nz = -Math.cos(ring.heading);
  const dPrev = (prev.x - ring.x) * nx + (prev.z - ring.z) * nz;
  const dNow = (now.x - ring.x) * nx + (now.z - ring.z) * nz;
  if (dPrev <= 0 && dNow > 0) {
    const dx = now.x - ring.x;
    const dy = now.y - ring.y;
    const dz = now.z - ring.z;
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (dist < ring.radius * 0.95) return nextIndex;
  }
  return -1;
}
