// public/script.js
const socket = io();
let localStream;
let peers = {};

// Access microphone
navigator.mediaDevices.getUserMedia({ audio: true }).then((stream) => {
  localStream = stream;
});

// Start call button
document.getElementById("startCall").addEventListener("click", () => {
  socket.emit("join");
});

// Handle signaling
socket.on("signal", async (data) => {
  const { from, signal } = data;
  let peer;

  if (!peers[from]) {
    peer = new RTCPeerConnection();
    peers[from] = peer;

    // Add local stream tracks to peer
    localStream.getTracks().forEach((track) => peer.addTrack(track, localStream));

    // Send signaling data back to the other peer
    peer.onicecandidate = (event) => {
      if (event.candidate) {
        socket.emit("signal", { to: from, signal: event.candidate });
      }
    };

    // Play remote audio stream
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
