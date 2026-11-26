// The Kestrel K-9, Skylark Air Mail's little bush plane: built from plain
// boxes, cylinders and cones, painted cream and post-box red, with a
// spinning propeller and fixed landing gear. No imported model, no texture
// files — the shape is code, so it is the same on every machine.

export function buildAircraft(THREE) {
  const plane = new THREE.Group();
  const cream = new THREE.MeshLambertMaterial({ color: 0xf2e6c8 });
  const red = new THREE.MeshLambertMaterial({ color: 0xc23b2e });
  const dark = new THREE.MeshLambertMaterial({ color: 0x2e3138 });
  const glass = new THREE.MeshLambertMaterial({ color: 0x9fd4e8, transparent: true, opacity: 0.85 });
  const metal = new THREE.MeshLambertMaterial({ color: 0x8f959e });

  // Fuselage: a tapered tube, nose at -z (the plane flies toward -z).
  const fuselage = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.55, 7.2, 12), cream);
  fuselage.rotation.x = Math.PI / 2;
  fuselage.position.set(0, 0, 0);
  fuselage.castShadow = true;
  plane.add(fuselage);

  // Nose cowl, red.
  const cowl = new THREE.Mesh(new THREE.CylinderGeometry(0.88, 0.85, 1.1, 12), red);
  cowl.rotation.x = Math.PI / 2;
  cowl.position.set(0, 0, -3.9);
  cowl.castShadow = true;
  plane.add(cowl);

  // Canopy: a flattened glass bubble over the cockpit.
  const canopy = new THREE.Mesh(new THREE.SphereGeometry(0.72, 14, 10), glass);
  canopy.scale.set(0.9, 0.75, 1.7);
  canopy.position.set(0, 0.62, -0.7);
  plane.add(canopy);

  // Main wing: one long thin box, red tips.
  const wing = new THREE.Mesh(new THREE.BoxGeometry(11.4, 0.18, 1.9), cream);
  wing.position.set(0, 0.12, -0.4);
  wing.castShadow = true;
  plane.add(wing);
  for (const side of [-1, 1]) {
    const tip = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.2, 1.9), red);
    tip.position.set(side * 5.25, 0.12, -0.4);
    plane.add(tip);
  }

  // Tailplane and fin.
  const tailplane = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.14, 1.1), cream);
  tailplane.position.set(0, 0.22, 3.2);
  tailplane.castShadow = true;
  plane.add(tailplane);
  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.16, 1.5, 1.4), red);
  fin.position.set(0, 0.75, 3.2);
  fin.castShadow = true;
  plane.add(fin);

  // Tail cone and red stripe along the fuselage.
  const tailCone = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.16, 1.6, 10), cream);
  tailCone.rotation.x = Math.PI / 2;
  tailCone.position.set(0, 0, 4.1);
  plane.add(tailCone);
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.22, 6.4), red);
  stripe.position.set(0, 0.62, -0.2);
  plane.add(stripe);

  // Propeller: hub plus two blades, spinning around the z axis.
  const prop = new THREE.Group();
  prop.position.set(0, 0, -4.55);
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.5, 10), dark);
  hub.rotation.x = Math.PI / 2;
  prop.add(hub);
  const bladeGeo = new THREE.BoxGeometry(0.34, 3.4, 0.1);
  for (const angle of [0, Math.PI / 2]) {
    const blade = new THREE.Mesh(bladeGeo, dark);
    blade.rotation.z = angle;
    prop.add(blade);
  }
  // A faint translucent disc sells the blur of a spinning prop.
  const disc = new THREE.Mesh(
    new THREE.CircleGeometry(1.75, 24),
    new THREE.MeshBasicMaterial({ color: 0xdddddd, transparent: true, opacity: 0.14, side: THREE.DoubleSide }),
  );
  prop.add(disc);
  plane.add(prop);

  // Fixed landing gear: two wheels and a tail wheel.
  const wheelGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.3, 12);
  for (const side of [-1, 1]) {
    const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 1.1, 6), metal);
    strut.position.set(side * 0.95, -0.85, -0.9);
    strut.rotation.z = side * 0.35;
    plane.add(strut);
    const wheel = new THREE.Mesh(wheelGeo, dark);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(side * 1.15, -1.35, -0.9);
    wheel.castShadow = true;
    plane.add(wheel);
  }
  const tailWheel = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.16, 10), dark);
  tailWheel.rotation.z = Math.PI / 2;
  tailWheel.position.set(0, -0.62, 3.9);
  plane.add(tailWheel);

  // Wingtip navigation lights: red left, green right.
  const navGeo = new THREE.SphereGeometry(0.14, 8, 6);
  const navLeft = new THREE.Mesh(navGeo, new THREE.MeshBasicMaterial({ color: 0xff2222 }));
  navLeft.position.set(-5.7, 0.12, -0.4);
  plane.add(navLeft);
  const navRight = new THREE.Mesh(navGeo, new THREE.MeshBasicMaterial({ color: 0x22ff66 }));
  navRight.position.set(5.7, 0.12, -0.4);
  plane.add(navRight);

  plane.userData.propeller = prop;
  return plane;
}

// Spin the propeller: faster with throttle, and always turning a little so
// the plane reads as alive even at idle.
export function spinPropeller(plane, throttle, dt) {
  const prop = plane.userData.propeller;
  if (prop) prop.rotation.z += dt * (4 + throttle * 46);
}
