import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import LoginForm from '../src/components/LoginForm.jsx';
import { attemptLogin } from '../../public/js/auth.js';

vi.stubGlobal('socket', { emit: vi.fn() });
vi.stubGlobal('attemptLogin', attemptLogin);

beforeEach(() => {
  socket.emit.mockClear();
});

describe('LoginForm', () => {
  it('emits login event with entered credentials', () => {
    render(<LoginForm onSwitch={() => {}} />);
    fireEvent.change(screen.getByPlaceholderText('Kullanıcı Adı'), {
      target: { value: 'alice' }
    });
    fireEvent.change(screen.getByPlaceholderText('Parola'), {
      target: { value: 'Secret1!' }
    });
    fireEvent.click(screen.getByText('Giriş Yap'));
    expect(socket.emit).toHaveBeenCalledWith('login', { username: 'alice', password: 'Secret1!' });
  });
});
