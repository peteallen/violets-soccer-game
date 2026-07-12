#!/usr/bin/env node

import { existsSync, renameSync, statSync, unlinkSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const elevenLabsScripts = resolve(
  homedir(),
  ".codex/skills/elevenlabs/scripts",
);
const force = process.argv.includes("--force");

const voice = {
  id: "FGY2WhTYpPnrIDTdsKH5",
  model: "eleven_multilingual_v2",
  lines: [
    ["lets_go_usa.mp3", "Let’s go, USA!"],
    ["tap_grass.mp3", "Tap the grass to run!"],
    ["tap_teammate.mp3", "Tap a teammate to pass!"],
    ["tap_kick.mp3", "Tap the kick button to shoot!"],
    ["great_pass.mp3", "Great pass!"],
    ["goal_usa.mp3", "Goal! Go, USA!"],
    ["great_save.mp3", "What a save!"],
    ["usa_wins.mp3", "USA wins! What a game!"],
    ["great_playing.mp3", "Great playing, USA!"],
  ],
};

const soundEffects = [
  [
    "kick.mp3",
    "One short, solid soccer ball kick on natural grass. Crisp foot impact and ball thump, close-up, clean, playful sports game sound, no voices, no crowd, no music, no echo.",
    0.5,
  ],
  [
    "whistle.mp3",
    "One short, clear soccer referee whistle blast. Friendly daytime youth match, clean isolated sound, no voices, no crowd, no music, no echo.",
    0.8,
  ],
  [
    "save.mp3",
    "Soccer goalkeeper gloves firmly catching a fast ball: one satisfying padded thump with a tiny leather rustle. Close-up, clean isolated sound, no voices, no crowd, no whistle, no music.",
    0.6,
  ],
  [
    "goal_crowd.mp3",
    "A joyful, family-friendly small stadium crowd erupting for a soccer goal, followed by a brief rhythmic USA chant. Excited children and adults, celebratory but not overwhelming, no whistle, no announcer, no music.",
    4,
  ],
  [
    "crowd_loop.mp3",
    "Steady friendly ambience from a small family soccer stadium during ordinary play. Warm crowd murmur, occasional soft claps, spacious outdoor field. Even volume and loop-friendly texture, with no whistles, no sudden cheers, no chants, no announcements, no music.",
    12,
  ],
  [
    "ui_tap.mp3",
    "One bright, soft, tactile menu tap for a cheerful children’s game. A tiny rounded wooden click with a subtle sparkle, gentle and satisfying, exactly one isolated hit, no voice, no music, no reverb tail.",
    0.5,
  ],
];

const music = {
  file: "stadium_loop.mp3",
  lengthMs: 45_000,
  prompt:
    "An upbeat, original, family-friendly stadium pop instrumental for a colorful children’s soccer game. Catchy joyful melody, handclaps, light drums, warm bass, and playful brass accents. Energetic and encouraging but never aggressive. No vocals, no chanting, no copyrighted melody, and do not imitate any artist or existing song. Maintain an even game-friendly mix with a clean, loop-friendly start and ending that connect naturally.",
};

function outputPath(folder, file) {
  return resolve(repoRoot, "public/assets", folder, file);
}

function shouldGenerate(file) {
  return force || !existsSync(file) || statSync(file).size === 0;
}

function run(script, args) {
  const result = spawnSync(process.execPath, [resolve(elevenLabsScripts, script), ...args], {
    cwd: repoRoot,
    stdio: "inherit",
  });

  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${script} exited with status ${result.status}`);
  }
}

for (const [file, text] of voice.lines) {
  const out = outputPath("voice", file);
  if (!shouldGenerate(out)) {
    process.stdout.write(`Skipping existing ${out}\n`);
    continue;
  }

  run("tts_to_file.mjs", [
    "--voice_id",
    voice.id,
    "--model_id",
    voice.model,
    "--text",
    text,
    "--stability",
    "0.4",
    "--similarity_boost",
    "0.8",
    "--style",
    "0.55",
    "--speaker_boost",
    "true",
    "--out",
    out,
  ]);
}

for (const [file, text, duration] of soundEffects) {
  const out = outputPath("sfx", file);
  if (!shouldGenerate(out)) {
    process.stdout.write(`Skipping existing ${out}\n`);
    continue;
  }

  const generatedOut =
    file === "ui_tap.mp3" ? outputPath("sfx", ".ui_tap_full.mp3") : out;

  run("sfx_to_file.mjs", [
    "--text",
    text,
    "--duration_seconds",
    String(duration),
    "--prompt_influence",
    "0.65",
    "--out",
    generatedOut,
  ]);

  // ElevenLabs sound effects accept a minimum duration of 0.5 seconds. Trim
  // the generated menu tap to the requested 0.35 seconds with system ffmpeg.
  if (file === "ui_tap.mp3" && !process.argv.includes("--skip-trim")) {
    const result = spawnSync(
      "ffmpeg",
      [
        "-y",
        "-i",
        generatedOut,
        "-t",
        "0.35",
        "-c:a",
        "libmp3lame",
        "-q:a",
        "2",
        out,
      ],
      { cwd: repoRoot, stdio: "inherit" },
    );
    if (result.error) throw result.error;
    if (result.status !== 0) {
      throw new Error(`ffmpeg exited with status ${result.status}`);
    }
    unlinkSync(generatedOut);
  } else if (generatedOut !== out) {
    renameSync(generatedOut, out);
  }
}

const musicOut = outputPath("music", music.file);
if (shouldGenerate(musicOut)) {
  run("music_to_file.mjs", [
    "--prompt",
    music.prompt,
    "--music_length_ms",
    String(music.lengthMs),
    "--out",
    musicOut,
  ]);
} else {
  process.stdout.write(`Skipping existing ${musicOut}\n`);
}

process.stdout.write("Audio generation complete.\n");
