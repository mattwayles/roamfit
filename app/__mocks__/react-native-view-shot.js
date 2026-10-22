/**
 * Global Jest manual mock for `react-native-view-shot`: the real package needs its native module,
 * which Jest does not have. `captureRef` resolves a fixed temp-file path so share code can be
 * tested end to end; it proves nothing about the real capture, which is device-only.
 */
/* global jest */
const captureRef = jest.fn(() => Promise.resolve('file:///tmp/badge-share.png'));

module.exports = { captureRef, default: { captureRef } };
