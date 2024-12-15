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
const usernameScreen = document.getElementById('usernameScreen');
const callScreen = document.getElementById('callScreen');
const usernameInput = document.getElementById('usernameInput');
const continueButton = document.getElementById('continueButton');
const userTableBody = document.getElementById('userTableBody');

// Grup oluşturma ve listeleme elemanları
// Artık gruplar sol kenar çubuğunda listelenecek.
// Yeni HTML yapısında groupList yerine sidebarGroupList kullanıyoruz.
const sidebarGroupList = document.getElementById('sidebarGroupList');
const createGroupInput = document.getElementById('createGroupInput');
const createGroupButton = document.getElementById('createGroupButton');
const createGroupContainer = document.getElementById('createGroupContainer');
const createGroupButtonIcon = document.getElementById('createGroupButtonIcon');

usernameScreen.style.display = 'block';
callScreen.style.display = 'none';

continueButton.addEventListener('click', () => {
  const val = usernameInput.value.trim();
  if(val) {
    username = val;
    usernameScreen.style.display = 'none';
    callScreen.style.display = 'flex';
    socket.emit('set-username', username);
  } else {
    alert("Lütfen bir kullanıcı adı girin.");
  }
});

createGroupButton.addEventListener('click', () => {
  const grpName = createGroupInput.value.trim();
  if (grpName) {
    socket.emit('createGroup', grpName);
    createGroupInput.value = '';
    // Grup oluşturulduktan sonra input alanını gizleyebilirsiniz.
    createGroupContainer.style.display = 'none';
  }
});

// + ikonuna basınca grup oluşturma alanını aç/kapa
createGroupButtonIcon.addEventListener('click', () => {
  if (createGroupContainer.style.display === 'none') {
    createGroupContainer.style.display = 'flex';
  } else {
    createGroupContainer.style.display = 'none';
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

// Sunucudan grup listesi geldiğinde güncelle
socket.on('groupsList', (groupNames) => {
  sidebarGroupList.innerHTML = '';
  groupNames.forEach(grp => {
    const grpItem = document.createElement('div');
    grpItem.className = 'group-item';
    grpItem.innerText = grp.charAt(0).toUpperCase(); // Grup ilk harfi
    grpItem.title = grp; // Hover'da tam grup adı görünsün
    
    grpItem.addEventListener('click', () => {
      joinGroup(grp);
    });

    // Eğer bu grup şu an aktif kullanıcının grubu ise active class ekle
    if (currentGroup === grp) {
      grpItem.classList.add('active');
    }

    sidebarGroupList.appendChild(grpItem);
  });
});

// Gruba ait kullanıcı listesi geldiğinde tabloyu güncelle
socket.on('groupUsers', (usersInGroup) => {
  updateUserTable(usersInGroup);

  const otherUserIds = usersInGroup
    .filter(u => u.id !== socket.id)
    .map(u => u.id)
    .filter(id => !peers[id]);  // zaten peer varsa atla

  // Eğer mikrofon izni yoksa şimdi isteyelim (ilk defa gruba giriyoruz veya değiştik)
  if (!audioPermissionGranted || !localStream) {
    requestMicrophoneAccess().then(() => {
      // Mikrofon izni alındıktan sonra pending kullanıcılarla bağlantı kur
      if (otherUserIds.length > 0) {
        otherUserIds.forEach(userId => {
          if (!peers[userId]) {
            initPeer(userId, true);
          }
        });
      }

      // Bekleyen kullanıcılar için peer oluştur (ses izni şimdi var)
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
    // Zaten mikrofon izni varsa doğrudan peer bağlantılarını kur
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
    console.log("Remote stream alındı, ses izni bekleniyor...");
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
