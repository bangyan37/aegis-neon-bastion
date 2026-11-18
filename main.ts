// AEGIS — Neon Bastion: the entry program for best-game-01 (Node 22, standard library only).
//
// The game itself is game/index.html — one self-contained file, no libraries, no assets, no
// network — and this program hands it in: it copies game/ and screenshots/ into the output
// directory, verifies the package against the scorer's caps before writing anything final
// (so a broken package fails here, in the open, instead of at the judge), and writes
// dossier.json with the vendored make.fun library.
//
// Run it the way the grader does, or locally with an output directory of your own:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
// Play the game itself with `node serve.ts` and a browser at http://localhost:8080.

import { cpSync, existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// The scorer's caps, checked up front: at most 4 screenshots of at most 256 KiB each, and a
// game tree of at most 993 files / 48 MiB with no path over 1000 bytes.
const CAPS = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
};

function fail(message: string): never {
  throw new Error(`aegis entry: ${message}`);
}

function walk(dir: string, base: string, acc: Array<{ path: string; bytes: number }>): void {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const rel = base === '' ? name : `${base}/${name}`;
    const st = statSync(full);
    if (st.isDirectory()) walk(full, rel, acc);
    else acc.push({ path: rel, bytes: st.size });
  }
}

function verifyPackage(): { gameFiles: number; gameBytes: number; shots: number } {
  const gameDir = join(here, 'game');
  if (!existsSync(join(gameDir, 'index.html'))) fail('game/index.html is missing');
  const files: Array<{ path: string; bytes: number }> = [];
  walk(gameDir, '', files);
  if (files.length > CAPS.game_max_files) fail(`game/ holds ${files.length} files, over the ${CAPS.game_max_files} cap`);
  const gameBytes = files.reduce((sum, f) => sum + f.bytes, 0);
  if (gameBytes > CAPS.game_max_bytes) fail(`game/ is ${gameBytes} bytes, over the ${CAPS.game_max_bytes} cap`);
  for (const f of files) {
    if (Buffer.byteLength(f.path) > CAPS.game_path_max_bytes) fail(`game path too long: ${f.path}`);
  }
  const shotDir = join(here, 'screenshots');
  const shots = existsSync(shotDir)
    ? readdirSync(shotDir).filter((n) => /\.(png|jpe?g)$/i.test(n)).sort()
    : [];
  if (shots.length < 3 || shots.length > CAPS.screenshots.max) {
    fail(`screenshots/ holds ${shots.length} images; the dossier wants 3 or 4`);
  }
  for (const name of shots) {
    const bytes = statSync(join(shotDir, name)).size;
    if (bytes > CAPS.screenshots.max_bytes) fail(`screenshot ${name} is ${bytes} bytes, over the 256 KiB cap`);
  }
  return { gameFiles: files.length, gameBytes, shots: shots.length };
}

const summary = verifyPackage();

mkdirSync(out, { recursive: true });
cpSync(join(here, 'game'), join(out, 'game'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });

const dossier = buildDossier(out, CAPS);
writeFileSync(join(out, 'dossier.json'), dossier);

console.log(
  `aegis entry: ${summary.gameFiles} game file(s), ${summary.gameBytes} bytes, ` +
    `${summary.shots} screenshots, dossier ${dossier.byteLength} bytes -> ${out}`,
);
