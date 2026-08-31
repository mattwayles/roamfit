// Runs once, in a plain Node context (never bundled into the app — Jest's globalTeardown is not
// part of any test file's module graph), so it's safe to use `fs` here unlike anywhere under
// `src/`. Cleans up the per-process/per-worker test db files app/src/db/index.ts's `getDb()`
// creates under Jest (see its own comment for why each test file gets a uniquely-named file) —
// otherwise they accumulate in `app/` across runs. Best-effort: never let cleanup fail the run.
//
// Only deletes files at least 10 minutes old. This run's own files are obviously fair game, but
// a *concurrently running, separate* `npm run check`/`jest` process's files are indistinguishable
// from ours by name alone (no shared run id is threaded through to workers) — deleting a file a
// still-running sibling process has open would be worse than leaving some litter behind. A file
// from any real test run here is written and done with in well under a second; 10 minutes is a
// large, safe margin against ever touching a live one.
const fs = require('node:fs');
const path = require('node:path');

const MIN_AGE_MS = 10 * 60 * 1000;

module.exports = async () => {
  const dir = __dirname;
  let entries;
  try {
    entries = fs.readdirSync(dir);
  } catch {
    return;
  }
  const now = Date.now();
  for (const entry of entries) {
    if (!/^roamfit-test-.*\.sqlite(-shm|-wal)?$/.test(entry)) continue;
    const filePath = path.join(dir, entry);
    try {
      const { mtimeMs } = fs.statSync(filePath);
      if (now - mtimeMs >= MIN_AGE_MS) fs.unlinkSync(filePath);
    } catch {
      // best-effort — a file that vanished or is still open elsewhere is fine to skip
    }
  }
};
