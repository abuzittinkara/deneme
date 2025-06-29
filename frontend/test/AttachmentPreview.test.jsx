import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import React from 'react';
import AttachmentPreview from '../src/components/AttachmentPreview.jsx';

function makeFile(name) {
  return new File(['x'], name, { type: 'text/plain' });
}

beforeEach(() => {
  global.URL.createObjectURL = vi.fn(() => 'blob:' + Math.random());
});

describe('AttachmentPreview', () => {
  it('adds and removes files', () => {
    const { container } = render(<AttachmentPreview />);
    const input = container.querySelector('input[type="file"]');
    fireEvent.change(input, { target: { files: [makeFile('a.txt')] } });
    expect(container.querySelectorAll('.preview-item').length).toBe(1);
    fireEvent.click(container.querySelector('.remove-badge'));
    expect(container.querySelectorAll('.preview-item').length).toBe(0);
  });

  it('retries failed upload', () => {
    const ref = React.createRef();
    const retry = vi.fn();
    const { container } = render(<AttachmentPreview ref={ref} />);
    const input = container.querySelector('input[type="file"]');
    fireEvent.change(input, { target: { files: [makeFile('b.txt')] } });
    ref.current.markFailed(0, retry);
    const btn = container.querySelector('.retry-btn');
    expect(btn).not.toBeNull();
    fireEvent.click(btn);
    expect(retry).toHaveBeenCalled();
  });
});
