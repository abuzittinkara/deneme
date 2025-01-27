/**************************************
 * script.js
 **************************************/
let socket = null;

// Mediasoup-client Device
let device = null;

// Transport'lar
let sendTransport = null;
let recvTransport = null;

// Yerel mikrofon akışı
let localStream = null;

// Kimlik
let username = null;

// SFU Parametreleri
let currentGroup = null;
let currentRoom = null;

// UI Elemanları
const loginScreen = document.getElementById('loginScreen');
const registerScreen = document.getElementById('registerScreen');
const callScreen = document.getElementById('callScreen');

const loginUsernameInput = document.getElementById('loginUsernameInput');
const loginPasswordInput = document.getElementById('loginPasswordInput');
const loginButton = document.getElementById('loginButton');
const loginErrorMessage = document.getElementById('loginErrorMessage');

const regUsernameInput = document.getElementById('regUsernameInput');
const regNameInput = document.getElementById('regNameInput');
const regSurnameInput = document.getElementById('regSurnameInput');
const regBirthdateInput = document.getElementById('regBirthdateInput');
const regEmailInput = document.getElementById('regEmailInput');
const regPhoneInput = document.getElementById('regPhoneInput');
const regPasswordInput = document.getElementById('regPasswordInput');
const regPasswordConfirmInput = document.getElementById('regPasswordConfirmInput');
const registerButton = document.getElementById('registerButton');
const backToLoginButton = document.getElementById('backToLoginButton');
const registerErrorMessage = document.getElementById('registerErrorMessage');

const showRegisterScreen = document.getElementById('showRegisterScreen');
const showLoginScreen = document.getElementById('showLoginScreen');

// Örnek butonlar
const micToggleButton = document.getElementById('micToggleButton');
const deafenToggleButton = document.getElementById('deafenToggleButton');

// Sayfa yüklendiğinde
window.addEventListener('DOMContentLoaded', () => {
  socket = io();

  // Socket event'leri
  socket.on('connect', () => {
    console.log('Socket connected =>', socket.id);
  });
  socket.on('disconnect', () => {
    console.log('Socket disconnected.');
  });

  // Login / Register event'leri
  initLoginRegisterHandlers();

  // SFU ile ilgili event'leri
  initSfuClientHandlers();
});

function initLoginRegisterHandlers() {
  // Login
  loginButton.addEventListener('click', attemptLogin);
  loginUsernameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') attemptLogin();
  });
  loginPasswordInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') attemptLogin();
  });

  // Register
  registerButton.addEventListener('click', attemptRegister);

  // Ekran geçişleri
  showRegisterScreen.addEventListener('click', () => {
    loginScreen.style.display = 'none';
    registerScreen.style.display = 'block';
  });
  showLoginScreen.addEventListener('click', () => {
    registerScreen.style.display = 'none';
    loginScreen.style.display = 'block';
  });
  backToLoginButton.addEventListener('click', () => {
    registerScreen.style.display = 'none';
    loginScreen.style.display = 'block';
  });
}

function attemptLogin() {
  const usernameVal = loginUsernameInput.value.trim();
  const passwordVal = loginPasswordInput.value.trim();

  loginErrorMessage.style.display = 'none';

  if (!usernameVal || !passwordVal) {
    loginErrorMessage.textContent = "Lütfen gerekli alanları doldurunuz";
    loginErrorMessage.style.display = 'block';
    return;
  }
  socket.emit('login', { username: usernameVal, password: passwordVal });
}

