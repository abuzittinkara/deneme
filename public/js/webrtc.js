import * as ScreenShare from "./screenShare.js";
import { startVolumeAnalysis, stopVolumeAnalysis } from './audioUtils.js';
import * as Ping from './ping.js';

export let device = null;   // mediasoup-client Device
export let deviceIsLoaded = false;
export let sendTransport = null;
export let recvTransport = null;
export let localStream = null;
export let audioPermissionGranted = false;
export let localProducer = null;
export let consumers = {};  // consumerId -> consumer
export let remoteAudios = [];
export let screenShareVideo = null;
export let screenShareContainer = null;

export function setScreenShareVideo(value) {
  screenShareVideo = value;
}

export function setScreenShareContainer(value) {
  screenShareContainer = value;
}

export async function requestMicrophoneAccess(socket, applyAudioStates, hasMicRef) {
  try {
    console.log('Mikrofon izni isteniyor...');
    const constraints = {
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: false,
      },
    };
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    console.log('Mikrofon erişimi verildi:', stream);
    localStream = stream;
    audioPermissionGranted = true;
    if (hasMicRef) hasMicRef.value = true;
    applyAudioStates();
    startVolumeAnalysis(localStream, socket.id);
    remoteAudios.forEach((audioEl) => {
      audioEl.play().catch((err) => console.error('Ses oynatılamadı:', err));
    });
    return stream;
  } catch (err) {
    console.error('Mikrofon izni alınamadı:', err);
    audioPermissionGranted = false;
    if (hasMicRef) hasMicRef.value = false;
    applyAudioStates();
    return null;
  }
}

export function startSfuFlow(socket, currentGroup, currentRoom) {
  console.log('startSfuFlow => group:', currentGroup, ' room:', currentRoom);
  if (!device) {
    device = new mediasoupClient.Device();
  }
  if (!localStream || localStream.getAudioTracks()[0].readyState === 'ended') {
    requestMicrophoneAccess(socket, () => {}, null).then(() => {
      console.log('Mikrofon izni alındı, SFU akışı başlatılıyor...');
      createTransportFlow(socket, currentGroup, currentRoom);
    }).catch((err) => {
      console.error('Mikrofon izni alınamadı:', err);
    });
  } else {
    createTransportFlow(socket, currentGroup, currentRoom);
  }
}

export async function createTransportFlow(socket, currentGroup, currentRoom) {
  const transportParams = await createTransport(socket, currentGroup, currentRoom);
  if (transportParams.error) {
    console.error('createTransport error:', transportParams.error);
    return;
  }
  if (!deviceIsLoaded) {
    await device.load({ routerRtpCapabilities: transportParams.routerRtpCapabilities });
    deviceIsLoaded = true;
    console.log('Device yüklendi:', device.rtpCapabilities);
  } else {
    console.log('Device zaten yüklü.');
  }
  sendTransport = device.createSendTransport(transportParams);
  sendTransport.on('connect', ({ dtlsParameters }, callback, errback) => {
    console.log('sendTransport connect => dtls');
    socket.emit('connectTransport', {
      groupId: currentGroup,
      roomId: currentRoom,
      transportId: transportParams.id,
      dtlsParameters,
    }, (res) => {
      if (res && res.error) {
        errback(res.error);
      } else {
        callback();
      }
    });
  });
  sendTransport.on('produce', async (producerOptions, callback, errback) => {
    console.log('sendTransport produce =>', producerOptions);
    socket.emit('produce', {
      groupId: currentGroup,
      roomId: currentRoom,
      transportId: transportParams.id,
      kind: producerOptions.kind,
      rtpParameters: producerOptions.rtpParameters,
    }, (res) => {
      if (res.error) {
        errback(res.error);
      } else {
        callback({ id: res.producerId });
      }
    });
  });
  if (localStream && localStream.getAudioTracks().length > 0) {
    let audioTrack = localStream.getAudioTracks()[0];
    try {
      localProducer = await sendTransport.produce({
        track: audioTrack,
        stopTracks: false,
      });
      console.log('Mikrofon producer oluşturuldu:', localProducer.id);
    } catch (err) {
      if (err.name === 'InvalidStateError') {
        console.error('Audio track bitti, yeniden mikrofon izni isteniyor...');
        await requestMicrophoneAccess(socket, () => {}, null);
        audioTrack = localStream.getAudioTracks()[0];
        localProducer = await sendTransport.produce({
          track: audioTrack,
          stopTracks: false,
        });
        console.log('Yeni audio track ile producer oluşturuldu:', localProducer.id);
      } else {
        throw err;
      }
    }
  } else {
    console.warn('Yerel ses akışı bulunamadı, producer oluşturulmayacak.');
    localProducer = null;
  }
  const recvParams = await createTransport(socket, currentGroup, currentRoom);
  if (recvParams.error) {
    console.error('createTransport (recv) error:', recvParams.error);
    return;
  }
  recvTransport = device.createRecvTransport(recvParams);
  recvTransport.on('connect', ({ dtlsParameters }, callback, errback) => {
    console.log('recvTransport connect => dtls');
    socket.emit('connectTransport', {
      groupId: currentGroup,
      roomId: currentRoom,
      transportId: recvParams.id,
      dtlsParameters,
    }, (res) => {
      if (res && res.error) {
        errback(res.error);
      } else {
        callback();
      }
    });
  });
  const producers = await listProducers(socket, currentGroup, currentRoom);
  console.log('Mevcut producerlar:', producers);
  for (const prod of producers) {
    if (prod.peerId === socket.id) {
      console.log('Kendi producer, tüketme yapılmıyor:', prod.id);
      continue;
    }
    await consumeProducer(socket, currentGroup, currentRoom, prod.id);
  }
  console.log('SFU akışı tamamlandı.');
  if (typeof window.setConnectionStatus === 'function') {
    window.setConnectionStatus('connected');
  }
}

