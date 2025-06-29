import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import GroupOptionsModal from '../src/components/GroupOptionsModal.jsx';

describe('GroupOptionsModal', () => {
  it('triggers callbacks on interactions', () => {
    const onCreate = vi.fn();
    const onJoin = vi.fn();
    const onClose = vi.fn();
    const { container } = render(
      <GroupOptionsModal
        open={true}
        onCreateGroup={onCreate}
        onJoinGroup={onJoin}
        onClose={onClose}
      />
    );
    fireEvent.click(container.querySelector('#modalGroupCreateBtn'));
    expect(onCreate).toHaveBeenCalled();
    fireEvent.click(container.querySelector('#modalGroupJoinBtn'));
    expect(onJoin).toHaveBeenCalled();
    fireEvent.click(container.querySelector('#groupModal'));
    expect(onClose).toHaveBeenCalled();
  });

  it('is hidden when open is false', () => {
    const { container } = render(<GroupOptionsModal open={false} />);
    const modal = container.querySelector('#groupModal');
    expect(modal.style.display).toBe('none');
  });
});
