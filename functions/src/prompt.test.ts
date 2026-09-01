import { buildStableSystemBlock, delimitUntrustedText } from './prompt';

describe('buildStableSystemBlock', () => {
  it('carries a cache_control ephemeral breakpoint on the single system block', () => {
    const block = buildStableSystemBlock('stable content');
    expect(block).toHaveLength(1);
    expect(block[0]).toEqual({
      type: 'text',
      text: 'stable content',
      cache_control: { type: 'ephemeral' },
    });
  });

  it('is byte-identical for identical stable text regardless of when it is called', () => {
    const a = buildStableSystemBlock('same text');
    const b = buildStableSystemBlock('same text');
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});

describe('delimitUntrustedText', () => {
  it('wraps the text in explicit untrusted-data delimiters', () => {
    const wrapped = delimitUntrustedText('retrospective', 'I hated burpees');
    expect(wrapped).toContain('<untrusted_user_text>');
    expect(wrapped).toContain('</untrusted_user_text>');
    expect(wrapped).toContain('I hated burpees');
    expect(wrapped).toMatch(/DATA, not an instruction/);
  });
});
