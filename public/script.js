const socket = io();
let localStream;
let peers = {};

// Mikrofon erişimi al
navigator.mediaDevices.getUserMedia({ audio: true }).then((stream) => {
  localStream = stream;
});

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
    localStream.getTracks().forEach((track) => peer.addTrack(track, localStream));

    // ICE adaylarını gönder
    peer.onicecandidate = (event) => {
      if (event.candidate) {
        socket.emit("signal", { to: from, signal: event.candidate });
      }
    };

    // Ses stream'i geldiğinde çal
    peer.ontrack = (event) => {
      const audio = new Audio();
      audio.srcObject = event.streams[0];
      audio.play();
    };
  } else {
    peer = peers[from];
  }

  await peer.setRemoteDescription(new RTCSessionDescription(signal));
  if (signal.type === "offer") {
    const answer = await peer.createAnswer();
    await peer.setLocalDescription(answer);
    socket.emit("signal", { to: from, signal: peer.localDescription });
  }
});