function attemptRegister() {
  const userData = {
    username: regUsernameInput.value.trim(),
    name: regNameInput.value.trim(),
    surname: regSurnameInput.value.trim(),
    birthdate: regBirthdateInput.value.trim(),
    email: regEmailInput.value.trim(),
    phone: regPhoneInput.value.trim(),
    password: regPasswordInput.value.trim(),
    passwordConfirm: regPasswordConfirmInput.value.trim()
  };

  registerErrorMessage.style.display = 'none';

  if (!userData.username || !userData.name || !userData.surname ||
      !userData.birthdate || !userData.email || !userData.phone ||
      !userData.password || !userData.passwordConfirm) {
    registerErrorMessage.textContent = "Lütfen girdiğiniz bilgileri kontrol edin";
    registerErrorMessage.style.display = 'block';
    return;
  }
  if (userData.username !== userData.username.toLowerCase()) {
    registerErrorMessage.textContent = "Kullanıcı adı küçük harf olmalı!";
    registerErrorMessage.style.display = 'block';
    return;
  }
  if (userData.password !== userData.passwordConfirm) {
    registerErrorMessage.textContent = "Parolalar eşleşmiyor!";
    registerErrorMessage.style.display = 'block';
    return;
  }

  socket.emit('register', userData);
}

// Socket.on => loginResult / registerResult
socket.on('loginResult', (data) => {
  if (!data.success) {
    loginErrorMessage.textContent = data.message || "Giriş başarısız";
    loginErrorMessage.style.display = 'block';
    return;
  }
  username = data.username;
  // Olay başarılıysa
  loginScreen.style.display = 'none';
  callScreen.style.display = 'flex';
  socket.emit('set-username', username);
  console.log("Login başarılı, username:", username);
});

socket.on('registerResult', (data) => {
  if (!data.success) {
    registerErrorMessage.textContent = data.message || "Kayıt başarısız";
    registerErrorMessage.style.display = 'block';
    return;
  }
  // Kayıt olduktan sonra login ekranına dön
  registerScreen.style.display = 'none';
  loginScreen.style.display = 'block';
});

// ==============================
// SFU Client Kısmı
// ==============================

function initSfuClientHandlers() {
  // "newProducer" => başka biri produce etti => consume et
  socket.on('newProducer', ({ producerId }) => {
    console.log('newProducer event =>', producerId);
    if (!recvTransport) {
      console.warn('recvTransport yok => sonradan consume edilebilir');
      return;
    }
    consumeProducer(producerId);
  });
}

// Kanala girildiğinde "joinRoomAck" => SFU akışını başlatabiliriz
socket.on('joinRoomAck', async ({ groupId, roomId }) => {
  console.log("joinRoomAck => group:", groupId, " room:", roomId);
  currentGroup = groupId;
  currentRoom = roomId;
  // SFU akışı: device.load => create sendTransport => produce => create recvTransport => consume
  await startSfuFlow();
});

