import { existsSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { AMBIENCE, AUDIO_CLIPS, VOICE_CLIPS } from '../src/game/core/audioManifest.js';

const definitions = [
  ...Object.values(AUDIO_CLIPS).map(({ path }) => path),
  ...Object.values(VOICE_CLIPS),
  ...Object.values(AMBIENCE).map(({ path }) => path),
  'assets/images/stadium-panorama.webp',
];

describe('public asset manifest', () => {
  it.each(definitions)('%s exists and is nonempty', (relativePath) => {
    const absolutePath = resolve('public', relativePath);
    expect(existsSync(absolutePath)).toBe(true);
    expect(statSync(absolutePath).size).toBeGreaterThan(500);
  });
});
