// Terrain of the Skylark valley: one deterministic height function drives the
// mesh, the physics ground queries, the river, the trees and the runways, so
// what you see is exactly what you fly over. The valley winds north from
// Pine Hollow airfield to the Ridge Top strip, about 3 km of flying.

import { makeFbm2D, mulberry32 } from './rng.js';

export const WORLD_SEED = 20261126;
export const RUNWAY_HOME = { x: 0, z: 240, heading: 0, length: 340, width: 26, elevation: 42 };
export const RUNWAY_FAR = { x: -140, z: -2920, heading: 0, length: 300, width: 24, elevation: 42 };

// The valley floor winds gently as you fly north (negative z).
export function valleyCenterX(z) {
  return 220 * Math.sin(z * 0.0006) + 120 * Math.sin(z * 0.0017 + 1.3);
}

function clamp01(v) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function smoothstep(edge0, edge1, x) {
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

const fbmRidge = makeFbm2D(WORLD_SEED + 11, 4);
const fbmFloor = makeFbm2D(WORLD_SEED + 23, 3);
const fbmDetail = makeFbm2D(WORLD_SEED + 47, 3);

function runwayFlatten(x, z) {
  // Blend the terrain flat near either runway so the strips sit on level ground.
  let flat = 0;
  for (const r of [RUNWAY_HOME, RUNWAY_FAR]) {
    const dx = (x - r.x) / (r.length * 0.75);
    const dz = (z - r.z) / (r.width * 2.6);
    const d = Math.sqrt(dx * dx + dz * dz);
    flat = Math.max(flat, 1 - smoothstep(0.55, 1.0, d));
  }
  return flat;
}

// The one height function: metres above sea level at world (x, z).
export function groundHeight(x, z) {
  const centre = valleyCenterX(z);
  const d = Math.abs(x - centre);
  const floor = 40 + 7 * fbmFloor(x * 0.004, z * 0.004);
  const wall = smoothstep(240, 980, d);
  const ridge = 300 + 300 * fbmRidge(x * 0.0016 + 7.3, z * 0.0016 + 2.1);
  const detail = 14 * (fbmDetail(x * 0.02, z * 0.02) - 0.5);
  let h = floor + wall * ridge + detail * (0.25 + wall);
  const flat = runwayFlatten(x, z);
  if (flat > 0) h = h * (1 - flat) + RUNWAY_HOME.elevation * flat;
  return h;
}

function heightColor(h, slope, rand) {
  // Valley grass, rock faces, snow caps; a little seeded variation.
  const jitter = (rand() - 0.5) * 0.07;
  if (h > 300 + 40 * (rand() - 0.5)) return [0.93 + jitter, 0.93 + jitter, 0.96 + jitter];
  if (slope > 0.55 || h > 210) return [0.42 + jitter, 0.38 + jitter, 0.34 + jitter];
  if (h < 48) return [0.36 + jitter, 0.55 + jitter, 0.28 + jitter];
  return [0.3 + jitter, 0.48 + jitter, 0.24 + jitter];
}

export function buildTerrain(THREE) {
  const group = new THREE.Group();
  const rand = mulberry32(WORLD_SEED + 91);

  // --- Heightfield mesh -------------------------------------------------
  const SIZE_X = 3800;
  const SIZE_Z = 4200;
  const SEG_X = 150;
  const SEG_Z = 165;
  const geo = new THREE.PlaneGeometry(SIZE_X, SIZE_Z, SEG_X, SEG_Z);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const centerZ = -1350;
  for (let i = 0; i < pos.count; i += 1) {
    const x = pos.getX(i);
    const z = pos.getZ(i) + centerZ;
    const h = groundHeight(x, z);
    pos.setY(i, h);
    pos.setZ(i, z);
    // Slope estimate from the height function, for rock colouring.
    const slope = Math.abs(groundHeight(x + 8, z) - h) / 8 + Math.abs(groundHeight(x, z + 8) - h) / 8;
    const c = heightColor(h, slope, rand);
    colors[i * 3] = c[0];
    colors[i * 3 + 1] = c[1];
    colors[i * 3 + 2] = c[2];
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const terrain = new THREE.Mesh(
    geo,
    new THREE.MeshLambertMaterial({ vertexColors: true }),
  );
  terrain.receiveShadow = true;
  group.add(terrain);

  // --- Lake beside Pine Hollow ------------------------------------------
  const lake = new THREE.Mesh(
    new THREE.CircleGeometry(190, 40),
    new THREE.MeshLambertMaterial({ color: 0x2f6f9f, transparent: true, opacity: 0.92 }),
  );
  lake.rotation.x = -Math.PI / 2;
  lake.position.set(430, 42.6, 330);
  group.add(lake);

  // --- River ribbon down the valley --------------------------------------
  const riverPts = [];
  for (let z = 560; z >= -3200; z -= 80) {
    riverPts.push(new THREE.Vector3(valleyCenterX(z) + 60, 42.4, z));
  }
  const riverCurve = new THREE.CatmullRomCurve3(riverPts);
  const river = new THREE.Mesh(
    new THREE.TubeGeometry(riverCurve, 64, 7, 5, false),
    new THREE.MeshLambertMaterial({ color: 0x3a7fb5, transparent: true, opacity: 0.9 }),
  );
  river.scale.y = 0.12;
  group.add(river);

  // --- Pine forest: instanced low-poly pines ------------------------------
  const treeCount = 650;
  const trunkGeo = new THREE.CylinderGeometry(0.9, 1.4, 7, 5);
  const coneGeo = new THREE.ConeGeometry(7, 22, 6);
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x5a4028 });
  const coneMat = new THREE.MeshLambertMaterial({ color: 0x1f4d24 });
  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, treeCount);
  const cones = new THREE.InstancedMesh(coneGeo, coneMat, treeCount);
  const dummy = new THREE.Object3D();
  let placed = 0;
  let guard = 0;
  while (placed < treeCount && guard < treeCount * 40) {
    guard += 1;
    const x = (rand() - 0.5) * 3400;
    const z = 560 - rand() * 3800;
    const h = groundHeight(x, z);
    if (h > 150 || h < 44) continue; // trees live on the valley floor and lower slopes
    const centre = valleyCenterX(z);
    if (Math.abs(x - centre) < 46) continue; // keep the river clear
    if (Math.abs(x - RUNWAY_HOME.x) < 60 && Math.abs(z - RUNWAY_HOME.z) < 260) continue;
    if (Math.abs(x - RUNWAY_FAR.x) < 60 && Math.abs(z - RUNWAY_FAR.z) < 240) continue;
    const s = 0.7 + rand() * 0.9;
    dummy.position.set(x, h + 3 * s, z);
    dummy.scale.setScalar(s);
    dummy.rotation.y = rand() * Math.PI * 2;
    dummy.updateMatrix();
    trunks.setMatrixAt(placed, dummy.matrix);
    dummy.position.y = h + (3 + 11) * s;
    dummy.updateMatrix();
    cones.setMatrixAt(placed, dummy.matrix);
    placed += 1;
  }
  trunks.count = placed;
  cones.count = placed;
  trunks.castShadow = true;
  cones.castShadow = true;
  group.add(trunks);
  group.add(cones);

  // --- Runways, markings and lights --------------------------------------
  for (const r of [RUNWAY_HOME, RUNWAY_FAR]) {
    const strip = new THREE.Mesh(
      new THREE.BoxGeometry(r.width, 1.2, r.length),
      new THREE.MeshLambertMaterial({ color: 0x2c2f36 }),
    );
    strip.position.set(r.x, r.elevation + 0.4, r.z);
    strip.receiveShadow = true;
    group.add(strip);
    const dashGeo = new THREE.PlaneGeometry(1.6, 14);
    const dashMat = new THREE.MeshBasicMaterial({ color: 0xf5f2e8 });
    for (let dz = -r.length / 2 + 24; dz < r.length / 2 - 10; dz += 32) {
      const dash = new THREE.Mesh(dashGeo, dashMat);
      dash.rotation.x = -Math.PI / 2;
      dash.position.set(r.x, r.elevation + 1.05, r.z + dz);
      group.add(dash);
    }
    // Threshold bars at both ends.
    for (const end of [-1, 1]) {
      const bar = new THREE.Mesh(
        new THREE.PlaneGeometry(r.width - 6, 4),
        new THREE.MeshBasicMaterial({ color: 0xf5f2e8 }),
      );
      bar.rotation.x = -Math.PI / 2;
      bar.position.set(r.x, r.elevation + 1.05, r.z + end * (r.length / 2 - 10));
      group.add(bar);
    }
    // Edge lights: small warm lamps on short posts down both sides.
    const lampGeo = new THREE.SphereGeometry(0.6, 8, 6);
    const lampMat = new THREE.MeshBasicMaterial({ color: 0xffc861 });
    const postGeo = new THREE.CylinderGeometry(0.12, 0.12, 1.8, 5);
    const postMat = new THREE.MeshLambertMaterial({ color: 0x555555 });
    for (let dz = -r.length / 2 + 12; dz <= r.length / 2 - 12; dz += 36) {
      for (const side of [-1, 1]) {
        const post = new THREE.Mesh(postGeo, postMat);
        post.position.set(r.x + side * (r.width / 2 + 2), r.elevation + 1.6, r.z + dz);
        group.add(post);
        const lamp = new THREE.Mesh(lampGeo, lampMat);
        lamp.position.set(r.x + side * (r.width / 2 + 2), r.elevation + 2.6, r.z + dz);
        group.add(lamp);
      }
    }
  }

  // --- Hangar and windsock at Pine Hollow --------------------------------
  const hangar = new THREE.Mesh(
    new THREE.BoxGeometry(30, 7, 20),
    new THREE.MeshLambertMaterial({ color: 0x8a4a3a }),
  );
  hangar.position.set(-52, RUNWAY_HOME.elevation + 3.5, 300);
  hangar.castShadow = true;
  group.add(hangar);
  const hangarRoof = new THREE.Mesh(
    new THREE.CylinderGeometry(10, 10, 30, 12, 1, false, 0, Math.PI),
    new THREE.MeshLambertMaterial({ color: 0x6e3a2e }),
  );
  hangarRoof.rotation.z = Math.PI / 2;
  hangarRoof.rotation.y = Math.PI / 2;
  hangarRoof.position.set(-52, RUNWAY_HOME.elevation + 7, 300);
  group.add(hangarRoof);

  const sockPole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.35, 0.35, 12, 6),
    new THREE.MeshLambertMaterial({ color: 0xd8d8d8 }),
  );
  sockPole.position.set(34, RUNWAY_HOME.elevation + 6, 300);
  group.add(sockPole);
  const sock = new THREE.Mesh(
    new THREE.ConeGeometry(1.6, 7, 8),
    new THREE.MeshLambertMaterial({ color: 0xff7a2f }),
  );
  sock.rotation.z = -Math.PI / 2;
  sock.position.set(38, RUNWAY_HOME.elevation + 11.4, 300);
  group.add(sock);

  // --- Clouds: soft white puffs, drifting with sim time ------------------
  const clouds = [];
  const cloudMat = new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.88 });
  for (let i = 0; i < 26; i += 1) {
    const puff = new THREE.Group();
    const n = 3 + Math.floor(rand() * 3);
    for (let j = 0; j < n; j += 1) {
      const s = new THREE.Mesh(new THREE.SphereGeometry(16 + rand() * 22, 10, 8), cloudMat);
      s.position.set((rand() - 0.5) * 70, (rand() - 0.5) * 8, (rand() - 0.5) * 30);
      s.scale.y = 0.45;
      puff.add(s);
    }
    puff.position.set((rand() - 0.5) * 3400, 380 + rand() * 170, 560 - rand() * 3800);
    puff.userData.baseX = puff.position.x;
    clouds.push(puff);
    group.add(puff);
  }

  return { group, clouds };
}
