#!/usr/bin/env node
/**
 * Validates Prisma migration SQL files for PostgreSQL (no UTF-8/UTF-16 BOM).
 * Usage: node tools/validate-prisma-migrations.mjs [--fix]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, '..');
const migrationsRoot = path.join(repoRoot, 'prisma', 'migrations');
const fix = process.argv.includes('--fix');

const SQL_START = /^(--|CREATE|ALTER|DROP|INSERT|UPDATE|DELETE|BEGIN|COMMIT|SET|GRANT|REVOKE|COMMENT)/i;

function listMigrationSqlFiles(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listMigrationSqlFiles(full));
    else if (entry.name === 'migration.sql') out.push(full);
  }
  return out;
}

function stripBom(buf) {
  if (buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) {
    return { buf: buf.subarray(3), removed: 'UTF-8 BOM (EF BB BF)' };
  }
  if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xfe) {
    return { buf, removed: 'UTF-16 LE BOM' };
  }
  if (buf.length >= 2 && buf[0] === 0xfe && buf[1] === 0xff) {
    return { buf, removed: 'UTF-16 BE BOM' };
  }
  return { buf, removed: null };
}

function validateFile(filePath) {
  const rel = path.relative(repoRoot, filePath);
  let buf = fs.readFileSync(filePath);
  const errors = [];
  let changed = false;

  const { buf: stripped, removed } = stripBom(buf);
  if (removed) {
    if (fix) {
      buf = stripped;
      changed = true;
    } else {
      errors.push(removed);
    }
  } else {
    buf = stripped;
  }

  let text = buf.toString('utf8');
  if (text.charCodeAt(0) === 0xfeff) {
    if (fix) {
      text = text.slice(1);
      changed = true;
    } else {
      errors.push('Unicode BOM character U+FEFF at start of decoded text');
    }
  }

  const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  if (fix && normalized !== text) {
    text = normalized;
    changed = true;
  }

  const trimmed = text.replace(/^[\u200B\u200C\u200D\u2060\u00A0\s]*/, '');
  if (trimmed.length === 0) {
    errors.push('file is empty');
  } else if (!SQL_START.test(trimmed)) {
    const preview = [...trimmed.slice(0, 8)]
      .map((c) => `U+${c.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')}`)
      .join(' ');
    errors.push(`SQL must start with -- or a DDL keyword; got: ${preview}`);
  }

  if (fix && changed) {
    fs.writeFileSync(filePath, Buffer.from(text, 'utf8'));
  }

  return { rel, errors, changed };
}

const files = listMigrationSqlFiles(migrationsRoot);
if (files.length === 0) {
  console.error('[prisma-migrations] No migration.sql under prisma/migrations');
  process.exit(1);
}

let failed = false;
for (const file of files) {
  const { rel, errors, changed } = validateFile(file);
  if (errors.length > 0) {
    failed = true;
    console.error(`[prisma-migrations] FAIL ${rel}`);
    errors.forEach((e) => console.error(`  - ${e}`));
  } else if (changed) {
    console.log(`[prisma-migrations] fixed ${rel}`);
  } else {
    console.log(`[prisma-migrations] OK ${rel}`);
  }
}

if (failed) {
  console.error('[prisma-migrations] Save SQL as UTF-8 without BOM. On Windows: use --fix or re-export from editor.');
  process.exit(1);
}

console.log(`[prisma-migrations] ${files.length} migration.sql file(s) OK.`);
