import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import CreateGroupModal from '../src/components/CreateGroupModal.jsx';

beforeEach(() => {
  window.prompt = vi.fn(() => 'general');
});

describe('CreateGroupModal', () => {
  it('calls onSubmit with entered name', () => {
    const onSubmit = vi.fn();
    const { container } = render(
      <CreateGroupModal open={true} onSubmit={onSubmit} onClose={() => {}} />
    );
    fireEvent.change(container.querySelector('#actualGroupName'), {
      target: { value: 'mygroup' }
    });
    fireEvent.click(container.querySelector('#actualGroupNameBtn'));
    expect(onSubmit).toHaveBeenCalledWith('mygroup', 'general');
  });

  it('is hidden when open is false', () => {
    const { container } = render(<CreateGroupModal open={false} />);
    const modal = container.querySelector('#actualGroupCreateModal');
    expect(modal.style.display).toBe('none');
  });
});
