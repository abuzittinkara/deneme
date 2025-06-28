import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import RegisterForm from '../src/components/RegisterForm.jsx';
import { attemptRegister } from '../../public/js/auth.js';

vi.stubGlobal('socket', { emit: vi.fn() });
vi.stubGlobal('attemptRegister', attemptRegister);

beforeEach(() => {
  socket.emit.mockClear();
});

describe('RegisterForm', () => {
  it('emits register event with provided info', () => {
    render(<RegisterForm onSwitch={() => {}} />);
    fireEvent.change(screen.getByPlaceholderText('Kullanıcı Adı (küçük harf)'), {
      target: { value: 'bob' }
    });
    fireEvent.change(screen.getByPlaceholderText('İsim'), { target: { value: 'Bob' } });
    fireEvent.change(screen.getByPlaceholderText('Soyisim'), { target: { value: 'Builder' } });
    fireEvent.change(document.getElementById('regBirthdateInput'), {
      target: { value: '2000-01-01' }
    });
    fireEvent.change(screen.getByPlaceholderText('E-Posta'), { target: { value: 'b@example.com' } });
    fireEvent.change(screen.getByPlaceholderText('Telefon Numarası'), { target: { value: '555' } });
    fireEvent.change(screen.getByPlaceholderText('Parola'), { target: { value: 'Secret1!' } });
    fireEvent.change(screen.getByPlaceholderText('Parola(Tekrar)'), { target: { value: 'Secret1!' } });
    fireEvent.click(screen.getByText('Kayıt Ol ve Başla'));
    expect(socket.emit).toHaveBeenCalledWith('register', {
      username: 'bob',
      name: 'Bob',
      surname: 'Builder',
      birthdate: '2000-01-01',
      email: 'b@example.com',
      phone: '555',
      password: 'Secret1!',
      passwordConfirm: 'Secret1!'
    });
  });
});
