/* global jest, afterAll */
// A component that is still animating when its test finishes leaves a pending timer (RN's
// TimingAnimation runs on setTimeout). Jest then tears the environment down, the timer fires into
// the dead module registry, and the resulting "require a file after the Jest environment has been
// torn down" TypeError lands on whatever test the same worker happens to be running next — a
// different, innocent suite each run. That was the suite's flake.
//
// So: remember every timer this file's tests create and clear whatever is left once the file is
// done. Nothing can legitimately depend on a timer firing after the last test has finished.
const pending = new Set();
const realSetTimeout = global.setTimeout;
const realSetInterval = global.setInterval;
const realClearTimeout = global.clearTimeout;
const realClearInterval = global.clearInterval;

global.setTimeout = function trackedSetTimeout(fn, ms, ...args) {
  const handle = realSetTimeout(
    (...a) => {
      pending.delete(handle);
      return fn(...a);
    },
    ms,
    ...args,
  );
  pending.add(handle);
  return handle;
};
global.setInterval = function trackedSetInterval(fn, ms, ...args) {
  const handle = realSetInterval(fn, ms, ...args);
  pending.add(handle);
  return handle;
};
global.clearTimeout = function trackedClearTimeout(handle) {
  pending.delete(handle);
  return realClearTimeout(handle);
};
global.clearInterval = function trackedClearInterval(handle) {
  pending.delete(handle);
  return realClearInterval(handle);
};

afterAll(() => {
  // Real timers only: under fake timers `pending` holds handles the fake clock owns.
  jest.useRealTimers();
  for (const handle of pending) {
    realClearTimeout(handle);
    realClearInterval(handle);
  }
  pending.clear();
});
