import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import CallScreen from '../src/components/CallScreen.jsx';

describe('CallScreen', () => {
  it('renders call screen container', () => {
    const { container } = render(<CallScreen />);
    const el = container.querySelector('#callScreen');
    expect(el).not.toBeNull();
  });
});
