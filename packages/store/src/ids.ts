/**
 * A dependency-free UUID v4 generator. Deliberately not `node:crypto`'s `randomUUID` — that's a
 * node built-in with no equivalent in the Hermes/React Native runtime this package is ultimately
 * consumed from (`app/src/db/`, ADR 0003), and `packages/store` should not silently work only in
 * node tests and break on-device. IDs here are opaque local identifiers, not security tokens, so
 * `Math.random` is an acceptable source.
 */
export function newId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
