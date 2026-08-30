#!/usr/bin/env node
/**
 * Fails if packages/engine imports from app/ or from react-native (directly or via a
 * subpath). Grep-based on purpose — see wave-01a-skeleton.md and CLAUDE.md invariant #2
 * ("The engine decides; the LLM decorates" depends on the engine staying pure and testable
 * in plain node, with zero React Native surface).
 *
 * Usage: node tools/check-engine-purity.js
 */
const fs = require('node:fs');
const path = require('node:path');

const ENGINE_SRC = path.join(__dirname, '..', 'packages', 'engine', 'src');

// Matches: import ... from 'react-native'  |  require('react-native/...')  |  from '../../app/...'
const VIOLATION_PATTERNS = [
  /from\s+['"]react-native(\/[^'"]*)?['"]/,
  /require\(\s*['"]react-native(\/[^'"]*)?['"]\s*\)/,
  /from\s+['"](\.\.\/)+(\.\.\/)*app(\/[^'"]*)?['"]/,
  /require\(\s*['"](\.\.\/)+(\.\.\/)*app(\/[^'"]*)?['"]\s*\)/,
];

/** @param {string} dir */
function walk(dir) {
  /** @type {string[]} */
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...walk(full));
    } else if (/\.(ts|tsx|js|jsx)$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

function main() {
  if (!fs.existsSync(ENGINE_SRC)) {
    console.error(`check-engine-purity: ${ENGINE_SRC} does not exist`);
    process.exit(1);
  }

  const violations = [];
  for (const file of walk(ENGINE_SRC)) {
    const text = fs.readFileSync(file, 'utf8');
    const lines = text.split('\n');
    lines.forEach((line, i) => {
      for (const pattern of VIOLATION_PATTERNS) {
        if (pattern.test(line)) {
          violations.push(`${path.relative(process.cwd(), file)}:${i + 1}: ${line.trim()}`);
        }
      }
    });
  }

  if (violations.length > 0) {
    console.error('check-engine-purity: packages/engine must not import from app/ or react-native:\n');
    for (const v of violations) console.error(`  ${v}`);
    console.error('\npackages/engine must stay pure TypeScript — no RN, no app/. See CLAUDE.md.');
    process.exit(1);
  }

  console.log('check-engine-purity: OK — packages/engine has no app/ or react-native imports.');
}

main();
