import './style.css';
import { Game } from './game/Game.js';

const canvas = document.querySelector('#game');
const game = new Game(canvas);

game.start();
window.__violetSoccer = game;

if (import.meta.hot) {
  import.meta.hot.dispose(() => game.destroy());
}

