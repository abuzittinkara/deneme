const socket = io();
let localStream;
let peers = {};
let audioPermissionGranted = false;
let remoteAudios = []; 
let username = null;
let currentGroup = null; // Şu anki grup

// Bekleyen kullanıcı listeleri (ses izni alınmadan gelen kullanıcılar)
let pendingUsers = [];
let pendingNewUsers = [];

// Ekran elementleri
const loginScreen = document.getElementById('loginScreen');
const registerScreen = document.getElementById('registerScreen');
const callScreen = document.getElementById('callScreen');

// Login alanları
const loginUsernameInput = document.getElementById('loginUsernameInput');
const loginPasswordInput = document.getElementById('loginPasswordInput');
const loginButton = document.getElementById('loginButton');

// Register alanları
const regUsernameInput = document.getElementById('regUsernameInput');
const regNameInput = document.getElementById('regNameInput');
const regSurnameInput = document.getElementById('regSurnameInput');
const regBirthdateInput = document.getElementById('regBirthdateInput');
const regEmailInput = document.getElementById('regEmailInput');
const regPhoneInput = document.getElementById('regPhoneInput');
const regPasswordInput = document.getElementById('regPasswordInput');
const regPasswordConfirmInput = document.getElementById('regPasswordConfirmInput');
const registerButton = document.getElementById('registerButton');

// Geri gel butonu
const backToLoginButton = document.getElementById('backToLoginButton');

// Ekran değiştirme linkleri
const showRegisterScreen = document.getElementById('showRegisterScreen');
const showLoginScreen = document.getElementById('showLoginScreen');

// Grup oluşturma ve listeleme elemanları
const groupListDiv = document.getElementById('groupList');
const createGroupButton = document.getElementById('createGroupButton');

// Sağ paneldeki kullanıcı listesi
const userListDiv = document.getElementById('userList');

// Modal elemanları
const groupModal = document.getElementById('groupModal');
const modalGroupName = document.getElementById('modalGroupName');
const modalCreateGroupButton = document.getElementById('modalCreateGroupButton');
const modalCloseButton = document.getElementById('modalCloseButton');

// ----------------------
// DM / GRUP Sekmesi Geçiş
// ----------------------
const sidebar = document.getElementById('sidebar');
const dmPanel = document.getElementById('dmPanel');
const toggleDMButton = document.getElementById('toggleDMButton');

let isDMMode = false;

// İki farklı inline SVG (mektup ve kullanıcı/grup)
const envelopeIcon = `
<svg width="24" height="24" fill="none" stroke="currentColor" stroke-width="2"
     stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24">
  <path d="M4 4h16c1.1 0 2 .9 2 2v12c0
           1.1-.9 2-2 2H4c-1.1 
           0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path>
  <polyline points="22,6 12,13 2,6"></polyline>
</svg>`;

const usersIcon = `
<svg fill="#ffffff" width="24" height="24" viewBox="0 0 640 512" xmlns="http://www.w3.org/2000/svg">
  <path d="M96 96C96 42.98 138.1 0 192 0C245 0 288 42.98 288 
   96C288 149 245 192 192 192C138.1 192 96 149 96 96zM640 
   224C640 188.7 611.3 160 576 160C540.7 160 512 188.7 512 
   224C512 259.3 540.7 288 576 288C611.3 288 640 259.3 640 
   224zM512 384C512 337.1 476.1 304 432 304H400.6C405.4 315 
   409.4 326.2 411.1 338.3C412.6 345.2 413.8 352.3 414.3 
   359.4C438.4 371.4 455.4 393.3 455.4 419.3V448H592C600.8 
   448 608 440.8 608 432C608 419.5 603.6 407.8 595.5 398.3C577.4 
   378.4 552.5 368 527.2 368C519.4 368 511.8 367.3 504.6 366.1C503.7 
   366 502.7 366 501.7 365.1C494.3 364.2 487.3 363.3 481.4 363C476.7 
   362.6 472.1 362.1 467.4 361.1C460.5 359.9 453.5 359.7 446.7 359.3C444.2 
   359.2 441.7 359 439.2 359H427.2C442.7 373.3 448 397.5 448 416V448H512V384zM224 
   264C154.1 264 96 322.1 96 392V448H352V392C352 322.1 293.9 264 224 264zM448 96C448 
   149 490.1 192 544 192C597 192 640 149 640 96C640 42.98 597 0 544 0C490.1 0 448 
   42.98 448 96z"/>
</svg>`;

