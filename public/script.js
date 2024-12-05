const socket = io();
let localStream;
let peers = {};

// Mikrofon erişimi al ve debug logları ekle
navigator.mediaDevices.getUserMedia({ audio: true })
  .then((stream) => {
    console.log("Mikrofon erişimi verildi:", stream); 
    localStream = stream;

    // Debug: Ses akışındaki tüm track'leri logla
    stream.getTracks().forEach((track) => {
      console.log("Track tipi:", track.kind, "Durum:", track.readyState);
    });
  })
  .catch((err) => console.error("Mikrofon erişimi reddedildi:", err));

// Kullanıcı bağlantı kurduğunda
socket.on("signal", async (data) => {
  const { from, signal } = data;
  let peer;

  if (!peers[from]) {
    peer = new RTCPeerConnection({
      iceServers: [
        { urls: "stun:stun.l.google.com:19302" }, // STUN sunucusu
      ],
    });
    peers[from] = peer;

    // Mikrofon stream'ini ekle
    if (localStream) {
      localStream.getTracks().forEach((track) => peer.addTrack(track, localStream));
    }

    // ICE adaylarını gönder ve debug logları ekle
    peer.onicecandidate = (event) => {
      if (event.candidate) {
        console.log("Yeni ICE Candidate gönderildi:", event.candidate); // ICE logu
        socket.emit("signal", { to: from, signal: event.candidate });
      } else {
        console.log("Tüm ICE Candidate'ler gönderildi."); // ICE işlemi bitti
      }
    };

    // Ses stream'i geldiğinde çal ve debug logları ekle
    peer.ontrack = (event) => {
      console.log("Remote stream alındı:", event.streams[0]); 
      event.streams[0].getTracks().forEach((track) => {
        console.log("Remote track tipi:", track.kind, "Durum:", track.readyState);
      });

      const audio = new Audio();
      audio.srcObject = event.streams[0];

      // Kullanıcı tıklamasıyla sesi başlat
      const playButton = document.getElementById('startCall');
      playButton.addEventListener('click', () => {
        audio.play().catch((err) => console.error("Ses oynatılamadı:", err));
      });

      console.log("Remote stream bağlı, sesi başlatmak için butona tıklayın.");
    };

    // ICE ve PeerConnection durumları
    peer.onconnectionstatechange = () => {
      console.log("PeerConnection durumu:", peer.connectionState);
    };

    peer.oniceconnectionstatechange = () => {
      console.log("ICE bağlantı durumu:", peer.iceConnectionState);
    };
  } else {
    peer = peers[from];
  }

  // Bağlantı sinyallerini işleyin
  await peer.setRemoteDescription(new RTCSessionDescription(signal));
  if (signal.type === "offer") {
    const answer = await peer.createAnswer();
    await peer.setLocalDescription(answer);
    console.log("Bağlantıya cevap verildi:", answer); 
    socket.emit("signal", { to: from, signal: peer.localDescription });
  }
});

// Debug: Kullanıcı bağlanma ve kopma logları
socket.on("connect", () => {
  console.log("WebSocket bağlantısı kuruldu. Kullanıcı ID:", socket.id);
});

socket.on("disconnect", () => {
  console.log("WebSocket bağlantısı kesildi.");
});
