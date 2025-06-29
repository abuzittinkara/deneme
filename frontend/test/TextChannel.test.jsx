import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import TextChannel from '../src/components/TextChannel.jsx';
import { SocketContext } from '../src/SocketProvider.jsx';
import { UserContext } from '../src/UserContext.jsx';

let handlers;
let mockSocket;

beforeEach(() => {
  handlers = {};
  mockSocket = {
    emit: vi.fn(),
    on: vi.fn((ev, cb) => { handlers[ev] = cb; }),
    off: vi.fn()
  };
  window.selectedGroup = 'g1';
  window.currentTextChannel = 'c1';
});

describe('TextChannel', () => {
  it('sends message when button clicked', () => {
    const { container } = render(
      <SocketContext.Provider value={mockSocket}>
        <UserContext.Provider value={{ username: 'alice', setUsername: () => {} }}>
          <TextChannel />
        </UserContext.Provider>
      </SocketContext.Provider>
    );
    const input = container.querySelector('#textChannelMessageInput');
    input.textContent = 'hi';
    fireEvent.click(container.querySelector('#sendTextMessageBtn'));
    expect(mockSocket.emit).toHaveBeenCalledWith('textMessage', {
      groupId: 'g1',
      roomId: 'c1',
      message: 'hi',
      attachments: []
    });
  });

  it('shows typing indicator based on events', () => {
    const { container } = render(
      <SocketContext.Provider value={mockSocket}>
        <UserContext.Provider value={{ username: 'alice', setUsername: () => {} }}>
          <TextChannel />
        </UserContext.Provider>
      </SocketContext.Provider>
    );
    handlers['typing']({ username: 'bob', channel: 'c1' });
    const ind = container.querySelector('.typing-indicator');
    expect(ind.textContent).toContain('bob');
    handlers['stop typing']({ username: 'bob', channel: 'c1' });
    expect(container.querySelector('.typing-indicator')).toBeNull();
  });

  it('renders date separators', () => {
    const { container } = render(
      <SocketContext.Provider value={mockSocket}>
        <UserContext.Provider value={{ username: 'alice', setUsername: () => {} }}>
          <TextChannel />
        </UserContext.Provider>
      </SocketContext.Provider>
    );
    handlers['textHistory']([
      { id: 1, content: 'a', username: 'bob', timestamp: '2024-01-01T10:00:00Z', attachments: [] },
      { id: 2, content: 'b', username: 'bob', timestamp: '2024-01-02T10:00:00Z', attachments: [] }
    ]);
    const seps = container.querySelectorAll('.date-separator');
    expect(seps.length).toBe(2);
  });
});
