import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { createSurfaces } from './surfaces.js';
// Roofless architectural model. Static furniture shares instanced geometry.
export function createCampus(THREE, scene, roster, departments) {
  const palette = {
    ivory: '#f3f0e9', wall: '#d8d1c3', frame: '#283332', wood: '#c6aa82',
    oak: '#d7bd95', dark: '#283332', sage: '#7c8069', glass: '#b7dce7',
  };
  const rooms = departments.map((d, i) => ({
    ...d, x: -24 + (i % 4) * 16, z: -12 + Math.floor(i / 4) * 16,
    width: 14, depth: 11,
    color: ['#858176', '#777f72', '#8d7a6f', '#8a816b', '#7c8074', '#8d8276', '#7e8067', '#717a7c'][i],
  }));
  const homes = new Map(), groups = new Map(), shadows = [];
  const surfaces = createSurfaces(THREE);
  const geometries = {
    box: new THREE.BoxGeometry(1, 1, 1),
    soft: new RoundedBoxGeometry(1, 1, 1, 2, .08),
    round: new THREE.CylinderGeometry(.5, .5, 1, 12),
    leaf: new THREE.IcosahedronGeometry(.5, 1),
    wheel: new THREE.CylinderGeometry(.5,.5,1,12).rotateX(Math.PI/2),
  };
  const frond = new THREE.BufferGeometry(), vertices=[], indices=[];
  for(let i=0;i<=6;i++){const t=i/6,width=Math.sin(Math.PI*t)*.17+.007;vertices.push(t,Math.sin(Math.PI*t)*.46,width,t,Math.sin(Math.PI*t)*.46,-width);if(i<6){const j=i*2;indices.push(j,j+2,j+1,j+1,j+2,j+3)}}
  frond.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));frond.setIndex(indices);frond.computeVertexNormals();geometries.frond=frond;
  function part(shape, x, y, z, w, h, d, color, rotation = 0) {
    const key = `${shape}:${color}`;
    if (!groups.has(key)) groups.set(key, { shape, color, parts: [] });
    groups.get(key).parts.push({ x, y, z, w, h, d, rotation });
  }
  const box = (...args) => part('box', ...args);
  const soft = (...args) => part('soft', ...args);
  const round = (...args) => part('round', ...args);
  const shadow = (x, z, w, d) => shadows.push([x, z, w, d]);
  function plant(x, z, large = false) {
    const s = large ? 1.3 : 1;
    round(x, .3 * s, z, .65 * s, .6 * s, .65 * s, '#e8e7df');
    round(x, .61 * s, z, .54 * s, .05, .54 * s, '#6e7566');
    round(x, .95 * s, z, .07, .7 * s, .07, '#8a8465');
    for(let i=0;i<8;i++)part('frond',x,1.25*s,z,1.1*s,.9*s,1.1*s,i%2?'#7f9b59':'#4f734d',i*Math.PI/4);
    part('leaf', x, 1.33 * s, z, .23 * s, .55 * s, .23 * s, '#608a73');
    shadow(x, z, 1.5 * s, 1.5 * s);
  }
  function chair(x, z, facing = 0, color = '#62827b') {
    round(x, .12, z, .55, .06, .55, '#87958c');
    round(x, .3, z, .1, .4, .1, '#87958c');
    box(x, .52, z, .7, .18, .67, color);
    const sign = facing === 0 ? 1 : -1;
    box(x, .85, z + sign * .3, .7, .65, .12, color);
  }
  function coffeeTable(x, z, size = 1.2) {
    round(x, .5, z, .5, 1, .5, '#b99d79');
    round(x, .6, z, size, .12, size, palette.oak);
    round(x + .2, .72, z, .17, .16, .17, '#e8e7df');
    shadow(x, z, size + .5, size + .5);
  }
  function sofa(x, z, width = 3.4, color = '#638d7e', facing = 0) {
    const sign = facing === 0 ? -1 : 1;
    box(x, .22, z, width - .3, .3, 1.15, '#9c8e75');
    soft(x, .51, z, width, .4, 1.35, color);
    soft(x, .9, z + sign * .55, width, .85, .25, color);
    box(x - width / 2 + .13, .73, z, .26, .65, 1.4, color);
    box(x + width / 2 - .13, .73, z, .26, .65, 1.4, color);
    for (let i = 0; i < 3; i++) box(x - width / 3 + i * width / 3, .74, z, width / 3 - .12, .08, 1, '#b2c4b1');
    shadow(x, z, width + .8, 2.1);
  }
  function cabinet(x, z, width = 3) {
    box(x, .57, z, width, 1.14, .7, palette.oak);
    box(x, 1.18, z, width + .1, .08, .8, palette.ivory);
    for (let i = -.5; i <= .5; i += .5) box(x + width * i * .6, .62, z + .36, .025, .85, .025, '#b99d79');
    round(x - width * .27, 1.32, z, .28, .26, .28, '#e8e7df');
    part('leaf', x - width * .27, 1.57, z, .55, .55, .55, '#608a73');
  }
  function board(x, z, color) {
    box(x, 1.85, z, 4.4, 1.65, .1, palette.frame);
    box(x, 1.85, z + .07, 4.22, 1.48, .05, '#f6f5ef');
    for (let i = 0; i < 6; i++) box(x - 1.4 + (i % 3) * .65, 2.18 - Math.floor(i / 3) * .4, z + .11, .45, .26, .03, i % 2 ? color : palette.oak);
    box(x + 1.15, 1.63, z + .11, .45, .7, .03, color);
    box(x + 1.75, 1.78, z + .11, .35, 1, .03, color);
  }
  function desk(member, x, z, accent) {
    homes.set(member.id, { x, z: z + 1 });
    shadow(x, z + .2, 3.1, 2.3);
    soft(x, .79, z, 2.25, .13, 1.15, palette.ivory);
    box(x - .96, .41, z, .09, .78, .8, palette.ivory);
    box(x + .96, .41, z, .09, .78, .8, palette.ivory);
    box(x, .28, z - .35, 1.92, .08, .08, palette.frame);
    box(x, 1.3, z - .22, .99, .63, .09, palette.dark);
    box(x, 1.3, z - .16, .88, .51, .025, '#7db5b6');
    box(x - .22, 1.32, z - .14, .025, .29, .015, '#bed5d0');
    box(x + .15, 1.17, z - .14, .48, .025, .015, '#bed5d0');
    box(x, 1, z - .22, .06, .35, .06, palette.frame);
    box(x, .88, z + .22, .7, .035, .25, '#e8e7df');
    round(x + .83, .97, z + .22, .16, .22, .16, palette.ivory);
    box(x - .82, .88, z + .14, .2, .04, .3, accent);
    chair(x, z + 1.05);
  }

  // One broad floor plate, generous promenades, a warm timber facade.
  box(0, -.36, 3, 67, .7, 47, '#a3b1aa');
  box(0, -.015, 3, 66.5, .06, 46.5, palette.ivory);
  box(0, .035, -4, 65, .035, 5, '#e1e4dc');
  box(0, .035, 12, 65, .035, 4.5, '#e1e4dc');
  for (const z of [-6.28, -1.72, 10, 14]) box(0, .06, z, 65, .02, .055, '#c8cdbe');
  // Rear facade frames the two rows of division rooms.
  const northWallSpans = [[-30.5, -1.5], [1.5, 30.5]];
  for (const [left, right] of northWallSpans) box((left + right) / 2, 1.7, -19, right - left, 3.4, .2, palette.wall);
  // Structural rhythm: exposed columns, edge beams, and a legible central atrium.
  // These cues give the cutaway a believable load path at overview distance.
  for (const x of [-31, -15, 1, 17, 31]) {
    for (const z of [-17.5, 9.5]) {
      box(x, 1.65, z, .38, 3.2, .38, palette.frame);
      box(x, 3.25, z, 4.2, .18, .42, palette.frame);
    }
  }
  // Warm timber canopy and recessed entrance rhythm.
  box(0, 3.25, -18.45, 66, .16, 1.1, palette.oak);
  for (const [left, right] of northWallSpans) for (let x = left + 2; x < right - 1; x += 4) {
    const width = Math.min(3.6, 2 * (right - x) - .2);
    box(x, 2, -18.84, width, 2.5, .08, '#a6c5c7');
    box(x + width / 2, 2, -18.76, .09, 2.6, .1, palette.frame);
    box(x, .7, -18.65, width, .12, .42, palette.oak);
  }
  for (const z of [-4, 12]) for (const x of [-16, 0, 16]) {
    box(x, .34, z, 3.5, .65, .85, palette.ivory);
    box(x, .69, z, 3.25, .08, .65, '#7c8770');
    for (const dx of [-1.1, 0, 1.1]) part('leaf', x + dx, 1.05, z, 1, .85, .8, '#82a28a');
    shadow(x, z, 4.5, 1.8);
  }

  for (const room of rooms) {
    const { x, z, color } = room;
    // Light oak perimeter, muted carpet work zone. Every room is 14 by 11.
    box(x, .045, z, 14, .07, 11, '#e0d0b4');
    for (let line = -5; line <= 5; line++) box(x, .084, z + line, 13.9, .006, .025, '#d1bea1');
    box(x - .6, .09, z - 1.3, 11.5, .04, 6.9, color);
    box(x, 1.4, z - 5.5, 14, 2.8, .16, '#48483f');
    box(x, .23, z - 5.35, 13.8, .35, .16, palette.oak);
    board(x - 2.9, z - 5.35, color);
    for (let slat = 0; slat < 15; slat++) box(x + 1.6 + slat * .28, 1.5, z - 5.34, .09, 2.55, .12, palette.oak);
    for (const side of [-1, 1]) {
      box(x + side * 7, .16, z, .12, .32, 11, palette.wall);
      box(x + side * 7, 1.45, z, .055, 2.25, 11, palette.glass);
      box(x + side * 7, 2.62, z, .09, .09, 11, palette.frame);
      for (const dz of [-5.5, -1.8, 1.8, 5.5]) box(x + side * 7, 1.45, z + dz, .09, 2.4, .07, palette.frame);
    }
    // Clear three-unit entry on the right; open door swing.
    box(x - 1.5, 1.4, z + 5.5, 11, 2.3, .055, palette.glass);
    box(x - 1.5, .16, z + 5.5, 11, .28, .1, palette.wall);
    box(x - 1.5, 2.62, z + 5.5, 11, .09, .1, palette.frame);
    for (const dx of [-7, -3.4, .3, 4]) box(x + dx, 1.45, z + 5.5, .07, 2.4, .09, palette.frame);
    box(x + 5.9, .09, z + 5.5, 2.4, .035, 1, '#c8cdbe');
    const members = roster.filter(m => m.departmentId === room.id);
    members.forEach((m, i) => desk(m, x - 5 + (i % 4) * 2.9, z - 3.25 + Math.floor(i / 4) * 3.8, color));
    plant(x + 6, z - 4.45);
    if (members.length <= 4) {
      box(x - 1.2, .105, z + 2.2, 7, .035, 4, '#ede9de');
      sofa(x - 1.9, z + .5, 3.7, room.id === 'leadership' ? '#7b8d9d' : palette.sage);
      coffeeTable(x - 1.9, z + 2.4, 1.4);
      chair(x + 1, z + 2.45, Math.PI, '#ac9579');
      cabinet(x - 5.5, z + 3.6, 2.2);
      plant(x + 2.7, z + 4.4);
    } else {
      cabinet(x - 4.4, z + 4, 3.2);
      plant(x + 2.5, z + 4.2);
      if (room.id === 'creative') {
        // Camera stand beside the creative team's open studio area.
        box(x - 6.1, .85, z + 2.6, .07, 1.6, .07, palette.dark);
        box(x - 6.1, 1.75, z + 2.6, .5, .4, .35, palette.dark);
        round(x - 6.1, .13, z + 2.6, .65, .07, .65, palette.dark);
      }
    }
  }

  // Shared amenities stay open: the only enclosed suites are the divisions above.
  const spaces = [
    { id: 'reception', name: 'Resepsionis', x: 0, z: 19, width: 12, depth: 9 },
    { id: 'meeting', name: 'Area Rapat', x: -24, z: 20, width: 14, depth: 10 },
    { id: 'lounge', name: 'Area Santai', x: -10, z: 20, width: 10, depth: 10 },
    { id: 'cafe', name: 'Kafe & Pantry', x: 12, z: 20, width: 10, depth: 10 },
    { id: 'terrace', name: 'Teras', x: 26, z: 20, width: 10, depth: 10 },
  ];
  const circulation = [-4, 12].map(z => ({ name: 'Koridor divisi', x: 0, z, width: 65, depth: 4.5 }));
  const wayfinding = [{ name: 'PINTU MASUK', x: 0, z: 29, y: .2 }];
  box(0, .06, 20, 64, .04, 11, '#e0d0b4');
  for (let x = -31; x <= 31; x += 2) box(x, .085, 20, .025, .006, 10.8, '#d1bea1');

  // Reception shares the social strip with meeting, lounge, pantry and terrace.
  soft(0, .65, 19.5, 6.5, 1.2, 1.7, palette.ivory);
  box(0, 1.3, 19.5, 6.7, .12, 1.9, palette.oak);
  box(0, 2, 15.1, 8.4, 3, .16, palette.frame);
  plant(-4.7, 22.8); plant(4.7, 22.8);

  box(-24, .105, 20.5, 12.5, .035, 8.5, '#c3cbbd');
  soft(-24, .85, 20.5, 8, .16, 2.3, palette.oak);
  for (const x of [-27, -24, -21]) {
    chair(x, 18.5, Math.PI); chair(x, 22.5);
  }
  box(-24, 1.85, 15.1, 6, 2, .16, palette.frame);
  plant(-30, 23.5);

  box(-10, .105, 20.5, 10, .035, 8.5, '#c4c7b7');
  sofa(-10.5, 18.3, 5, palette.sage);
  coffeeTable(-10.5, 21, 1.6); chair(-7.8, 21.8, Math.PI, '#ac9579');
  cabinet(-13.2, 24.1, 2.2); plant(-6, 24);

  cabinet(12, 16.2, 8);
  box(9.3, 1.6, 16.2, 1, .7, .65, palette.frame);
  box(12.4, 1.3, 16.2, 1.2, .13, .8, '#879b95');
  coffeeTable(11, 21, 1.8); chair(9.6, 21); chair(12.4, 21, Math.PI);
  plant(16.5, 24);

  box(26, .105, 20.5, 10, .035, 8.5, '#b5c0a5');
  sofa(25, 18.3, 5, '#c3b49b'); coffeeTable(25, 21, 1.5);
  for (const x of [21.7, 29.8]) plant(x, 24, true);

  // A short public approach keeps the full office legible at overview distance.
  box(0, -.12, 29.2, 24, .22, 5.5, palette.ivory);
  for (const x of [-10.5, 10.5]) {
    box(x, 1.55, 26.5, .18, 3.1, .18, palette.frame);
    plant(x, 29.2, true);
  }
  box(0, 3.2, 27.5, 22, .18, 4, palette.oak);
  for (const x of [-3, 3]) {
    box(x, 1.5, 26.4, 2.6, 3, .055, palette.glass);
    box(x, 3.05, 26.4, 2.7, .08, .09, palette.frame);
  }
  box(0, -.26, 34, 84, .15, 6, '#606a66');
  for (let z = 31.8; z < 36.5; z += .65) box(0, -.17, z, 4, .025, .24, palette.ivory);
  for (const x of [-25, 25]) {
    box(x, -.17, 29, 18, .06, 5, '#c0c7bc');
    for (let i = 0; i < 5; i++) box(x - 8 + i * 4, -.12, 29, .08, .025, 4.5, palette.ivory);
  }
  function car(x, z, color) {
    soft(x, .6, z, 1.8, .7, 3.8, color);
    soft(x, .98, z - .15, 1.6, .6, 2, palette.glass);
    for (const dx of [-.95, .95]) for (const dz of [-1.1, 1.1]) box(x + dx, .3, z + dz, .18, .55, .6, palette.frame);
  }
  car(-29, 29, '#e6e6df'); car(25, 29, '#71827e');
  for (const x of [-37, 37]) for (const z of [-18, 1, 22]) {
    box(x, .15, z, 4, .3, 5, '#b2bba4');
    plant(x, z, true);
    part('leaf', x, 3.1, z, 3.2, 3.7, 3.1, '#769174');
  }
  const dummy = new THREE.Object3D();
  for (const { shape, color, parts } of groups.values()) {
    const glass = color === palette.glass;
    const map = color === palette.ivory ? surfaces.marble : color === palette.oak ? surfaces.wood : color === palette.frame ? surfaces.stone : rooms.some(room => room.color === color) ? surfaces.carpet : null;
    const material = color === '#f4cf87' ? new THREE.MeshBasicMaterial({ color,toneMapped:false }) : new THREE.MeshStandardMaterial({ color: map && !rooms.some(r=>r.color===color) ? '#ffffff' : color, map, roughness: color===palette.ivory?.36:color===palette.frame?.42:.78,metalness:color===palette.frame?.2:0,transparent:glass,opacity:glass?.12:1,depthWrite:!glass });
    const mesh = new THREE.InstancedMesh(geometries[shape], material, parts.length);
    material.side=shape==='frond'?THREE.DoubleSide:THREE.FrontSide;
    mesh.castShadow=!glass&&color!=='#f4cf87';mesh.receiveShadow=!glass&&color!=='#f4cf87';
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i];
      dummy.position.set(p.x, p.y, p.z); dummy.rotation.set(0, p.rotation, 0); dummy.scale.set(p.w, p.h, p.d); dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    scene.add(mesh);
  }
  function panel(map, x, y, z, width, height, rotation = 0) {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), new THREE.MeshBasicMaterial({ map, side: THREE.DoubleSide }));
    mesh.position.set(x, y, z); mesh.rotation.y = rotation; scene.add(mesh);
  }
  for (const room of rooms) panel(surfaces.screen, room.x - 2.9, 1.85, room.z - 5.18, 4.15, 1.4);
  panel(surfaces.brand, 0, 2.05, 15.2, 7.8, 2.9);
  panel(surfaces.screen, -24, 1.85, 15.2, 5.3, 1.42);
  const warmth=new THREE.InstancedMesh(new THREE.PlaneGeometry(1,1),new THREE.MeshBasicMaterial({map:surfaces.glow,transparent:true,opacity:.25,depthWrite:false}),rooms.length*2);
  rooms.forEach((room,i)=>{dummy.position.set(room.x,.14,room.z-3.2);dummy.rotation.set(-Math.PI/2,0,0);dummy.scale.set(14,6,1);dummy.updateMatrix();warmth.setMatrixAt(i*2,dummy.matrix);dummy.position.set(room.x,2.65,room.z-5.38);dummy.rotation.set(0,0,0);dummy.scale.set(14,1.5,1);dummy.updateMatrix();warmth.setMatrixAt(i*2+1,dummy.matrix)});scene.add(warmth);
  // Baked contact shadows: no GPU shadow map, no per-frame geometry work.
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 64;
  const ctx = canvas.getContext('2d'), gradient = ctx.createRadialGradient(32, 32, 1, 32, 32, 32);
  gradient.addColorStop(0, 'rgba(39,54,42,.26)'); gradient.addColorStop(.4, 'rgba(39,54,42,.16)'); gradient.addColorStop(1, 'rgba(39,54,42,0)');
  ctx.fillStyle = gradient; ctx.fillRect(0, 0, 64, 64);
  const texture = new THREE.CanvasTexture(canvas);
  const shadowMesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false }), shadows.length);
  shadows.forEach(([x, z, w, d], i) => {
    dummy.position.set(x, .125, z); dummy.rotation.set(-Math.PI / 2, 0, 0); dummy.scale.set(w, d, 1); dummy.updateMatrix(); shadowMesh.setMatrixAt(i, dummy.matrix);
  });
  scene.add(shadowMesh);
  return { rooms, homes, spaces, circulation, wayfinding, bounds: { minX: -42, maxX: 42, minZ: -22, maxZ: 38, maxY: 5.2 }, sharedSpaces: spaces.map(s=>({...s,y:.25})) };
}

