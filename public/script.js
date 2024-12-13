const socket = io();
let localStream;
let peers = {};
let audioPermissionGranted = false;
let remoteAudios = []; 
let username = null; // Kullanıcı adını burada saklayacağız

// Ekran elementleri
const usernameScreen = document.getElementById('usernameScreen');
const callScreen = document.getElementById('callScreen');
const usernameInput = document.getElementById('usernameInput');
const continueButton = document.getElementById('continueButton');
const startCallButton = document.getElementById('startCall');

// Başlangıçta sadece username ekranı görünsün
usernameScreen.style.display = 'block';
callScreen.style.display = 'none';

// Kullanıcı "Devam Et" butonuna basınca
continueButton.addEventListener('click', () => {
  const val = usernameInput.value.trim();
  if(val) {
    username = val;
    // Kullanıcı ismi belirlendikten sonra ekrana geç
    usernameScreen.style.display = 'none';
    callScreen.style.display = 'block';
  } else {
    alert("Lütfen bir kullanıcı adı girin.");
  }
});

// "Sesi Başlat" butonuna basıldığında otomatik oynatmaya izin ver
startCallButton.addEventListener('click', () => {
  audioPermissionGranted = true;
  console.log("Ses oynatma izni verildi.");

  // Şimdi remoteAudios içindeki tüm sesleri çal
  remoteAudios.forEach(audioEl => {
    audioEl.play().catch(err => console.error("Ses oynatılamadı:", err));
  });
});

navigator.mediaDevices.getUserMedia({ audio: true })
  .then((stream) => {
    console.log("Mikrofon erişimi verildi:", stream); 
    localStream = stream;

    stream.getTracks().forEach((track) => {
      console.log("Track tipi:", track.kind, "Durum:", track.readyState);
    });
  })
  .catch((err) => console.error("Mikrofon erişimi reddedildi:", err));

socket.on("users", (users) => {
  console.log("Mevcut kullanıcılar:", users);
  users.forEach((userId) => {
    initPeer(userId, true); 
  });
});

socket.on("new-user", (userId) => {
  console.log("Yeni kullanıcı bağlandı:", userId);
  initPeer(userId, false);
});

socket.on("signal", async (data) => {
  console.log("Signal alındı:", data);
  const { from, signal } = data;

  let peer;
  if (!peers[from]) {
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
  const peer = new RTCPeerConnection({
    iceServers: [
      { urls: "stun:stun.l.google.com:19302" },
      // TURN sunucusu gerekiyorsa buraya ekleyebilirsiniz
      // {
      //   urls: "turn:YOUR_TURN_SERVER",
      //   username: "USER",
      //   credential: "PASS"
      // }
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
    const audio = new Audio();
    audio.srcObject = event.streams[0];
    audio.autoplay = false; // Otomatik oynatmayı kapatın
    audio.muted = false;
    remoteAudios.push(audio);
  
    console.log("Remote stream alındı ama ses başlatılmadı. Bekliyoruz...");
  };

    const audio = new Audio();
    audio.srcObject = event.streams[0];
    audio.autoplay = true; 
    audio.muted = false;

    remoteAudios.push(audio);

    if (audioPermissionGranted) {
      audio.play().catch(err => console.error("Ses oynatılamadı:", err));
    } else {
      console.log("Ses başlatılmadı. Butona basıldıktan sonra audio.play() çağrısına gerek kalmaz.");
    }    

    console.log("Remote stream bağlı.");
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
