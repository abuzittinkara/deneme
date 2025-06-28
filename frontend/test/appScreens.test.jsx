import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import App from '../src/App.jsx';
import { SocketContext } from '../src/SocketProvider.jsx';

const mockSocket = { emit: () => {} };

describe('App screen switching', () => {
  it('toggles between login and register without globals', () => {
    render(
      <SocketContext.Provider value={mockSocket}>
        <App />
      </SocketContext.Provider>
    );
    expect(screen.getByText('Oturum Aç')).toBeInTheDocument();
    expect(window.loginScreen).toBeUndefined();
    fireEvent.click(screen.getByText('Yeni Hesap Oluştur'));
    expect(screen.getByText('Kayıt Ol')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Geri Gel'));
    expect(screen.getByText('Oturum Aç')).toBeInTheDocument();
  });

  it('shows correct screen when calling setScreen', () => {
    render(
      <SocketContext.Provider value={mockSocket}>
        <App />
      </SocketContext.Provider>
    );
    expect(typeof window.setScreen).toBe('function');

    act(() => {
      window.setScreen('register');
    });
    const reg = document.getElementById('registerScreen');
    expect(reg).not.toBeNull();
    expect(reg.style.display).not.toBe('none');

    act(() => {
      window.setScreen('call');
    });
    const call = document.getElementById('callScreen');
    expect(call).not.toBeNull();
    expect(call.style.display).not.toBe('none');
  });
});
