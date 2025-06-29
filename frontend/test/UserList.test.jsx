import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import UserList from '../src/components/UserList.jsx';
import { SocketContext } from '../src/SocketProvider.jsx';
import { ProfilePopoutProvider } from '../../public/js/profilePopout.js';

let handlers;
let mockSocket;

beforeEach(() => {
  handlers = {};
  mockSocket = {
    on: vi.fn((ev, cb) => { handlers[ev] = cb; }),
    off: vi.fn(),
  };
  window.loadAvatar = vi.fn(() => Promise.resolve('avatar1.png'));
});

describe('UserList', () => {
  it('updates list when events received', async () => {
    const { container } = render(
      <SocketContext.Provider value={mockSocket}>
        <ProfilePopoutProvider>
          <UserList />
        </ProfilePopoutProvider>
      </SocketContext.Provider>
    );
    handlers['groupUsers']({ online: [{ username: 'alice' }], offline: [] });
    await waitFor(() => {
      expect(container.textContent).toContain('alice');
    });
    handlers['avatarUpdated'] && handlers['avatarUpdated']({ username: 'alice', avatar: 'avatar2.png' });
    await waitFor(() => {
      const img = container.querySelector('img[data-username="alice"]');
      expect(img.src).toContain('avatar2.png');
    });
  });
});
