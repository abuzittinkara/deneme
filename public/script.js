const socket = io();
let localStream;
let peers = {};
let audioPermissionGranted = false;
let remoteAudios = []; 
let username = null;

// Yeni eklenen değişkenler
let currentGroupId = null; // Şu an içinde olduğumuz grup

// Ekran elementleri
const usernameScreen = document.getElementById('usernameScreen');
const callScreen = document.getElementById('callScreen');
const usernameInput = document.getElementById('usernameInput');
const continueButton = document.getElementById('continueButton');

// Yeni eklenen elementler (index.html’de ekleyeceğiz)
let groupListDiv;
let newGroupNameInput;
let createGroupButton;

// Önceki elementler
const userTableBody = document.getElementById('userTableBody');

// Kullanıcı adı belirleme ekranı başlangıçta görünsün
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

// Sunucudan grup listesi aldığımızda ekranda güncelle
socket.on('group-list', (groups) => {
  updateGroupList(groups);
});

// Kullanıcı bir gruba katıldığında sunucudan geri yanıt alır
socket.on('joined-group', (data) => {
  currentGroupId = data.groupId;

  // data.members: Bu gruptaki tüm üyelerin listesi
  // Mikrofon izni yoksa önce mikrofon izni al, sonra bağlantıları kur
  ensureAudioPermission().then(() => {
    // Gruba katıldık, şimdi üyelerle peer bağlantıları kuralım
    // Kendi id'mizi çıkaralım
    const otherMembers = data.members.filter(m => m.id !== socket.id);
    // Halihazırda peers varsa sıfırla
    Object.keys(peers).forEach(pid => {
      if (peers[pid]) {
        peers[pid].close();
        delete peers[pid];
      }
    });

    otherMembers.forEach(member => {
      if (!peers[member.id]) {
        initPeer(member.id, true); // Biz offer başlatıyoruz
      }
    });
  });
});

// Sinyal alımı (önceki gibi kalıyor)
socket.on("signal", async (data) => {
  console.log("Signal alındı:", data);
  const { from, signal } = data;

  let peer;
  if (!peers[from]) {
    // localStream yoksa beklet
    if (!localStream) {
      console.warn("localStream henüz yok, sinyal geldi. Bekletiyoruz.");
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

// Kullanıcı listesi geldiğinde tabloyu güncelle
socket.on('user-list', (list) => {
  updateUserTable(list);
});

socket.on("connect", () => {
  console.log("WebSocket bağlantısı kuruldu. Kullanıcı ID:", socket.id);
});

socket.on("disconnect", () => {
  console.log("WebSocket bağlantısı kesildi.");
});

setInterval(() => {
  console.log("Mevcut PeerConnection'lar:", peers);
}, 10000);

// Audio izni alma fonksiyonu
async function ensureAudioPermission() {
  if (audioPermissionGranted && localStream) return;

  console.log("Mikrofon izni isteniyor...");
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    console.log("Mikrofon erişimi verildi:", stream);
    localStream = stream;
    audioPermissionGranted = true;

    // Daha önce gelen remote streamleri çal
    remoteAudios.forEach(audioEl => {
      audioEl.play().catch(err => console.error("Ses oynatılamadı:", err));
    });
    console.log("Ses oynatma izni verildi ve localStream elde edildi.");
  } catch (err) {
    console.error("Mikrofon erişimi reddedildi:", err);
  }
}

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
    console.warn("localStream yokken initPeer çağrıldı. Bekletebiliriz.");
    return;
  }

  if (peers[userId]) {
    console.log("Bu kullanıcı için zaten bir peer var, initPeer iptal.");
    return peers[userId];
  }

  console.log(`initPeer: userId=${userId}, isInitiator=${isInitiator}`);
  const peer = new RTCPeerConnection({
    iceServers: [
      { urls: "stun:stun.l.google.com:19302" },
      // Eğer TURN gerekirse burada ekleyebilirsiniz
    ],
  });
  peers[userId] = peer;

  if (localStream) {
    localStream.getTracks().forEach((track) => peer.addTrack(track, localStream));
  }

  peer.onicecandidate = (event) => {
    if (event.candidate) {
      socket.emit("signal", { to: userId, signal: event.candidate });
    }
  };

  peer.ontrack = (event) => {
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
  socket.emit("signal", { to: userId, signal: peer.localDescription });
}

// Grup listesini güncelleme fonksiyonu
function updateGroupList(groups) {
  // Eğer henüz oluşturmadıysak HTML elemanlarını oluşturalım
  if (!groupListDiv) {
    groupListDiv = document.createElement('div');
    const groupTitle = document.createElement('h3');
    groupTitle.textContent = "Gruplar";
    groupListDiv.appendChild(groupTitle);

    newGroupNameInput = document.createElement('input');
    newGroupNameInput.placeholder = "Grup adı";
    newGroupNameInput.className = "input-text";
    groupListDiv.appendChild(newGroupNameInput);

    createGroupButton = document.createElement('button');
    createGroupButton.textContent = "Grup Oluştur";
    createGroupButton.className = "btn primary";
    createGroupButton.style.marginTop = "10px";
    createGroupButton.addEventListener('click', () => {
      const gName = newGroupNameInput.value.trim();
      if (gName) {
        socket.emit('create-group', { groupName: gName });
        newGroupNameInput.value = "";
      }
    });
    groupListDiv.appendChild(createGroupButton);

    // Grup listesini gösteren alan
    const listContainer = document.createElement('div');
    listContainer.id = "groupListContainer";
    groupListDiv.appendChild(listContainer);

    const callCard = document.querySelector('#callScreen .card');
    callCard.appendChild(groupListDiv);
  }

  const listContainer = document.getElementById('groupListContainer');
  listContainer.innerHTML = '';
  
  groups.forEach(group => {
    const div = document.createElement('div');
    div.style.marginTop = "10px";
    div.style.cursor = "pointer";
    div.style.padding = "5px 10px";
    div.style.border = "1px solid #ccc";
    div.style.borderRadius = "4px";
    div.textContent = `${group.name} (${group.memberCount} üye)`;
    div.addEventListener('click', () => {
      // Gruba katıl
      socket.emit('join-group', { groupId: group.id });
    });
    listContainer.appendChild(div);
  });
}
