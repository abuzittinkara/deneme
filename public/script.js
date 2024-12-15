const socket = io();
let localStream;
let peers = {};
let audioPermissionGranted = false;
let remoteAudios = []; 
let username = null;

// Bekleyen kullanıcı listeleri (ses izni alınmadan gelen kullanıcılar)
let pendingUsers = [];
let pendingNewUsers = [];

// Ekran elementleri
const usernameScreen = document.getElementById('usernameScreen');
const callScreen = document.getElementById('callScreen');
const usernameInput = document.getElementById('usernameInput');
const continueButton = document.getElementById('continueButton');
const startCallButton = document.getElementById('startCall');
const userTableBody = document.getElementById('userTableBody');

// Başlangıçta sadece username ekranı görünsün
usernameScreen.style.display = 'block';
callScreen.style.display = 'none';

continueButton.addEventListener('click', () => {
  const val = usernameInput.value.trim();
  if(val) {
    username = val;
    usernameScreen.style.display = 'none';
    callScreen.style.display = 'block';
    socket.emit('set-username', username);
  } else {
    alert("Lütfen bir kullanıcı adı girin.");
  }
});

// "Sesi Başlat" butonuna basıldığında mikrofon izni iste
startCallButton.addEventListener('click', () => {
  console.log("Sesi Başlat butonuna basıldı. Mikrofon izni isteniyor...");
  navigator.mediaDevices.getUserMedia({ audio: true })
    .then((stream) => { 
      console.log("Mikrofon erişimi verildi:", stream); 
      localStream = stream;
      audioPermissionGranted = true;

      // Önceden gelen remote streamleri çal
      remoteAudios.forEach(audioEl => {
        audioEl.play().catch(err => console.error("Ses oynatılamadı:", err));
      });

      console.log("Ses oynatma izni verildi ve localStream elde edildi.");

      // Bekleyen kullanıcılar için peer oluştur (ses izni şimdi var)
      pendingUsers.forEach(userId => {
        if (!peers[userId]) initPeer(userId, true);
      });
      pendingUsers = [];

      pendingNewUsers.forEach(userId => {
        if (!peers[userId]) initPeer(userId, false);
      });
      pendingNewUsers = [];

    })
    .catch((err) => console.error("Mikrofon erişimi reddedildi:", err));
});

// Kullanıcı listesi geldiğinde tabloyu güncelle ve eğer izinler varsa yeni peers başlat
socket.on('user-list', (list) => {
  updateUserTable(list);

  // Kendi id dışındaki kullanıcıları al
  const userIds = list
    .filter(u => u.id !== socket.id)
    .map(u => u.id)
    .filter(id => !peers[id]);  // Zaten peer oluşturulmuş kullanıcıları atla

  // localStream varsa hemen peer başlat, yoksa pendingUsers'a at
  if (audioPermissionGranted && localStream) {
    userIds.forEach(userId => {
      if (!peers[userId]) {
        initPeer(userId, true);
      }
    });
  } else {
    // Ses izni yoksa bekleyenlere ekle
    pendingUsers = pendingUsers.concat(userIds);
  }
});

// Yeni bir kullanıcı bağlandığında
socket.on("new-user", (userId) => {
  console.log("Yeni kullanıcı bağlandı:", userId);
  
  // Bu kullanıcı için zaten peer varsa tekrar initPeer yapma
  if (peers[userId]) {
    console.log("Bu kullanıcı için zaten bir peer bağlantısı var, initPeer çağrılmayacak.");
    return;
  }

  // localStream yoksa beklet, varsa direkt initPeer
  if (audioPermissionGranted && localStream) {
    initPeer(userId, false);
  } else {
    pendingNewUsers.push(userId);
  }
});

// Sinyal alımı
socket.on("signal", async (data) => {
  console.log("Signal alındı:", data);
  const { from, signal } = data;

  let peer;
  if (!peers[from]) {
    // localStream yoksa henüz peer oluşturmayacağız. Ancak bu nokta genelde sinyal geldiğine göre peer gerekiyor.
    // Yine de kontrol ekleyelim.
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

function updateUserTable(userList) {
  userTableBody.innerHTML = '';
  userList.forEach(user => {
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

  // Aynı kullanıcı için birden fazla peer oluşturulmasını engelle
  if (peers[userId]) {
    console.log("Bu kullanıcı için zaten bir peer var, initPeer iptal.");
    return peers[userId];
  }

  console.log(`initPeer çağrıldı: userId=${userId}, isInitiator=${isInitiator}`);
  const peer = new RTCPeerConnection({
    iceServers: [
      { urls: "stun:stun.l.google.com:19302" },
      // Gerekirse buraya TURN server ekleyin
    ],
  });
  peers[userId] = peer;

  if (localStream) {
    localStream.getTracks().forEach((track) => peer.addTrack(track, localStream));
  } else {
    console.warn("initPeer içinde hala localStream yok! Bu durum normalde yaşanmamalı.");
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
    console.log("Remote stream alındı ama ses hemen başlatılmayacak, izin bekleniyor...");
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

socket.on("connect", () => {
  console.log("WebSocket bağlantısı kuruldu. Kullanıcı ID:", socket.id);
});

socket.on("disconnect", () => {
  console.log("WebSocket bağlantısı kesildi.");
});

setInterval(() => {
  console.log("Mevcut PeerConnection'lar:", peers);
}, 10000);
