import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/react';
import DMPanel from '../src/components/DMPanel.jsx';
import CallScreen from '../src/components/CallScreen.jsx';
import { SocketContext } from '../src/SocketProvider.jsx';

let mockSocket;

beforeEach(() => {
  mockSocket = {
    emit: vi.fn((event, data, cb) => {
      if (event === 'getFriendsList') cb({ success: true, friends: [{ username: 'alice' }] });
      if (event === 'getBlockedFriends') cb({ success: true, friends: [] });
      if (event === 'getPendingFriendRequests') cb({ success: true, requests: [] });
      if (event === 'getOutgoingFriendRequests') cb({ success: true, requests: [] });
    })
  };
  window.openDMChat = vi.fn();
});

describe('DMPanel', () => {
  it('calls window.openDMChat when friend clicked', async () => {
    const { getByText } = render(
      <SocketContext.Provider value={mockSocket}>
        <DMPanel />
      </SocketContext.Provider>
    );
    const friendEl = await waitFor(() => getByText('alice'));
    fireEvent.click(friendEl);
    expect(window.openDMChat).toHaveBeenCalledWith('alice');
  });

  it('opens panel when toggle button clicked', () => {
    const { container } = render(
      <SocketContext.Provider value={mockSocket}>
        <CallScreen />
      </SocketContext.Provider>
    );
    const panelBefore = container.querySelector('#dmPanel');
    expect(panelBefore).toBeNull();
    const btn = container.querySelector('#toggleDMButton');
    fireEvent.click(btn);
    const panelAfter = container.querySelector('#dmPanel');
    expect(panelAfter).not.toBeNull();
  });
});
