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

// Ekran değiştirme linkleri
const showRegisterScreen = document.getElementById('showRegisterScreen');
const showLoginScreen = document.getElementById('showLoginScreen');

// Grup oluşturma ve listeleme elemanları
const groupListDiv = document.getElementById('groupList');
const createGroupInput = document.getElementById('createGroupInput');
const createGroupButton = document.getElementById('createGroupButton');

// Kullanıcı tablosu
const userTableBody = document.getElementById('userTableBody');

// Ekran geçişleri
showRegisterScreen.addEventListener('click', () => {
  loginScreen.style.display = 'none';
  registerScreen.style.display = 'block';
});

showLoginScreen.addEventListener('click', () => {
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
    callScreen.style.display = 'block';
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

// Grup oluştur
createGroupButton.addEventListener('click', () => {
  const grpName = createGroupInput.value.trim();
  if (grpName) {
    socket.emit('createGroup', grpName);
    createGroupInput.value = '';
  }
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
    grpItem.innerText = grp;
    grpItem.style.cursor = 'pointer';
    grpItem.style.padding = '0.5rem';
    grpItem.style.border = '1px solid #ddd';
    grpItem.style.marginBottom = '0.5rem';
    grpItem.style.borderRadius = '4px';
    grpItem.addEventListener('click', () => {
      joinGroup(grp);
    });
    groupListDiv.appendChild(grpItem);
  });
});

// Gruba ait kullanıcı listesi
socket.on('groupUsers', (usersInGroup) => {
  updateUserTable(usersInGroup);

  const otherUserIds = usersInGroup
    .filter(u => u.id !== socket.id)
    .map(u => u.id)
    .filter(id => !peers[id]);

  if (!audioPermissionGranted || !localStream) {
    requestMicrophoneAccess().then(() => {
      if (otherUserIds.length > 0) {
        otherUserIds.forEach(userId => {
          if (!peers[userId]) {
            initPeer(userId, true);
          }
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

function updateUserTable(usersInGroup) {
  userTableBody.innerHTML = '';
  usersInGroup.forEach(user => {
    const tr = document.createElement('tr');
    const tdUsername = document.createElement('td');
    const tdId = document.createElement('td');
    tdUsername.textContent = user.username || '(İsimsiz)';
    tdId.textContent = user.id;
    tr.appendChild(tdUsername);
    tr.appendChild(tdId);
    userTableBody.appendChild(tr);
  });
}

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
    localStream.getTracks().forEach((track) => peer.addTrack(track, localStream));
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

setInterval(() => {
  console.log("Mevcut PeerConnection'lar:", peers);
}, 10000);
