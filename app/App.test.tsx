import { act, create } from 'react-test-renderer';

import App from './App';

describe('App', () => {
  it('boots and renders the placeholder screen', () => {
    let tree: ReturnType<typeof create> | undefined;
    act(() => {
      tree = create(<App />);
    });
    const json = tree?.toJSON();
    expect(json).toBeTruthy();
  });
});
