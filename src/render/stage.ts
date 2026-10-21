// The arena: a neon rooftop at night. Everything is generated in code, no image files.

import * as THREE from 'three';
import { STAGE_HALF } from '../sim/constants';

const WALL_X = STAGE_HALF / 10000;

function canvasTexture(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

export function buildStage(scene: THREE.Scene) {
  scene.background = new THREE.Color('#07060f');
  scene.fog = new THREE.Fog('#0b0818', 14, 60);

  // sky
  const sky = canvasTexture(16, 512, (g) => {
    const grad = g.createLinearGradient(0, 0, 0, 512);
    grad.addColorStop(0, '#05040c');
    grad.addColorStop(0.55, '#1c0f3a');
    grad.addColorStop(0.8, '#5a1d5e');
    grad.addColorStop(1, '#ff6a3d');
    g.fillStyle = grad;
    g.fillRect(0, 0, 16, 512);
  });
  const skyMesh = new THREE.Mesh(new THREE.SphereGeometry(80, 32, 16), new THREE.MeshBasicMaterial({ map: sky, side: THREE.BackSide, fog: false }));
  scene.add(skyMesh);
  const moon = new THREE.Mesh(new THREE.CircleGeometry(3.2, 48), new THREE.MeshBasicMaterial({ color: '#ffd9b8', fog: false }));
  moon.position.set(-14, 16, -55);
  scene.add(moon);

  // floor: dark tiles with glowing seams and a centre ring
  const floorTex = canvasTexture(1024, 1024, (g) => {
    g.fillStyle = '#14121d';
    g.fillRect(0, 0, 1024, 1024);
    for (let i = 0; i < 16; i++) {
      for (let j = 0; j < 16; j++) {
        const v = 18 + ((i * 7 + j * 13) % 9);
        g.fillStyle = `rgb(${v},${v - 2},${v + 8})`;
        g.fillRect(i * 64 + 2, j * 64 + 2, 60, 60);
      }
    }
    g.strokeStyle = 'rgba(255,60,210,0.55)';
    g.lineWidth = 3;
    for (let i = 0; i <= 16; i += 4) {
      g.beginPath();
      g.moveTo(i * 64, 0);
      g.lineTo(i * 64, 1024);
      g.stroke();
    }
  });
  floorTex.wrapS = floorTex.wrapT = THREE.RepeatWrapping;
  floorTex.repeat.set(3, 1.5);
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(24, 12),
    new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.42, metalness: 0.25 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.z = -1.5;
  floor.receiveShadow = true;
  scene.add(floor);

  const ring = new THREE.Mesh(new THREE.RingGeometry(1.9, 1.98, 96), new THREE.MeshBasicMaterial({ color: '#ff3cd2', transparent: true, opacity: 0.55 }));
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.004;
  scene.add(ring);
  const line = new THREE.Mesh(new THREE.PlaneGeometry(WALL_X * 2, 0.04), new THREE.MeshBasicMaterial({ color: '#5ff2ff', transparent: true, opacity: 0.4 }));
  line.rotation.x = -Math.PI / 2;
  line.position.set(0, 0.005, 0.9);
  scene.add(line);

  // the walls at the stage edges: glowing barriers you can be splatted against
  const barrierMat = new THREE.MeshStandardMaterial({ color: '#1a1530', emissive: '#ff3cd2', emissiveIntensity: 0.25, roughness: 0.3, metalness: 0.6, transparent: true, opacity: 0.85 });
  const glowMat = new THREE.MeshBasicMaterial({ color: '#ff3cd2' });
  for (const s of [-1, 1]) {
    const x = s * (WALL_X + 0.05);
    const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.18, 2.6, 0.18), barrierMat);
    pillar.position.set(x, 1.3, 0.7);
    pillar.castShadow = true;
    scene.add(pillar);
    const pillar2 = pillar.clone();
    pillar2.position.z = -1.2;
    scene.add(pillar2);
    const panel = new THREE.Mesh(
      new THREE.PlaneGeometry(1.9, 2.4),
      new THREE.MeshBasicMaterial({ color: '#ff3cd2', transparent: true, opacity: 0.08, side: THREE.DoubleSide, depthWrite: false }),
    );
    panel.rotation.y = Math.PI / 2;
    panel.position.set(x, 1.2, -0.25);
    scene.add(panel);
    for (const y of [0.05, 2.6]) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.04, 1.95), glowMat);
      bar.position.set(x, y, -0.25);
      scene.add(bar);
    }
  }

  // skyline
  const windows = canvasTexture(64, 128, (g) => {
    g.fillStyle = '#0d0b18';
    g.fillRect(0, 0, 64, 128);
    for (let y = 4; y < 128; y += 8) {
      for (let x = 4; x < 64; x += 8) {
        const r = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
        if (r - Math.floor(r) > 0.62) {
          g.fillStyle = r - Math.floor(r) > 0.9 ? '#ff9de6' : '#ffd38a';
          g.fillRect(x, y, 4, 4);
        }
      }
    }
  });
  windows.wrapS = windows.wrapT = THREE.RepeatWrapping;
  const bmat = new THREE.MeshBasicMaterial({ map: windows, color: '#c7b8ff' });
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 70; i++) {
    const w = 1.5 + rnd() * 3;
    const h = 4 + rnd() * 18;
    const d = 1.5 + rnd() * 3;
    const geo = new THREE.BoxGeometry(w, h, d);
    const mat = bmat.clone();
    mat.map = windows.clone();
    mat.map.repeat.set(Math.max(1, Math.round(w / 1.2)), Math.max(1, Math.round(h / 2.4)));
    mat.map.needsUpdate = true;
    const b = new THREE.Mesh(geo, mat);
    const row = i % 3;
    b.position.set((rnd() - 0.5) * 90, h / 2 - 6, -18 - row * 9 - rnd() * 6);
    scene.add(b);
  }
  // a big neon sign
  const sign = canvasTexture(1024, 256, (g) => {
    g.clearRect(0, 0, 1024, 256);
    g.font = 'bold 170px "Arial Black", Impact, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.shadowColor = '#ff3cd2';
    g.shadowBlur = 40;
    g.fillStyle = '#ff7ae0';
    g.fillText('FIGHTME', 512, 132);
    g.shadowBlur = 0;
    g.strokeStyle = '#ffffff';
    g.lineWidth = 4;
    g.strokeText('FIGHTME', 512, 132);
  });
  const signMesh = new THREE.Mesh(new THREE.PlaneGeometry(9, 2.25), new THREE.MeshBasicMaterial({ map: sign, transparent: true, depthWrite: false, fog: false }));
  signMesh.position.set(10.5, 4.6, -19);
  signMesh.rotation.y = -0.35;
  scene.add(signMesh);

  // lights
  scene.add(new THREE.HemisphereLight('#8a7dff', '#1d0f22', 0.65));
  const key = new THREE.DirectionalLight('#fff1e0', 2.4);
  key.position.set(2.5, 7, 6);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = -7;
  key.shadow.camera.right = 7;
  key.shadow.camera.top = 6;
  key.shadow.camera.bottom = -2;
  key.shadow.camera.near = 1;
  key.shadow.camera.far = 25;
  key.shadow.bias = -0.0004;
  scene.add(key);
  scene.add(key.target);
  const rimL = new THREE.DirectionalLight('#ff3cd2', 1.4);
  rimL.position.set(-6, 3, -4);
  scene.add(rimL);
  const rimR = new THREE.DirectionalLight('#38d9ff', 1.4);
  rimR.position.set(6, 3, -4);
  scene.add(rimR);
  return { key };
}
