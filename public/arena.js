(() => {
  const host = document.getElementById('bgfx3d');
  if (!host) return;

  const fallback = () => {
    host.style.background = 'radial-gradient(ellipse at 18% 22%, rgba(255,210,87,.18), transparent 34%), radial-gradient(ellipse at 82% 72%, rgba(255,40,18,.18), transparent 38%)';
  };
  if (!window.THREE) {
    fallback();
    return;
  }

  const mobile = window.innerWidth < 720;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(54, innerWidth / innerHeight, .1, 160);
  camera.position.set(0, 1.5, 25);

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ alpha: true, antialias: !mobile, powerPreference: 'low-power' });
  } catch {
    fallback();
    return;
  }
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, mobile ? 1 : 1.5));
  renderer.setSize(innerWidth, innerHeight);
  renderer.setClearColor(0x000000, 0);
  host.appendChild(renderer.domElement);

  const additive = (color, opacity) => new THREE.MeshBasicMaterial({
    color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false
  });

  // Layered twisting arena gates float behind the scoreboard.
  const arena = new THREE.Group();
  arena.position.set(0, 1.4, -11);
  arena.rotation.set(.66, .08, -.12);
  scene.add(arena);
  [
    { radius: mobile ? 7 : 10, tube: .035, color: 0xffd257, opacity: .29, p: [2, 3], spin: .0010 },
    { radius: mobile ? 6.4 : 9.2, tube: .045, color: 0xff6a1a, opacity: .2, p: [3, 5], spin: -.0008 },
    { radius: mobile ? 7.8 : 11, tube: .025, color: 0x16dff0, opacity: .2, p: [2, 5], spin: .00055 }
  ].forEach(s => {
    const knot = new THREE.Mesh(new THREE.TorusKnotGeometry(s.radius, s.tube, 180, 5, ...s.p), additive(s.color, s.opacity));
    knot.userData.spin = s.spin;
    arena.add(knot);
  });

  // Two 3D portals frame the live table and slowly breathe with the arena.
  const portals = [];
  [-1, 1].forEach((side, index) => {
    const portal = new THREE.Group();
    const baseY = side < 0 ? 2.6 : -2.8;
    portal.position.set(side * (mobile ? 7.4 : 12.5), baseY, -5.8);
    portal.rotation.set(.32 + index * .18, side * -.2, side * .08);
    portal.userData = { side, baseY, phase: index * 1.8 };
    const radius = mobile ? 4 : 5.9;
    [
      [radius, .042, 0xffd257, .42],
      [radius * .78, .068, 0xff6a1a, .29],
      [radius * 1.13, .025, 0x16dff0, .34]
    ].forEach(([r, tube, color, opacity], i) => {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(r, tube, 8, 112), additive(color, opacity));
      ring.rotation.x = i === 1 ? .18 : -.12;
      ring.userData.spin = (i % 2 ? -.0025 : .0017) * side;
      portal.add(ring);
    });
    const core = new THREE.Mesh(new THREE.IcosahedronGeometry(radius * .2, 1), new THREE.MeshBasicMaterial({
      color: index ? 0xff6a1a : 0xffd257, wireframe: true, transparent: true, opacity: .28,
      blending: THREE.AdditiveBlending, depthWrite: false
    }));
    portal.add(core);
    core.userData.core = true;
    scene.add(portal);
    portals.push(portal);
  });

  // Orbiting shards add depth and give the portals their dimensional movement.
  const shards = [];
  portals.forEach((portal, portalIndex) => {
    const count = mobile ? 3 : 5;
    const radius = mobile ? 4 : 5.9;
    for (let i = 0; i < count; i++) {
      const size = mobile ? .19 : .27;
      const shard = new THREE.Mesh(new THREE.OctahedronGeometry(size, 0), new THREE.MeshBasicMaterial({
        color: i % 2 ? 0xff6a1a : 0xffefab, wireframe: true, transparent: true, opacity: .68,
        blending: THREE.AdditiveBlending, depthWrite: false
      }));
      portal.add(shard);
      shards.push({ mesh: shard, angle: Math.PI * 2 * i / count + portalIndex, radius: radius * (.78 + Math.random() * .26), speed: (i % 2 ? 1 : -1) * (.12 + Math.random() * .08) });
    }
  });

  // Holographic Innovista wordmarks and fine particles drift through the depth layers.
  const logoCanvas = document.createElement('canvas');
  logoCanvas.width = 1100;
  logoCanvas.height = 190;
  const ctx = logoCanvas.getContext('2d');
  const gradient = ctx.createLinearGradient(80, 0, 1020, 0);
  gradient.addColorStop(0, '#ffd257');
  gradient.addColorStop(.48, '#fffaf0');
  gradient.addColorStop(1, '#16dff0');
  ctx.font = '900 142px Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = '#ff6a1a';
  ctx.shadowBlur = 24;
  ctx.strokeStyle = 'rgba(255,210,87,.56)';
  ctx.lineWidth = 3;
  ctx.strokeText('INNOVISTA', 550, 96);
  ctx.fillStyle = gradient;
  ctx.fillText('INNOVISTA', 550, 96);
  const texture = new THREE.CanvasTexture(logoCanvas);
  texture.minFilter = THREE.LinearFilter;
  const logoWidth = mobile ? 18 : 28;
  const logoHeight = logoWidth * logoCanvas.height / logoCanvas.width;
  const wordmark = new THREE.Group();
  wordmark.position.set(0, .8, -1.5);
  wordmark.rotation.set(-.12, .12, -.025);
  for (let layer = 8; layer > 0; layer--) {
    const edge = new THREE.Mesh(new THREE.PlaneGeometry(logoWidth, logoHeight), new THREE.MeshBasicMaterial({
      color: layer % 2 ? 0xff6a1a : 0xffd257, transparent: true, opacity: .16,
      side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending
    }));
    edge.position.z = -layer * .045;
    wordmark.add(edge);
  }
  const wordFace = new THREE.Mesh(new THREE.PlaneGeometry(logoWidth, logoHeight), new THREE.MeshBasicMaterial({
    map: texture, transparent: true, opacity: .48, side: THREE.DoubleSide,
    depthWrite: false, blending: THREE.AdditiveBlending
  }));
  wordFace.position.z = .01;
  wordmark.add(wordFace);
  scene.add(wordmark);

  const marks = [];
  for (let i = 0; i < (mobile ? 2 : 4); i++) {
    const width = mobile ? 10 : 17;
    const mark = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, opacity: .1, depthWrite: false, blending: THREE.AdditiveBlending }));
    mark.scale.set(width, width * .18, 1);
    mark.position.set((Math.random() - .5) * (mobile ? 9 : 28), (Math.random() - .5) * 15, (Math.random() - .5) * 13);
    mark.userData = { x: mark.position.x, y: mark.position.y, z: mark.position.z, phase: Math.random() * Math.PI * 2 };
    scene.add(mark);
    marks.push(mark);
  }

  const grid = new THREE.GridHelper(100, 28, 0xff6a1a, 0xffd257);
  grid.position.set(0, -11, -8);
  grid.material.transparent = true;
  grid.material.opacity = .11;
  scene.add(grid);

  const particleCount = mobile ? 100 : 210;
  const positions = new Float32Array(particleCount * 3);
  for (let i = 0; i < particleCount; i++) {
    positions[i * 3] = (Math.random() - .5) * 58;
    positions[i * 3 + 1] = (Math.random() - .5) * 36;
    positions[i * 3 + 2] = (Math.random() - .5) * 38;
  }
  const particleGeometry = new THREE.BufferGeometry();
  particleGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  scene.add(new THREE.Points(particleGeometry, new THREE.PointsMaterial({ color: 0xffdf87, size: .12, transparent: true, opacity: .5 })));

  let pointerX = 0;
  let pointerY = 0;
  window.addEventListener('pointermove', event => {
    pointerX = (event.clientX / innerWidth - .5) * 2;
    pointerY = (event.clientY / innerHeight - .5) * 2;
  }, { passive: true });
  window.addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
  }, { passive: true });

  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const clock = new THREE.Clock();
  const animate = () => {
    requestAnimationFrame(animate);
    const t = clock.getElapsedTime();
    if (!reducedMotion) {
      arena.rotation.y += .00055;
      arena.rotation.z += .00022;
      arena.scale.setScalar(1 + Math.sin(t * .42) * .018);
      wordmark.position.y = .8 + Math.sin(t * .48) * .62;
      wordmark.rotation.x = -.12 + Math.sin(t * .52) * .055;
      wordmark.rotation.y = .12 + Math.sin(t * .36) * .22;
      wordmark.rotation.z = -.025 + Math.sin(t * .28) * .025;
      wordmark.scale.setScalar(1 + Math.sin(t * .7) * .025);
      portals.forEach(portal => {
        const { side, baseY, phase } = portal.userData;
        portal.position.y = baseY + Math.sin(t * .42 + phase) * .32;
        portal.rotation.y = side * -.2 + Math.sin(t * .2 + phase) * .1;
        portal.children.forEach(child => {
          if (child.userData.spin) child.rotation.z += child.userData.spin;
          if (child.userData.core) { child.rotation.x += .004; child.rotation.y -= .006; }
        });
      });
      shards.forEach(shard => {
        shard.angle += shard.speed * .01;
        shard.mesh.position.set(Math.cos(shard.angle) * shard.radius, Math.sin(shard.angle) * shard.radius, Math.sin(shard.angle * 2) * .55);
        shard.mesh.rotation.x += .014;
        shard.mesh.rotation.y -= .018;
      });
      marks.forEach(mark => {
        const wave = Math.sin(t * .34 + mark.userData.phase);
        mark.position.x = mark.userData.x + Math.sin(t * .22 + mark.userData.phase) * 2;
        mark.position.y = mark.userData.y + Math.sin(t * .31 + mark.userData.phase) * .7;
        mark.position.z = mark.userData.z + wave * 1.4;
        mark.material.opacity = .055 + (wave + 1) * .045;
      });
      wordFace.material.opacity = .38 + (Math.sin(t * .9) + 1) * .08;
      grid.rotation.y += .00025;
      camera.position.x += (pointerX * 1.1 - camera.position.x) * .012;
      camera.position.y += (1.5 - pointerY * .7 - camera.position.y) * .012;
    }
    camera.lookAt(0, 0, -2);
    renderer.render(scene, camera);
  };
  animate();
})();
