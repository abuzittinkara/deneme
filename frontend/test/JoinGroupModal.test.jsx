import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import JoinGroupModal from '../src/components/JoinGroupModal.jsx';

describe('JoinGroupModal', () => {
  it('calls onSubmit with entered id', () => {
    const onSubmit = vi.fn();
    const { container } = render(
      <JoinGroupModal open={true} onSubmit={onSubmit} onClose={() => {}} />
    );
    fireEvent.change(container.querySelector('#joinGroupIdInput'), {
      target: { value: 'g1' }
    });
    fireEvent.click(container.querySelector('#joinGroupIdBtn'));
    expect(onSubmit).toHaveBeenCalledWith('g1');
  });

  it('is hidden when open is false', () => {
    const { container } = render(<JoinGroupModal open={false} />);
    const modal = container.querySelector('#joinGroupModal');
    expect(modal.style.display).toBe('none');
  });
});
