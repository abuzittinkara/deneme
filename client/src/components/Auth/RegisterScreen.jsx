import React, { useState, useContext } from 'react';
import { SocketContext } from '../../context/SocketContext';
import { sendRegister } from '../../services/socketService';

const RegisterScreen = ({ switchToLogin }) => {
  const socket = useContext(SocketContext);
  const [formData, setFormData] = useState({
    username: '',
    name: '',
    surname: '',
    birthdate: '',
    email: '',
    phone: '',
    password: '',
    passwordConfirm: ''
  });
  const [error, setError] = useState('');

  const handleRegister = () => {
    if (Object.values(formData).some(field => !field)) {
      setError('Tüm alanları doldurunuz.');
      return;
    }
    if (formData.password !== formData.passwordConfirm) {
      setError('Parolalar eşleşmiyor.');
      return;
    }
    sendRegister(socket, formData, (response) => {
      if (response.success) {
        alert("Hesap başarıyla oluşturuldu");
        switchToLogin();
      } else {
        setError(response.message || 'Kayıt hatası');
      }
    });
  };

  const handleChange = (e) => {
    setFormData({...formData, [e.target.id]: e.target.value});
  };

  return (
    <div className="auth-screen register-screen">
      <h1>Kayıt Ol</h1>
      {error && <p className="error">{error}</p>}
      <input type="text" id="regUsername" placeholder="Kullanıcı Adı (küçük harf)" onChange={handleChange} />
      <input type="text" id="regName" placeholder="İsim" onChange={handleChange} />
      <input type="text" id="regSurname" placeholder="Soyisim" onChange={handleChange} />
      <input type="date" id="regBirthdate" onChange={handleChange} />
      <input type="email" id="regEmail" placeholder="E-Posta" onChange={handleChange} />
      <input type="tel" id="regPhone" placeholder="Telefon Numarası" onChange={handleChange} />
      <input type="password" id="regPassword" placeholder="Parola" onChange={handleChange} />
      <input type="password" id="regPasswordConfirm" placeholder="Parola (Tekrar)" onChange={handleChange} />
      <button onClick={handleRegister}>Kayıt Ol ve Başla</button>
      <button onClick={switchToLogin}>Geri Gel</button>
    </div>
  );
};

export default RegisterScreen;
