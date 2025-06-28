import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import LoginForm from '../src/components/LoginForm.jsx';
import { attemptLogin } from '../src/auth.js';
import { SocketContext } from '../src/SocketProvider.jsx';

const mockSocket = { emit: vi.fn() };

beforeEach(() => {
  mockSocket.emit.mockClear();
});

describe('LoginForm', () => {
  it('emits login event with entered credentials', () => {
    render(
      <SocketContext.Provider value={mockSocket}>
        <LoginForm onSwitch={() => {}} />
      </SocketContext.Provider>
    );
    fireEvent.change(screen.getByPlaceholderText('Kullanıcı Adı'), {
      target: { value: 'alice' }
    });
    fireEvent.change(screen.getByPlaceholderText('Parola'), {
      target: { value: 'Secret1!' }
    });
    fireEvent.click(screen.getByText('Giriş Yap'));
    expect(mockSocket.emit).toHaveBeenCalledWith('login', {
      username: 'alice',
      password: 'Secret1!'
    });
  });
});
