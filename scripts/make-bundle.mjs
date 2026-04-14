#!/usr/bin/env node
/**
 * make-bundle.mjs
 *
 * Concatenates all tracked text/source files into a single bundle.txt
 * with clear delimiters, suitable for ingestion by AI assistants.
 *
 * Usage:
 *   node scripts/make-bundle.mjs [--out <path>] [--dirs <comma-separated>]
 *
 * Options:
 *   --out   Output file path (default: bundle.txt at repo root)
 *   --dirs  Comma-separated list of directories to include
 *           (default: apps,services,components,hooks,electron,public,scripts + root configs)
 *
 * Format:
 *   --- FILE: path/to/file ---
 *   <file contents>
 *   (blank line separator between files)
 *
 * The same exclusion rules as make-manifest.mjs apply.
 */

import { execSync } from 'child_process';
import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

// Parse CLI args
const args = process.argv.slice(2);
const outIndex = args.indexOf('--out');
const outPath = outIndex !== -1 ? resolve(args[outIndex + 1]) : resolve(ROOT, 'bundle.txt');

// Binary/non-text extensions to exclude (same as make-manifest)
const EXCLUDED_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.svg',
  '.mp4', '.mp3', '.wav', '.ogg', '.webm',
  '.woff', '.woff2', '.ttf', '.otf', '.eot',
  '.pdf', '.db', '.sqlite', '.sqlite3',
  '.zip', '.tar', '.gz', '.7z',
  '.exe', '.bin', '.so', '.dylib', '.dll',
]);

const EXCLUDED_NAMES = new Set([
  'package-lock.json',
  'yarn.lock',
  'pnpm-lock.yaml',
  '.DS_Store',
  'Thumbs.db',
  // Generated artifacts — excluded to avoid self-referential bundles
  'bundle.txt',
  'ai-setup.json',
  // Meta-documentation about the bundle itself — excluded to avoid false delimiters
  'README_OFFLINE.md',
]);

const EXCLUDED_DIRS = ['node_modules/', 'dist/', 'dist-electron/', '.git/', 'uploads/'];

function shouldExclude(filePath) {
  for (const dir of EXCLUDED_DIRS) {
    if (filePath.startsWith(dir) || filePath.includes('/' + dir)) return true;
  }
  const basename = filePath.split('/').pop() || '';
  if (EXCLUDED_NAMES.has(basename)) return true;
  const dot = basename.lastIndexOf('.');
  if (dot !== -1) {
    const ext = basename.slice(dot).toLowerCase();
    if (EXCLUDED_EXTENSIONS.has(ext)) return true;
  }
  return false;
}

// Directories/files to prioritise in the bundle
// Root-level files: configs + docs
const ROOT_FILES = [
  'README.md', 'README_OFFLINE.md', 'package.json', 'tsconfig.json',
  'vite.config.ts', 'tailwind.config.js', 'postcss.config.js',
  'index.html', 'index.tsx', 'index.css', 'App.tsx', 'types.ts',
  'vite-env.d.ts', '.env.example', '.gitignore',
];

// Priority directory prefixes (included in full)
const PRIORITY_DIRS = [
  'components/',
  'services/',
  'hooks/',
  'apps/',
  'electron/',
  'scripts/',
  'public/',
  'static-demo/',
  'seed/',
];

// Get all tracked files
const allFiles = execSync('git ls-files', { cwd: ROOT })
  .toString()
  .trim()
  .split('\n')
  .filter(Boolean)
  .filter(p => !shouldExclude(p));

// Build ordered list: root files first, then priority dirs, then anything remaining
const seen = new Set();
const ordered = [];

for (const name of ROOT_FILES) {
  if (allFiles.includes(name) && !seen.has(name)) {
    ordered.push(name);
    seen.add(name);
  }
}

for (const prefix of PRIORITY_DIRS) {
  for (const f of allFiles) {
    if (f.startsWith(prefix) && !seen.has(f)) {
      ordered.push(f);
      seen.add(f);
    }
  }
}

// Add anything not yet included
for (const f of allFiles) {
  if (!seen.has(f)) {
    ordered.push(f);
    seen.add(f);
  }
}

// Build bundle
const header = [
  '================================================================================',
  'UserMap — Source Bundle',
  `Generated: ${new Date().toISOString()}`,
  `Files: ${ordered.length}`,
  '',
  'Format: Each file is preceded by a delimiter line:',
  '  --- FILE: path/to/file ---',
  'To reconstruct, split on these delimiters and write each block to its path.',
  '================================================================================',
  '',
].join('\n');

const sections = [];
let skipped = 0;

for (const filePath of ordered) {
  const absPath = resolve(ROOT, filePath);
  let content;
  try {
    content = readFileSync(absPath, 'utf8');
  } catch {
    // File unreadable (e.g., binary despite extension check) — skip
    skipped++;
    continue;
  }
  // Final binary guard: if file contains null bytes it's binary
  if (content.includes('\0')) {
    skipped++;
    continue;
  }
  sections.push(`--- FILE: ${filePath} ---\n${content}`);
}

const bundle = header + sections.join('\n\n') + '\n';
writeFileSync(outPath, bundle);

console.log(`✅ bundle.txt written`);
console.log(`   Files: ${sections.length} included, ${skipped} skipped (binary)`);
console.log(`   Size: ${(bundle.length / 1024).toFixed(1)} KB`);
console.log(`   Output: ${outPath}`);