toggleDMButton.addEventListener('click', () => {
  isDMMode = !isDMMode;
  if (isDMMode) {
    // DM moduna geç
    sidebar.classList.add('sidebar-expanded');
    dmPanel.style.display = 'block';
    groupListDiv.style.display = 'none';
    // Butona grup ikonu yerleştir
    toggleDMButton.innerHTML = usersIcon;
  } else {
    // Grup moduna dön
    sidebar.classList.remove('sidebar-expanded');
    dmPanel.style.display = 'none';
    groupListDiv.style.display = 'flex';
    // Butona tekrar mektup ikonu
    toggleDMButton.innerHTML = envelopeIcon;
  }
});

// Ekran geçişleri
showRegisterScreen.addEventListener('click', () => {
  loginScreen.style.display = 'none';
  registerScreen.style.display = 'block';
});

showLoginScreen.addEventListener('click', () => {
  registerScreen.style.display = 'none';
  loginScreen.style.display = 'block';
});

// Geri dön butonu (register -> login)
backToLoginButton.addEventListener('click', () => {
  registerScreen.style.display = 'none';
  loginScreen.style.display = 'block';
});

// Giriş yap butonu
loginButton.addEventListener('click', () => {
  const usernameVal = loginUsernameInput.value.trim();
  const passwordVal = loginPasswordInput.value.trim();
  if (!usernameVal || !passwordVal) {
    alert("Lütfen kullanıcı adı ve parola girin.");
    return;
  }
  socket.emit('login', { username: usernameVal, password: passwordVal });
});

// Kayıt ol butonu
registerButton.addEventListener('click', () => {
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
  
  if (!userData.username || !userData.name || !userData.surname || 
      !userData.birthdate || !userData.email || !userData.phone ||
      !userData.password || !userData.passwordConfirm) {
    alert("Lütfen tüm alanları doldurun.");
    return;
  }

  if (userData.username !== userData.username.toLowerCase()) {
    alert("Kullanıcı adı sadece küçük harf olmalı.");
    return;
  }

  if (userData.password !== userData.passwordConfirm) {
    alert("Parolalar eşleşmiyor!");
    return;
  }

  socket.emit('register', userData);
});

// Sunucudan login sonucu
socket.on('loginResult', (data) => {
  if (data.success) {
    username = data.username;
    loginScreen.style.display = 'none';
    callScreen.style.display = 'flex';
    socket.emit('set-username', username);
  } else {
    alert("Giriş başarısız: " + data.message);
  }
});

// Sunucudan register sonucu
socket.on('registerResult', (data) => {
  if (data.success) {
    alert("Kayıt başarılı! Şimdi giriş yapabilirsiniz.");
    registerScreen.style.display = 'none';
    loginScreen.style.display = 'block';
  } else {
    alert("Kayıt başarısız: " + data.message);
  }
});

// ---------------------
// Modal ile Grup Oluştur
// ---------------------
createGroupButton.addEventListener('click', () => {
  // Modal aç
  groupModal.style.display = 'flex';
  modalGroupName.value = '';
  modalGroupName.focus();
});

// Modal içi “Oluştur” butonu
modalCreateGroupButton.addEventListener('click', () => {
  const grpName = modalGroupName.value.trim();
  if (grpName) {
    socket.emit('createGroup', grpName);
    groupModal.style.display = 'none';
  } else {
    alert("Lütfen bir grup adı girin");
  }
});

