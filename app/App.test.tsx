import { render, screen } from '@testing-library/react-native';

import App from './App';

describe('App', () => {
  it('boots and renders the placeholder screen', () => {
    render(<App />);
    expect(screen.getByText('RoamFit')).toBeTruthy();
  });
});
