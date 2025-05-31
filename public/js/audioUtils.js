export const SPEAKING_THRESHOLD = 0.02;
export const VOLUME_CHECK_INTERVAL = 100;
let audioAnalyzers = {};

export async function startVolumeAnalysis(stream, userId) {
  if (!stream.getAudioTracks().length) {
    console.warn('No audio tracks in MediaStream for user:', userId);
    return;
  }
  stopVolumeAnalysis(userId);
  const audioContext = new AudioContext();
  const source = audioContext.createMediaStreamSource(stream);
  const analyser = audioContext.createAnalyser();
  analyser.fftSize = 512;
  source.connect(analyser);
  const dataArray = new Uint8Array(analyser.fftSize);
  const interval = setInterval(() => {
    analyser.getByteTimeDomainData(dataArray);
    let sum = 0;
    for (let i = 0; i < dataArray.length; i++) {
      const val = (dataArray[i] - 128) / 128.0;
      sum += Math.abs(val);
    }
    const average = sum / dataArray.length;
    const avatarElem = document.getElementById(`avatar-${userId}`);
    if (avatarElem) {
      if (average > SPEAKING_THRESHOLD) {
        avatarElem.classList.add('speaking');
      } else {
        avatarElem.classList.remove('speaking');
      }
    }
  }, VOLUME_CHECK_INTERVAL);
  audioAnalyzers[userId] = {
    audioContext,
    analyser,
    dataArray,
    interval,
  };
}

export function stopVolumeAnalysis(userId) {
  if (audioAnalyzers[userId]) {
    clearInterval(audioAnalyzers[userId].interval);
    audioAnalyzers[userId].audioContext.close().catch(() => {});
    delete audioAnalyzers[userId];
  }
}

export function applyAudioStates({
  localProducer,
  localStream,
  socket,
  micEnabled,
  selfDeafened,
  micToggleButton,
  remoteAudios,
  hasMic,
}) {
  if (localProducer) {
    if (micEnabled && !selfDeafened) {
      localProducer.resume();
      if (!audioAnalyzers[socket.id]) {
        startVolumeAnalysis(localStream, socket.id);
      }
    } else {
      localProducer.pause();
      stopVolumeAnalysis(socket.id);
      const avatarElem = document.getElementById(`avatar-${socket.id}`);
      if (avatarElem) {
        avatarElem.classList.remove('speaking');
      }
    }
  }
  const micButtons = [micToggleButton];
  const deafButtons = [deafenToggleButton];
  micButtons.forEach(btn => {
    if (!btn) return;
    if (!micEnabled || selfDeafened) {
      btn.innerHTML = `<span class="material-icons">mic_off</span>`;
      btn.classList.add('btn-muted', 'muted');
    } else {
      btn.innerHTML = `<span class="material-icons">mic</span>`;
      btn.classList.remove('btn-muted', 'muted');
    }
  });
  deafButtons.forEach(btn => {
    if (!btn) return;
    if (selfDeafened) {
      btn.innerHTML = `<span class="material-icons">headset_off</span>`;
      btn.classList.add('btn-muted', 'muted');
    } else {
      btn.innerHTML = `<span class="material-icons">headset</span>`;
      btn.classList.remove('btn-muted', 'muted');
    }
  });
  remoteAudios.forEach((audio) => {
    audio.muted = selfDeafened;
  });
  socket.emit('audioStateChanged', { micEnabled, selfDeafened, hasMic });
}