// Modal içi “Kapat” butonu
modalCloseButton.addEventListener('click', () => {
  groupModal.style.display = 'none';
});

// Gruba katılma fonksiyonu
function joinGroup(groupName) {
  // Başka bir gruptaysak, tüm peer bağlantılarını kapat
  if (currentGroup && currentGroup !== groupName) {
    closeAllPeers();
    audioPermissionGranted = false;
    localStream = null;
  }

  // Yeni gruba katıl
  socket.emit('joinGroup', groupName);
  currentGroup = groupName;
}

// Sunucudan grup listesi
socket.on('groupsList', (groupNames) => {
  groupListDiv.innerHTML = '';
  groupNames.forEach(grp => {
    const grpItem = document.createElement('div');
    grpItem.className = 'grp-item';
    grpItem.innerText = grp[0].toUpperCase(); 
    grpItem.title = grp; 
    grpItem.addEventListener('click', () => {
      joinGroup(grp);
    });
    groupListDiv.appendChild(grpItem);
  });
});

// Sunucudan güncel kullanıcı listesi
socket.on('groupUsers', (usersInGroup) => {
  updateUserList(usersInGroup); // Artık tablo değil, liste yapısı kullanıyoruz

  // WebRTC peer bağlantılarının yönetimi
  const otherUserIds = usersInGroup
    .filter(u => u.id !== socket.id)
    .map(u => u.id)
    .filter(id => !peers[id]);

  if (!audioPermissionGranted || !localStream) {
    requestMicrophoneAccess().then(() => {
      if (otherUserIds.length > 0) {
        otherUserIds.forEach(userId => {
          if (!peers[userId]) initPeer(userId, true);
        });
      }
      pendingUsers.forEach(userId => {
        if (!peers[userId]) initPeer(userId, true);
      });
      pendingUsers = [];

      pendingNewUsers.forEach(userId => {
        if (!peers[userId]) initPeer(userId, false);
      });
      pendingNewUsers = [];
    }).catch(err => {
      console.error("Mikrofon izni alınamadı:", err);
    });
  } else {
    otherUserIds.forEach(userId => {
      if (!peers[userId]) {
        initPeer(userId, true);
      }
    });
  }
});

// Kullanıcı listesini sağ panelde güncelleyen fonksiyon
function updateUserList(usersInGroup) {
  userListDiv.innerHTML = ''; 
  usersInGroup.forEach(user => {
    // Her kullanıcı için .user-item oluştur
    const userItem = document.createElement('div');
    userItem.classList.add('user-item');

    // Profil fotoğrafı (şimdilik boş)
    const profileThumb = document.createElement('div');
    profileThumb.classList.add('profile-thumb');

    // Kullanıcı adı
    const userNameSpan = document.createElement('span');
    userNameSpan.classList.add('user-name');
    userNameSpan.textContent = user.username || '(İsimsiz)';

    // ID kopyala butonu (Socket ID’yi panoya kopyalayacak)
    const copyIdButton = document.createElement('button');
    copyIdButton.classList.add('copy-id-btn');
    copyIdButton.textContent = "ID Kopyala";
    copyIdButton.dataset.userid = user.id; 
    copyIdButton.addEventListener('click', (e) => {
      e.stopPropagation(); // Kullanıcı item click eventini tetiklemesin
      const socketId = e.target.dataset.userid;
      navigator.clipboard.writeText(socketId)
        .then(() => {
          alert("Kullanıcı ID kopyalandı: " + socketId);
        })
        .catch(err => {
          console.error("Kopyalama hatası:", err);
          alert("Kopyalama başarısız!");
        });
    });

    // Elemanları userItem içine ekle
    userItem.appendChild(profileThumb);
    userItem.appendChild(userNameSpan);
    userItem.appendChild(copyIdButton);

    // userListDiv'e ekle
    userListDiv.appendChild(userItem);
  });
}

