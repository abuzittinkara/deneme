import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import DMChat from '../src/components/DMChat.jsx';
import { SocketContext } from '../src/SocketProvider.jsx';

let mockSocket;

beforeEach(() => {
  mockSocket = {
    emit: vi.fn((event, data, cb) => {
      if (cb) cb({ success: true, messages: [] });
    }),
    on: vi.fn(),
    off: vi.fn()
  };
});

describe('DMChat', () => {
  it('sends message when send button clicked', () => {
    const { container } = render(
      <SocketContext.Provider value={mockSocket}>
        <DMChat friend="bob" />
      </SocketContext.Provider>
    );
    const input = container.querySelector('#dmMessageInput');
    input.textContent = 'hello';
    fireEvent.click(container.querySelector('#dmSendButton'));
    expect(mockSocket.emit).toHaveBeenCalledWith(
      'dmMessage',
      { friend: 'bob', content: 'hello', attachments: [] },
      expect.any(Function)
    );
  });

  it('sends message on Enter key', () => {
    const { container } = render(
      <SocketContext.Provider value={mockSocket}>
        <DMChat friend="alice" />
      </SocketContext.Provider>
    );
    const input = container.querySelector('#dmMessageInput');
    input.textContent = 'hey';
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(mockSocket.emit).toHaveBeenCalledWith(
      'dmMessage',
      { friend: 'alice', content: 'hey', attachments: [] },
      expect.any(Function)
    );
  });

  it('emits leaveDM on cleanup', () => {
    const { unmount } = render(
      <SocketContext.Provider value={mockSocket}>
        <DMChat friend="carol" />
      </SocketContext.Provider>
    );
    unmount();
    expect(mockSocket.emit).toHaveBeenCalledWith('leaveDM', { friend: 'carol' });
  });
});
