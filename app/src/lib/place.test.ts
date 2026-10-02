import { formatPlace } from './place';

describe('formatPlace', () => {
  it('stamps city, state abbreviation, and 3-letter country', () => {
    expect(formatPlace({ city: 'Bend', region: 'OR', countryCode: 'US' })).toBe('Bend, OR, USA');
  });
  it('drops a spelled-out region and falls back to the alpha-2 code when unmapped', () => {
    expect(formatPlace({ city: 'Cusco', region: 'Cusco Region', countryCode: 'XK' })).toBe(
      'Cusco, XK',
    );
  });
  it('drops missing parts on older pins and uses the country name when there is no code', () => {
    expect(formatPlace({ city: 'Lisbon', country: 'Portugal' })).toBe('Lisbon, Portugal');
    expect(formatPlace({ city: null })).toBeNull();
  });
});
