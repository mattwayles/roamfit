import { youtubeSearchUrl } from './youtubeSearch';

describe('youtubeSearchUrl', () => {
  it('searches for "<name> Exercise", URL-encoded', () => {
    expect(youtubeSearchUrl('Band Row & Pull')).toBe(
      'https://www.youtube.com/results?search_query=Band%20Row%20%26%20Pull%20Exercise',
    );
  });
});
