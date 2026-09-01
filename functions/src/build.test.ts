/**
 * Issue #41 — "a `tsc` that exits 0 is not proof the artifact is loadable." This test runs the
 * *actual* `npm run build` (esbuild bundling `src/index.ts` → `lib/index.js`, exactly what
 * `firebase.json`'s predeploy step runs before a real deploy), then `require()`s the freshly
 * built CommonJS file in a fresh Node `require` — not the TS source under ts-jest — and asserts
 * the three exported Cloud Function callables are actually present and shaped like a
 * `firebase-functions` v2 `onCall` export (a function with a `.run` method).
 *
 * This is deliberately an integration-shaped test, not a mock: if the build script regresses
 * (wrong `--outfile`, an accidentally-externalized `@roamfit/engine`, a bundling failure that
 * `tsc --noEmit` would never catch because bundling is a wholly separate tool), this fails.
 * Verified by mutation: passing `--external:@roamfit/engine` to the build command inlined below
 * makes esbuild unable to resolve the workspace package as an external at runtime (Node cannot
 * `require('@roamfit/engine')` — it is not a real installable npm package, only a workspace
 * symlink to TypeScript source) and the `require()` below throws instead of returning handlers.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import path from 'node:path';

const FUNCTIONS_ROOT = path.resolve(__dirname, '..');
const LIB_ENTRY = path.join(FUNCTIONS_ROOT, 'lib', 'index.js');

describe('functions/ build produces a loadable Cloud Functions artifact', () => {
  beforeAll(() => {
    // Start from a clean slate so this test proves the build step itself creates the file,
    // rather than passing because a previous local `npm run build` left one lying around.
    rmSync(path.join(FUNCTIONS_ROOT, 'lib'), { recursive: true, force: true });
    execFileSync('npm', ['run', 'build'], { cwd: FUNCTIONS_ROOT, stdio: 'pipe' });
  });

  it('emits lib/index.js', () => {
    expect(existsSync(LIB_ENTRY)).toBe(true);
  });

  it('the built CommonJS file requires cleanly in plain Node and exports all three callables', () => {
    // Deliberately a fresh `node` child process, not Jest's own `require()` — Jest's module
    // system applies its own ESM/CJS interop rules to every transitive `node_modules` require
    // (firebase-functions pulls in an ESM-only dependency deep in its auth chain) and would
    // fail here for reasons that have nothing to do with whether the *built artifact* is
    // loadable in the real Cloud Functions Node runtime, which is plain Node with no Jest
    // involved at all — exactly what this spawns.
    const probe = `
      const built = require(${JSON.stringify(LIB_ENTRY)});
      const names = ['llmIntake', 'llmCoachVoice', 'llmDistillFeedback'];
      for (const name of names) {
        const exported = built[name];
        if (typeof exported !== 'function') throw new Error(name + ' is not a function: ' + typeof exported);
        if (typeof exported.run !== 'function') throw new Error(name + '.run is not a function');
      }
      console.log('OK');
    `;
    const output = execFileSync('node', ['-e', probe], { encoding: 'utf8' });
    expect(output.trim()).toBe('OK');
  });

  it("bundles @roamfit/engine's validators in (not left as an unresolvable external)", () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require('node:fs') as typeof import('node:fs');
    const source = fs.readFileSync(LIB_ENTRY, 'utf8');
    expect(source).toContain('validateIntakeOutput');
    // Real published npm packages stay external — Cloud Build fetches them via npm install —
    // while the workspace-local @roamfit/* packages must be inlined, since they are not
    // published and `require('@roamfit/engine')` would fail in the deployed environment.
    expect(source).not.toMatch(/require\(["']@roamfit\/(engine|data)["']\)/);
  });
});