function createTransport(socket, currentGroup, currentRoom) {
  return new Promise((resolve) => {
    socket.emit('createWebRtcTransport', {
      groupId: currentGroup,
      roomId: currentRoom,
    }, (res) => {
      resolve(res);
    });
  });
}

function listProducers(socket, currentGroup, currentRoom) {
  return new Promise((resolve) => {
    socket.emit('listProducers', {
      groupId: currentGroup,
      roomId: currentRoom,
    }, (producerIds) => {
      resolve(producerIds || []);
    });
  });
}

export async function consumeProducer(socket, currentGroup, currentRoom, producerId) {
  if (!recvTransport) {
    console.warn('consumeProducer: recvTransport yok');
    return;
  }
  const consumeParams = await new Promise((resolve) => {
    socket.emit('consume', {
      groupId: currentGroup,
      roomId: currentRoom,
      transportId: recvTransport.id,
      producerId,
    }, (res) => {
      resolve(res);
    });
  });
  if (consumeParams.error) {
    console.error('consume error:', consumeParams.error);
    return;
  }
  console.log('consumeProducer parametreleri:', consumeParams);
  const consumer = await recvTransport.consume({
    id: consumeParams.id,
    producerId: consumeParams.producerId,
    kind: consumeParams.kind,
    rtpParameters: consumeParams.rtpParameters,
  });
  consumer.appData = { peerId: consumeParams.producerPeerId };
  consumers[consumer.id] = consumer;
  if (consumer.kind === 'audio') {
    const { track } = consumer;
    const audioEl = document.createElement('audio');
    audioEl.srcObject = new MediaStream([track]);
    audioEl.autoplay = true;
    audioEl.dataset.peerId = consumer.appData.peerId;
    remoteAudios.push(audioEl);
    audioEl.play().catch((err) => console.error('Ses oynatılamadı:', err));
    startVolumeAnalysis(audioEl.srcObject, consumer.appData.peerId);
    console.log('Yeni audio consumer oluşturuldu:', consumer.id, '-> konuşan:', consumer.appData.peerId);
  } else if (consumer.kind === 'video') {
    console.log('Video consumer alındı, ekran paylaşım için tıklama ile consume edilecek. Producer:', consumeParams.producerId);
  }
}

export function leaveRoomInternal(socket) {
  if (window.screenShareProducerVideo || window.screenShareStream) {
    ScreenShare.stopScreenShare(socket);
  }
  if (localProducer) {
    localProducer.close();
    localProducer = null;
  }
  if (sendTransport) {
    sendTransport.close();
    sendTransport = null;
  }
  if (recvTransport) {
    recvTransport.close();
    recvTransport = null;
  }
  for (const cid in consumers) {
    const peerId = consumers[cid].appData.peerId;
    stopVolumeAnalysis(peerId);
  }
  consumers = {};
  remoteAudios.forEach((a) => {
    try {
      a.pause();
    } catch (e) {}
    a.srcObject = null;
  });
  remoteAudios = [];
  if (typeof window !== 'undefined') {
    window.currentRoom = null;
    window.currentRoomType = null;
    if (window.activeVoiceChannelName !== undefined) {
      window.activeVoiceChannelName = '';
    }
  }
  console.log('leaveRoomInternal: SFU transportlar kapatıldı');
}

export function joinRoom(socket, currentGroup, roomId, roomName, selectedChannelTitle, showChannelStatusPanelRef, currentRoomTypeRef) {
  socket.emit('joinRoom', { groupId: currentGroup, roomId });
  if (selectedChannelTitle) selectedChannelTitle.textContent = roomName;
  window.activeVoiceChannelName = roomName;
  Ping.updateStatusPanel(0);
  if (showChannelStatusPanelRef) showChannelStatusPanelRef();
  if (currentRoomTypeRef) currentRoomTypeRef.value = 'voice';
}

