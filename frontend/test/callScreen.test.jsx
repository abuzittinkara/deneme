import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import CallScreen from '../src/components/CallScreen.jsx';
import { SocketContext } from '../src/SocketProvider.jsx';

describe('CallScreen', () => {
  it('renders call screen container', () => {
    const { container } = render(<CallScreen />);
    const el = container.querySelector('#callScreen');
    expect(el).not.toBeNull();
  });

  it('handles group modal interactions', () => {
    const mockSocket = { emit: vi.fn() };
    window.prompt = vi.fn(() => 'ch');
    const { container } = render(
      <SocketContext.Provider value={mockSocket}>
        <CallScreen />
      </SocketContext.Provider>
    );
    fireEvent.click(container.querySelector('#createGroupButton'));
    fireEvent.click(container.querySelector('#modalGroupCreateBtn'));
    const cg = container.querySelector('#actualGroupCreateModal');
    expect(cg.style.display).toBe('flex');
    fireEvent.change(container.querySelector('#actualGroupName'), {
      target: { value: 'grp' }
    });
    fireEvent.click(container.querySelector('#actualGroupNameBtn'));
    expect(mockSocket.emit).toHaveBeenCalledWith('createGroup', {
      groupName: 'grp',
      channelName: 'ch'
    });

    fireEvent.click(container.querySelector('#createGroupButton'));
    fireEvent.click(container.querySelector('#modalGroupJoinBtn'));
    const jg = container.querySelector('#joinGroupModal');
    expect(jg.style.display).toBe('flex');
    fireEvent.change(container.querySelector('#joinGroupIdInput'), {
      target: { value: 'gid' }
    });
    fireEvent.click(container.querySelector('#joinGroupIdBtn'));
    expect(mockSocket.emit).toHaveBeenCalledWith('joinGroup', 'gid');
  });
});
