import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/react';
import ProfilePopout from '../src/components/ProfilePopout.jsx';
import { SocketContext } from '../src/SocketProvider.jsx';

let mockSocket;

beforeEach(() => {
  mockSocket = {
    on: vi.fn(),
    off: vi.fn()
  };
  global.fetch = vi.fn(() =>
    Promise.resolve({ ok: true, json: () => Promise.resolve({ displayName: 'alice', badges: [] }) })
  );
  window.loadAvatar = vi.fn(() => Promise.resolve('avatar1.png'));
});

describe('ProfilePopout', () => {
  it('updates avatar when avatarUpdated event received', async () => {
    let handler;
    mockSocket.on.mockImplementation((ev, fn) => { if (ev === 'avatarUpdated') handler = fn; });
    const { container } = render(
      <SocketContext.Provider value={mockSocket}>
        <ProfilePopout username="alice" anchorX={0} anchorY={0} />
      </SocketContext.Provider>
    );
    await waitFor(() => {
      const img = container.querySelector('.popout-avatar');
      expect(img.src).toContain('avatar1.png');
    });
    handler({ username: 'alice', avatar: 'avatar2.png' });
    await waitFor(() => {
      const img = container.querySelector('.popout-avatar');
      expect(img.src).toContain('avatar2.png');
    });
  });

  it('calls onClose on Escape press and outside click', async () => {
    const onClose = vi.fn();
    render(
      <SocketContext.Provider value={mockSocket}>
        <ProfilePopout username="bob" anchorX={0} anchorY={0} onClose={onClose} />
      </SocketContext.Provider>
    );
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
    onClose.mockClear();
    fireEvent.click(document.body);
    expect(onClose).toHaveBeenCalled();
  });
});
