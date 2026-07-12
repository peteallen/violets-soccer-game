# Violet's USA Soccer

A cheerful, touch-first five-minute soccer game made for Violet. She plays as number 6 for a USA-inspired national team in a small-sided match designed to feel exciting, readable, and forgiving on a tablet.

The game is currently under active development.

## Local development

```bash
npm install
npm run dev
```

Open `http://localhost:5173` in a landscape browser. Run `npm run build` for the production bundle and `npm test` for deterministic gameplay checks.

## Product principles

The match should be playable without reading. Touches receive immediate feedback, teammates keep the game moving, mistakes recover quickly, and the opposition offers real resistance without dominating a young player. The game uses vector-first Canvas 2D artwork and offline-generated audio or raster assets so no service credentials are shipped to the browser.

