// The arena: a round neon rooftop at night, with an energy fence at the edge and a skyline all the way
// round, since the camera can face any direction. Everything is generated in code, no image files.

import * as THREE from 'three';
import { ARENA_R } from '../sim/constants';

const R = ARENA_R / 10000;

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

export interface Stage {
  key: THREE.DirectionalLight;
  // brightens the fence segment nearest a point (wall splats)
  flashFence(x: number, z: number): void;
  update(frames: number): void;
}

export function buildStage(scene: THREE.Scene): Stage {
  scene.background = new THREE.Color('#07060f');
  scene.fog = new THREE.Fog('#0b0818', 22, 90);

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
  scene.add(new THREE.Mesh(new THREE.SphereGeometry(120, 32, 16), new THREE.MeshBasicMaterial({ map: sky, side: THREE.BackSide, fog: false })));
  const moon = new THREE.Mesh(new THREE.CircleGeometry(4, 48), new THREE.MeshBasicMaterial({ color: '#ffd9b8', fog: false }));
  moon.position.set(-30, 26, -80);
  moon.lookAt(0, 0, 0);
  scene.add(moon);

  // the platform: dark tiles with glowing seams in rings and spokes
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
    g.strokeStyle = 'rgba(255,60,210,0.45)';
    g.lineWidth = 3;
    for (const r of [140, 300, 460]) {
      g.beginPath();
      g.arc(512, 512, r, 0, Math.PI * 2);
      g.stroke();
    }
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      g.beginPath();
      g.moveTo(512 + Math.cos(a) * 140, 512 + Math.sin(a) * 140);
      g.lineTo(512 + Math.cos(a) * 500, 512 + Math.sin(a) * 500);
      g.stroke();
    }
  });
  const floor = new THREE.Mesh(new THREE.CircleGeometry(R + 0.6, 96), new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.42, metalness: 0.25 }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);
  // the platform's edge, dropping away into the city
  const rim = new THREE.Mesh(new THREE.CylinderGeometry(R + 0.6, R + 0.9, 2.5, 96, 1, true), new THREE.MeshStandardMaterial({ color: '#1a1530', roughness: 0.6, metalness: 0.4 }));
  rim.position.y = -1.25;
  scene.add(rim);
  const centre = new THREE.Mesh(new THREE.RingGeometry(1.25, 1.33, 96), new THREE.MeshBasicMaterial({ color: '#5ff2ff', transparent: true, opacity: 0.5 }));
  centre.rotation.x = -Math.PI / 2;
  centre.position.y = 0.004;
  scene.add(centre);

  // the energy fence: posts and a glowing band, low enough for the camera to see over
  const postMat = new THREE.MeshStandardMaterial({ color: '#1a1530', emissive: '#ff3cd2', emissiveIntensity: 0.3, roughness: 0.3, metalness: 0.6 });
  const segments = 32;
  const bandMats: THREE.MeshBasicMaterial[] = [];
  const flash = new Float32Array(segments);
  for (let i = 0; i < segments; i++) {
    const a0 = (i / segments) * Math.PI * 2;
    const a1 = ((i + 1) / segments) * Math.PI * 2;
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 1.1, 8), postMat);
    post.position.set(Math.cos(a0) * (R + 0.15), 0.55, Math.sin(a0) * (R + 0.15));
    post.castShadow = true;
    scene.add(post);
    const mat = new THREE.MeshBasicMaterial({ color: '#ff3cd2', transparent: true, opacity: 0.08, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending });
    bandMats.push(mat);
    const band = new THREE.Mesh(new THREE.CylinderGeometry(R + 0.15, R + 0.15, 0.75, 4, 1, true, Math.PI / 2 - a1, a1 - a0), mat);
    band.position.y = 0.6;
    scene.add(band);
  }
  const topRing = new THREE.Mesh(new THREE.TorusGeometry(R + 0.15, 0.025, 6, 160), new THREE.MeshBasicMaterial({ color: '#ff7ae0' }));
  topRing.rotation.x = Math.PI / 2;
  topRing.position.y = 1.1;
  scene.add(topRing);

  // the skyline, all the way round
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
  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 110; i++) {
    const w = 2 + rnd() * 4;
    const h = 6 + rnd() * 26;
    const d = 2 + rnd() * 4;
    const map = windows.clone();
    map.repeat.set(Math.max(1, Math.round(w / 1.2)), Math.max(1, Math.round(h / 2.4)));
    map.needsUpdate = true;
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshBasicMaterial({ map, color: '#c7b8ff' }));
    const a = rnd() * Math.PI * 2;
    const dist = 26 + rnd() * 34;
    b.position.set(Math.cos(a) * dist, h / 2 - 10, Math.sin(a) * dist);
    b.rotation.y = -a;
    scene.add(b);
  }
  // neon signs on a few rooftops
  const sign = (text: string, color: string) =>
    canvasTexture(1024, 256, (g) => {
      g.font = 'bold 170px "Arial Black", Impact, sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.shadowColor = color;
      g.shadowBlur = 40;
      g.fillStyle = color;
      g.fillText(text, 512, 132);
      g.shadowBlur = 0;
      g.strokeStyle = '#ffffff';
      g.lineWidth = 4;
      g.strokeText(text, 512, 132);
    });
  for (const [text, color, a] of [
    ['FIGHTME', '#ff7ae0', 0.4],
    ['ARENA', '#5ff2ff', 2.6],
    ['FIGHTME', '#ffd34d', 4.4],
  ] as const) {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(11, 2.75), new THREE.MeshBasicMaterial({ map: sign(text, color), transparent: true, depthWrite: false, fog: false }));
    mesh.position.set(Math.cos(a) * 30, 9, Math.sin(a) * 30);
    mesh.lookAt(0, 9, 0);
    scene.add(mesh);
  }

  // lights
  scene.add(new THREE.HemisphereLight('#8a7dff', '#1d0f22', 0.7));
  const key = new THREE.DirectionalLight('#fff1e0', 2.4);
  key.position.set(4, 12, 7);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  for (const k of ['left', 'bottom'] as const) key.shadow.camera[k] = -R - 1;
  for (const k of ['right', 'top'] as const) key.shadow.camera[k] = R + 1;
  key.shadow.camera.near = 1;
  key.shadow.camera.far = 40;
  key.shadow.bias = -0.0004;
  scene.add(key);
  scene.add(key.target);
  const rimL = new THREE.DirectionalLight('#ff3cd2', 1.3);
  rimL.position.set(-8, 4, -6);
  scene.add(rimL);
  const rimR = new THREE.DirectionalLight('#38d9ff', 1.3);
  rimR.position.set(8, 4, -6);
  scene.add(rimR);

  return {
    key,
    flashFence(x: number, z: number) {
      let a = Math.atan2(z, x);
      if (a < 0) a += Math.PI * 2;
      const i = Math.floor((a / (Math.PI * 2)) * segments) % segments;
      for (const d of [-1, 0, 1]) flash[(i + d + segments) % segments] = d === 0 ? 1 : 0.6;
    },
    update(frames: number) {
      for (let i = 0; i < segments; i++) {
        if (flash[i] > 0) flash[i] = Math.max(0, flash[i] - frames * 0.03);
        bandMats[i].opacity = 0.08 + flash[i] * 0.7;
      }
    },
  };
}