async function requestMicrophoneAccess() {
  console.log("Mikrofon izni isteniyor...");
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  console.log("Mikrofon erişimi verildi:", stream); 
  localStream = stream;
  audioPermissionGranted = true;
  remoteAudios.forEach(audioEl => {
    audioEl.play().catch(err => console.error("Ses oynatılamadı:", err));
  });
}

socket.on("signal", async (data) => {
  console.log("Signal alındı:", data);
  const { from, signal } = data;

  let peer;
  if (!peers[from]) {
    if (!localStream) {
      console.warn("localStream henüz yok, ama signal alındı. Bu kullanıcıyı bekletiyoruz.");
      pendingNewUsers.push(from);
      return;
    }
    peer = initPeer(from, false);
  } else {
    peer = peers[from];
  }

  if (signal.type === "offer") {
    await peer.setRemoteDescription(new RTCSessionDescription(signal));
    const answer = await peer.createAnswer();
    await peer.setLocalDescription(answer);
    console.log("Bağlantıya cevap verildi (answer):", answer);
    socket.emit("signal", { to: from, signal: peer.localDescription });
  } else if (signal.type === "answer") {
    await peer.setRemoteDescription(new RTCSessionDescription(signal));
  } else if (signal.candidate) {
    await peer.addIceCandidate(new RTCIceCandidate(signal));
    console.log("ICE Candidate eklendi:", signal);
  }
});

function initPeer(userId, isInitiator) {
  if (!localStream || !audioPermissionGranted) {
    console.warn("localStream yokken initPeer çağrıldı. Bu kullanıcı bekletilecek.");
    if (isInitiator) {
      pendingUsers.push(userId);
    } else {
      pendingNewUsers.push(userId);
    }
    return;
  }

  if (peers[userId]) {
    console.log("Bu kullanıcı için zaten bir peer var, initPeer iptal.");
    return peers[userId];
  }

  console.log(`initPeer çağrıldı: userId=${userId}, isInitiator=${isInitiator}`);
  const peer = new RTCPeerConnection({
    iceServers: [
      { urls: "stun:stun.l.google.com:19302" },
    ],
  });
  peers[userId] = peer;

  if (localStream) {
    localStream.getTracks().forEach(track => peer.addTrack(track, localStream));
  }

  peer.onicecandidate = (event) => {
    if (event.candidate) {
      console.log("Yeni ICE Candidate oluşturuldu:", event.candidate);
      socket.emit("signal", { to: userId, signal: event.candidate });
    } else {
      console.log("ICE Candidate süreci tamamlandı.");
    }
  };

  peer.oniceconnectionstatechange = () => {
    console.log("ICE bağlantı durumu:", peer.iceConnectionState);
  };

  peer.onconnectionstatechange = () => {
    console.log("PeerConnection durumu:", peer.connectionState);
  };

  peer.ontrack = (event) => {
    console.log("Remote stream alındı...");
    const audio = new Audio();
    audio.srcObject = event.streams[0];
    audio.autoplay = false; 
    audio.muted = false;
    remoteAudios.push(audio);

    if (audioPermissionGranted) {
      audio.play().catch(err => console.error("Ses oynatılamadı:", err));
    }
  };

  if (isInitiator) {
    createOffer(peer, userId);
  }

  return peer;
}

async function createOffer(peer, userId) {
  const offer = await peer.createOffer();
  await peer.setLocalDescription(offer);
  console.log("Offer oluşturuldu ve gönderildi:", offer);
  socket.emit("signal", { to: userId, signal: peer.localDescription });
}

function closeAllPeers() {
  for (const userId in peers) {
    if (peers[userId]) {
      peers[userId].close();
      delete peers[userId];
    }
  }
  remoteAudios = [];
}

socket.on("connect", () => {
  console.log("WebSocket bağlantısı kuruldu. Kullanıcı ID:", socket.id);
});

socket.on("disconnect", () => {
  console.log("WebSocket bağlantısı kesildi.");
});

// Debug amaçlı periyodik log
setInterval(() => {
  console.log("Mevcut PeerConnection'lar:", peers);
}, 10000);
