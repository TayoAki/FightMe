import './ui/style.css';
import { Game } from './game/game';
import { showGallery } from './render/gallery';

const canvas = document.getElementById('view') as HTMLCanvasElement;
const ui = document.getElementById('ui') as HTMLElement;
const params = new URLSearchParams(location.search);
if (params.has('poses')) {
  showGallery(canvas, params.get('poses') || undefined);
} else {
  const game = new Game(canvas, ui, { low: params.has('low') });
  // handy from the browser console and for automated smoke tests
  (window as unknown as { fightme: Game }).fightme = game;
}