export async function showScreenShare(socket, currentGroup, currentRoom, producerId, clearScreenShareUI) {
  if (!recvTransport) {
    console.warn('recvTransport yok');
    return;
  }
  const channelContentArea = document.querySelector('.channel-content-area');
  clearScreenShareUI();
  const consumeParams = await new Promise((resolve) => {
    socket.emit('consume', {
      groupId: currentGroup,
      roomId: currentRoom,
      transportId: recvTransport.id,
      producerId,
    }, (res) => {
      resolve(res);
    });
  });
  if (consumeParams.error) {
    console.error('consume error:', consumeParams.error);
    return;
  }
  const consumer = await recvTransport.consume({
    id: consumeParams.id,
    producerId: consumeParams.producerId,
    kind: consumeParams.kind,
    rtpParameters: consumeParams.rtpParameters,
  });
  consumer.appData = { peerId: consumeParams.producerPeerId };
  consumers[consumer.id] = consumer;
  if (consumer.kind === 'audio') {
    const { track } = consumer;
    const audioEl = document.createElement('audio');
    audioEl.srcObject = new MediaStream([track]);
    audioEl.autoplay = true;
    audioEl.dataset.peerId = consumer.appData.peerId;
    remoteAudios.push(audioEl);
    audioEl.play().catch((err) => console.error('Ses oynatılamadı:', err));
    startVolumeAnalysis(audioEl.srcObject, consumer.appData.peerId);
  } else if (consumer.kind === 'video') {
    screenShareVideo = document.createElement('video');
    screenShareVideo.srcObject = new MediaStream([consumer.track]);
    screenShareVideo.autoplay = true;
    screenShareVideo.dataset.peerId = consumer.appData.peerId;
    screenShareContainer = document.createElement('div');
    screenShareContainer.classList.add('screen-share-container');
    screenShareContainer.appendChild(screenShareVideo);

    const endIcon = document.createElement('span');
    endIcon.classList.add('material-icons', 'screen-share-end-icon');
    endIcon.textContent = 'call_end';
    endIcon.style.display = 'none';
    screenShareContainer.appendChild(endIcon);

    screenShareContainer.addEventListener('mouseenter', () => {
      endIcon.style.display = 'block';
    });
    screenShareContainer.addEventListener('mouseleave', () => {
      endIcon.style.display = 'none';
    });
    endIcon.addEventListener('click', () => {
      consumer.close();
      delete consumers[consumer.id];
      for (const cid in consumers) {
        const c = consumers[cid];
        if (c.kind === 'audio' && c.appData.peerId === consumer.appData.peerId) {
          c.close();
          stopVolumeAnalysis(c.appData.peerId);
          delete consumers[cid];
          const idx = remoteAudios.findIndex((a) => a.dataset.peerId === c.appData.peerId);
          if (idx !== -1) {
            const aEl = remoteAudios[idx];
            try { aEl.pause(); } catch (e) {}
            aEl.srcObject = null;
            remoteAudios.splice(idx, 1);
          }
        }
      }
      if (screenShareContainer.parentNode) {
        screenShareContainer.parentNode.removeChild(screenShareContainer);
      }
      screenShareVideo = null;
      screenShareContainer = null;
    });

    removeScreenShareEndedMessage();
    if (channelContentArea) {
      screenShareContainer = document.createElement('div');
      screenShareContainer.classList.add('screen-share-container');
      screenShareContainer.appendChild(screenShareVideo);

      const fsIcon = document.createElement('span');
      fsIcon.classList.add('material-icons', 'fullscreen-icon');
      fsIcon.textContent = 'fullscreen';
      fsIcon.addEventListener('click', () => {
        if (screenShareContainer.requestFullscreen) {
          screenShareContainer.requestFullscreen();
        }
      });
      screenShareContainer.appendChild(fsIcon);

      channelContentArea.appendChild(screenShareContainer);
    }
    console.log('Yeni video consumer oluşturuldu:', consumer.id, '-> yayıncı:', consumer.appData.peerId);
  }
}

function displayScreenShareEndedMessage(msg) {
  const channelContentArea = document.querySelector('.channel-content-area');
  let messageEl = document.getElementById('screenShareEndedMessage');
  if (!messageEl) {
    messageEl = document.createElement('div');
    messageEl.id = 'screenShareEndedMessage';
    messageEl.style.position = 'absolute';
    messageEl.style.top = '50%';
    messageEl.style.left = '50%';
    messageEl.style.transform = 'translate(-50%, -50%)';
    messageEl.style.color = '#fff';
    messageEl.style.backgroundColor = 'rgba(0,0,0,0.7)';
    messageEl.style.padding = '1rem';
    messageEl.style.borderRadius = '8px';
    messageEl.style.fontSize = '1.2rem';
  }
  messageEl.textContent = msg || 'Bu yayın sonlandırıldı';
  const channelContentAreaElem = document.querySelector('.channel-content-area');
  channelContentAreaElem.appendChild(messageEl);
}

function removeScreenShareEndedMessage() {
  const messageEl = document.getElementById('screenShareEndedMessage');
  if (messageEl && messageEl.parentNode) {
    messageEl.parentNode.removeChild(messageEl);
  }
}

export { createTransport, listProducers };