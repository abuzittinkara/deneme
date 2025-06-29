import { describe, it, expect, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import UserCard from '../src/components/UserCard.jsx';
import { UserContext } from '../src/UserContext.jsx';

beforeEach(() => {
  window.loadAvatar = () => Promise.resolve('avatar.png');
});

describe('UserCard', () => {
  it('renders username from context', () => {
    const { container } = render(
      <UserContext.Provider value={{ username: 'alice', setUsername: () => {} }}>
        <UserCard />
      </UserContext.Provider>
    );
    const nameEl = container.querySelector('#userCardName');
    expect(nameEl.textContent).toBe('alice');
  });
});
