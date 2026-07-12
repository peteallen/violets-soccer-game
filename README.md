# Violet's USA Soccer

A cheerful, touch-first five-minute soccer game made for Violet. She plays as number 6 for a USA-inspired national team in a small-sided match designed to feel exciting, readable, and forgiving on a tablet.

Play the current version at [peteallen.github.io/violets-soccer-game](https://peteallen.github.io/violets-soccer-game/).

## How to play

Choose one of the three colorful opponent teams and tap the large play button. Tap or drag on the grass to move the USA player marked by the glowing star. When USA has the ball, tap a teammate to pass, or tap the opponent's goal to shoot. The ball can also be swiped toward the goal for a more directional shot. When the other team has the ball, tap its ball carrier to chase and tackle automatically.

Each match has five minutes of active play. There are no fouls, offside calls, throw-ins, unlocks, or menus during the match. The ball rebounds from the sidelines, goalkeepers act automatically, and play restarts quickly after a goal. The score is honest, but every result ends with a friendly celebration and an immediate replay option.

## Local development

```bash
npm install
npm run dev
```

Open `http://localhost:5173` in a landscape browser. Run `npm run build` for the production bundle and `npm test` for deterministic gameplay checks.

## Product principles

The match should be playable without reading. Touches receive immediate feedback, teammates keep the game moving, mistakes recover quickly, and the opposition offers real resistance without dominating a young player. The game uses vector-first Canvas 2D artwork and offline-generated audio or raster assets so no service credentials are shipped to the browser.

## Art and audio

All gameplay artwork—players, animation, ball, goals, flags, pitch, effects, and interface—is drawn as responsive Canvas 2D vector graphics. The only raster game asset is the distant stadium panorama under `public/assets/images`; it was generated through OpenRouter with `google/gemini-3.1-flash-lite-image`. Its exact prompt, source PNG, and reproducible generator live under `art` and `scripts/generate_stadium.py`.

The original music, voice lines, crowd ambience, whistle, kicks, saves, goal cheer, and interface sound were generated offline with ElevenLabs. The reproducible generator is `scripts/generate_audio.mjs`. Generation scripts read credentials from the local environment; API keys are never included in the browser bundle or repository.

## Deployment

Every push to `main` runs the deterministic match and asset tests, builds the Vite production bundle, and publishes it through GitHub Pages. The public game uses relative asset paths so it can be served safely from the repository subpath.
