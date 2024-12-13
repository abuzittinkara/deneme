const socket = io();
let localStream;
let peers = {};
let audioPermissionGranted = false;

// Mikrofon erişimi al
navigator.mediaDevices.getUserMedia({ audio: true })
  .then((stream) => {
    console.log("Mikrofon erişimi verildi:", stream); 
    localStream = stream;

    stream.getTracks().forEach((track) => {
      console.log("Track tipi:", track.kind, "Durum:", track.readyState);
    });
  })
  .catch((err) => console.error("Mikrofon erişimi reddedildi:", err));

// Mevcut kullanıcıları al
socket.on("users", (users) => {
  console.log("Mevcut kullanıcılar:", users);
  // Mevcut kullanıcılara offer gönder
  users.forEach((userId) => {
    initPeer(userId, true);
  });
});

// Yeni bir kullanıcı bağlandığında, ondan offer bekle (biz answer vereceğiz)
socket.on("new-user", (userId) => {
  console.log("Yeni kullanıcı bağlandı:", userId);
  initPeer(userId, false);
});

// Sinyal alımı
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

// Peer oluşturma fonksiyonu
function initPeer(userId, isInitiator) {
  const peer = new RTCPeerConnection({
    iceServers: [
      { urls: "stun:stun.l.google.com:19302" },
    ],
  });
  peers[userId] = peer;

  // Lokal stream ekle
  if (localStream) {
    localStream.getTracks().forEach((track) => peer.addTrack(track, localStream));
  }

  // ICE candidate
  peer.onicecandidate = (event) => {
    if (event.candidate) {
      console.log("Yeni ICE Candidate oluşturuldu:", event.candidate);
      socket.emit("signal", { to: userId, signal: event.candidate });
    } else {
      console.log("ICE Candidate süreci tamamlandı.");
    }
  };

  // Durum değişiklikleri logla
  peer.oniceconnectionstatechange = () => {
    console.log("ICE bağlantı durumu:", peer.iceConnectionState);
  };

  peer.onconnectionstatechange = () => {
    console.log("PeerConnection durumu:", peer.connectionState);
  };

  // Remote stream alındığında
  peer.ontrack = (event) => {
    console.log("Remote stream alındı:", event.streams[0]);
    event.streams[0].getTracks().forEach((track) => {
      console.log("Remote track tipi:", track.kind, "Durum:", track.readyState);
    });

    const audio = new Audio();
    audio.srcObject = event.streams[0];
    audio.autoplay = true; 
    audio.muted = false;

    // Kullanıcı "Sesi Başlat" butonuna bastıysa otomatik olarak çalmaya çalış
    if (audioPermissionGranted) {
      audio.play().catch((err) => console.error("Ses oynatılamadı:", err));
    } else {
      console.log("Kullanıcı henüz 'Sesi Başlat' butonuna basmadı. Ses devreye girmeyebilir.");
    }

    console.log("Remote stream bağlı.");
  };

  // Eğer bağlantıyı başlatan kişi ise offer oluştur
  if (isInitiator) {
    createOffer(peer, userId);
  }

  return peer;
}

// Offer oluşturma fonksiyonu
async function createOffer(peer, userId) {
  const offer = await peer.createOffer();
  await peer.setLocalDescription(offer);
  console.log("Offer oluşturuldu ve gönderildi:", offer);
  socket.emit("signal", { to: userId, signal: peer.localDescription });
}

// WebSocket bağlantı durumu
socket.on("connect", () => {
  console.log("WebSocket bağlantısı kuruldu. Kullanıcı ID:", socket.id);
});

socket.on("disconnect", () => {
  console.log("WebSocket bağlantısı kesildi.");
});

// "Sesi Başlat" butonuna basıldığında otomatik oynatma izni ver
const playButton = document.getElementById('startCall');
playButton.addEventListener('click', () => {
  audioPermissionGranted = true;
  console.log("Ses oynatma izni verildi. Yeni gelen stream'ler otomatik olarak çalınacaktır.");
});

// Periyodik peer logları
setInterval(() => {
  console.log("Mevcut PeerConnection'lar:", peers);
}, 10000);
