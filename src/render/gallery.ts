// Debug view (open with ?poses): every pose in the library on a grid of mannequins, side-on like in a fight.
// Used to tune poses; not part of the game.

import * as THREE from 'three';
import { POSES } from './poses';
import { PALETTES, buildMannequin, newSolved, solve } from './rig';

export function showGallery(canvas: HTMLCanvasElement, filter?: string) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(1);
  const w = canvas.clientWidth || window.innerWidth;
  const h = canvas.clientHeight || window.innerHeight;
  renderer.setSize(w, h, false);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#1b1830');
  scene.add(new THREE.HemisphereLight('#ffffff', '#443355', 1.4));
  const sun = new THREE.DirectionalLight('#ffffff', 2);
  sun.position.set(3, 6, 8);
  scene.add(sun);
  const names = Object.keys(POSES).filter((n) => !filter || filter.split(',').includes(n));
  const cols = Math.ceil(Math.sqrt(names.length * 1.6));
  const solved = newSolved();
  names.forEach((name, i) => {
    const rig = buildMannequin(PALETTES[i % PALETTES.length]);
    solve(POSES[name], solved);
    rig.apply(solved);
    const g = new THREE.Group();
    g.add(rig.root);
    rig.root.rotation.y = (65 * Math.PI) / 180;
    const c = i % cols;
    const r = Math.floor(i / cols);
    g.position.set(c * 1.5, -r * 2.5, 0);
    scene.add(g);
    const label = document.createElement('div');
    label.textContent = name;
    label.style.cssText = 'position:fixed;color:#fff;font:12px monospace;pointer-events:none';
    label.dataset.x = String(c * 1.5);
    label.dataset.y = String(-r * 2.5 - 0.15);
    document.body.appendChild(label);
  });
  const rows = Math.ceil(names.length / cols);
  const aspect = w / h;
  const vw = Math.max(cols * 1.5 + 0.1, rows * 2.5 * aspect);
  const vh = vw / aspect;
  const camera = new THREE.OrthographicCamera(-0.8, -0.8 + vw, 2.2, 2.2 - vh, 0.1, 50);
  camera.position.set(0, 0, 10);
  camera.updateProjectionMatrix();
  renderer.render(scene, camera);
  for (const label of document.querySelectorAll<HTMLDivElement>('div[data-x]')) {
    const v = new THREE.Vector3(Number(label.dataset.x), Number(label.dataset.y), 0).project(camera);
    label.style.left = `${((v.x + 1) / 2) * w - 30}px`;
    label.style.top = `${((1 - v.y) / 2) * h}px`;
  }
}