// SFU akışını başlat => local mic produce + mevcut producerları consume
async function startSfuFlow() {
  console.log("startSfuFlow =>", currentGroup, currentRoom);

  // 1) Device oluştur
  if (!device) {
    device = new mediasoupClient.Device();
  }

  // 2) createWebRtcTransport => sunucudan parametre al => device.load(rtpCapabilities)
  const transportParams = await createTransport();
  if (transportParams.error) {
    console.error("createTransport error:", transportParams.error);
    return;
  }
  await device.load({ routerRtpCapabilities: transportParams.routerRtpCapabilities });
  console.log("Device load bitti.");

  // 3) SendTransport oluştur
  sendTransport = device.createSendTransport(transportParams);
  // Connect event
  sendTransport.on('connect', async ({ dtlsParameters }, callback, errback) => {
    console.log("sendTransport connect => dtls");
    socket.emit('connectTransport', {
      groupId: currentGroup,
      roomId: currentRoom,
      transportId: transportParams.transportId,
      dtlsParameters
    }, (res) => {
      if (res && res.error) {
        errback(res.error);
      } else {
        callback();
      }
    });
  });
  // Produce event
  sendTransport.on('produce', async (producerOptions, callback, errback) => {
    console.log("sendTransport produce =>", producerOptions);
    socket.emit('produce', {
      groupId: currentGroup,
      roomId: currentRoom,
      transportId: transportParams.transportId,
      kind: producerOptions.kind,
      rtpParameters: producerOptions.rtpParameters
    }, (res) => {
      if (res.error) {
        errback(res.error);
      } else {
        callback({ id: res.producerId });
      }
    });
  });

  // 4) Mikrofon izni al => produce
  localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const audioTrack = localStream.getAudioTracks()[0];
  await sendTransport.produce({ track: audioTrack });
  console.log("Mikrofon produce ediliyor...");

  // 5) RecvTransport => createTransport => createRecvTransport => consume
  const recvParams = await createTransport();
  if (recvParams.error) {
    console.error("createTransport (recv) error:", recvParams.error);
    return;
  }
  recvTransport = device.createRecvTransport(recvParams);

  recvTransport.on('connect', ({ dtlsParameters }, callback, errback) => {
    console.log("recvTransport connect => dtls");
    socket.emit('connectTransport', {
      groupId: currentGroup,
      roomId: currentRoom,
      transportId: recvParams.transportId,
      dtlsParameters
    }, (res) => {
      if (res && res.error) {
        errback(res.error);
      } else {
        callback();
      }
    });
  });

  // 6) Mevcut producer'ları al => consume
  const producerIds = await listProducers();
  console.log("Mevcut producerId'ler =>", producerIds);
  for (const pid of producerIds) {
    await consumeProducer(pid);
  }
  console.log("startSfuFlow => tamamlandı.");
}

function createTransport() {
  return new Promise((resolve) => {
    socket.emit('createWebRtcTransport', {
      groupId: currentGroup,
      roomId: currentRoom
    }, (res) => {
      resolve(res);
    });
  });
}

function listProducers() {
  return new Promise((resolve) => {
    socket.emit('listProducers', {
      groupId: currentGroup,
      roomId: currentRoom
    }, (producerIds) => {
      resolve(producerIds || []);
    });
  });
}

async function consumeProducer(producerId) {
  if (!recvTransport) {
    console.warn("recvTransport yok => consumeProducer iptal");
    return;
  }
  const consumeParams = await new Promise((resolve) => {
    socket.emit('consume', {
      groupId: currentGroup,
      roomId: currentRoom,
      transportId: recvTransport.id,
      producerId
    }, (res) => {
      resolve(res);
    });
  });
  if (consumeParams.error) {
    console.error("consume error:", consumeParams.error);
    return;
  }
  console.log("consumeProducer =>", consumeParams);

  const consumer = await recvTransport.consume({
    id: consumeParams.id,
    producerId: consumeParams.producerId,
    kind: consumeParams.kind,
    rtpParameters: consumeParams.rtpParameters
  });
  // consumer track => <audio> elementinde çal
  const { track } = consumer;
  const audioEl = document.createElement('audio');
  audioEl.srcObject = new MediaStream([track]);
  audioEl.autoplay = true;
  audioEl.play()
    .catch(err => console.error("Audio play hata:", err));

  console.log("Yeni consumer oluşturuldu:", consumer.id);
}

/* Mikrofon / Deafen butonları */
micToggleButton.addEventListener('click', () => {
  if (!localStream) return;
  const audioTrack = localStream.getAudioTracks()[0];
  if (!audioTrack) return;
  audioTrack.enabled = !audioTrack.enabled;
  console.log("Mic toggled =>", audioTrack.enabled);

  // Sunucuya da audioStateChanged yollayalım
  socket.emit('audioStateChanged', {
    micEnabled: audioTrack.enabled,
    selfDeafened: false // basit örnek
  });
});
deafenToggleButton.addEventListener('click', () => {
  // Kendi kulağına gelen sesleri kapatmak => 
  // Tüm remote <audio> muted yapmak
  const remoteAudios = document.querySelectorAll('audio');
  remoteAudios.forEach(a => {
    a.muted = !a.muted;
  });
  console.log("Deafen toggled");
});
