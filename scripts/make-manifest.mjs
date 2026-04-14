#!/usr/bin/env node
/**
 * make-manifest.mjs
 *
 * Generates ai-setup.json — a flat manifest of every tracked text/source file
 * with its corresponding raw.githubusercontent.com URL.
 *
 * Usage:
 *   node scripts/make-manifest.mjs [--ref <branch|SHA>]
 *
 * Options:
 *   --ref   Git ref to pin URLs to (default: current HEAD SHA for determinism).
 *           Use `--ref main` to pin to branch name instead.
 *
 * Output: ai-setup.json at repo root
 *
 * Excluded by default (documented):
 *   - Binary/media files: .png .jpg .jpeg .gif .webp .ico .svg .mp4 .mp3
 *     .woff .woff2 .ttf .otf .eot .pdf
 *   - Lock files: package-lock.json (large, auto-generated)
 *   - Build artifacts: dist/, dist-electron/, node_modules/
 *   - Database files: .db .sqlite
 */

import { execSync } from 'child_process';
import { writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

// Parse CLI args
const args = process.argv.slice(2);
const refIndex = args.indexOf('--ref');
let ref = refIndex !== -1 ? args[refIndex + 1] : null;

// Default: use HEAD SHA for deterministic URLs
if (!ref) {
  ref = execSync('git rev-parse HEAD', { cwd: ROOT }).toString().trim();
}

const OWNER = 'mhkr9100';
const REPO = 'UserMap';
const BASE_URL = `https://raw.githubusercontent.com/${OWNER}/${REPO}/${ref}`;

// Binary/non-text extensions to exclude
const EXCLUDED_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.svg',
  '.mp4', '.mp3', '.wav', '.ogg', '.webm',
  '.woff', '.woff2', '.ttf', '.otf', '.eot',
  '.pdf', '.db', '.sqlite', '.sqlite3',
  '.zip', '.tar', '.gz', '.7z',
  '.exe', '.bin', '.so', '.dylib', '.dll',
]);

// Filename patterns to exclude
const EXCLUDED_NAMES = new Set([
  'package-lock.json',
  'yarn.lock',
  'pnpm-lock.yaml',
  '.DS_Store',
  'Thumbs.db',
  // Generated artifacts — excluded to keep manifest focused on source files
  'bundle.txt',
  'ai-setup.json',
]);

// Directory prefixes to exclude
const EXCLUDED_DIRS = ['node_modules/', 'dist/', 'dist-electron/', '.git/', 'uploads/'];

function shouldExclude(filePath) {
  // Check excluded directories
  for (const dir of EXCLUDED_DIRS) {
    if (filePath.startsWith(dir) || filePath.includes('/' + dir)) return true;
  }
  // Check excluded filenames
  const basename = filePath.split('/').pop() || '';
  if (EXCLUDED_NAMES.has(basename)) return true;
  // Check excluded extensions
  const dot = basename.lastIndexOf('.');
  if (dot !== -1) {
    const ext = basename.slice(dot).toLowerCase();
    if (EXCLUDED_EXTENSIONS.has(ext)) return true;
  }
  return false;
}

// Get all tracked files from git
const allFiles = execSync('git ls-files', { cwd: ROOT })
  .toString()
  .trim()
  .split('\n')
  .filter(Boolean);

const files = allFiles
  .filter(p => !shouldExclude(p))
  .map(path => ({
    path,
    url: `${BASE_URL}/${path}`,
  }));

const manifest = {
  owner: OWNER,
  repo: REPO,
  ref,
  generatedAt: new Date().toISOString(),
  excludedPatterns: {
    extensions: [...EXCLUDED_EXTENSIONS],
    filenames: [...EXCLUDED_NAMES],
    directories: EXCLUDED_DIRS,
    notes: 'Binary assets, lock files, build artifacts, and database files are excluded to keep the manifest focused on readable source.',
  },
  fileCount: files.length,
  files,
};

const outPath = resolve(ROOT, 'ai-setup.json');
writeFileSync(outPath, JSON.stringify(manifest, null, 2) + '\n');

console.log(`✅ ai-setup.json written with ${files.length} files (ref: ${ref})`);
console.log(`   Output: ${outPath}`);
