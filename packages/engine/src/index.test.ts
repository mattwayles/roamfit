import { ENGINE_PLACEHOLDER } from './index';

describe('@roamfit/engine wiring', () => {
  it('loads and runs under plain node (no RN, no I/O)', () => {
    expect(ENGINE_PLACEHOLDER).toBe(true);
  });
});
