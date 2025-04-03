// Socket üzerinden sunucuya istek gönderme fonksiyonları
export const sendLogin = (socket, credentials, callback) => {
    if (!socket) return;
    socket.emit('login', credentials, callback);
  };
  
  export const sendRegister = (socket, userData, callback) => {
    if (!socket) return;
    socket.emit('register', userData, callback);
  };
  
  export const startScreenShare = async (sendTransport, socket) => {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
      window.screenShareStream = stream;
      const videoTrack = stream.getVideoTracks()[0];
      const videoProducer = await sendTransport.produce({ track: videoTrack, stopTracks: false });
      window.screenShareProducerVideo = videoProducer;
  
      let audioProducer = null;
      if (stream.getAudioTracks().length > 0) {
        const audioTrack = stream.getAudioTracks()[0];
        audioProducer = await sendTransport.produce({ track: audioTrack, stopTracks: false });
        window.screenShareProducerAudio = audioProducer;
      }
      socket.emit('screenShareStatusChanged', { isScreenSharing: true });
      socket.emit('screenShareStarted', { producerId: videoProducer.id });
      videoTrack.onended = () => {
        stopScreenShare(socket);
      };
      return { videoProducer, audioProducer };
    } catch (error) {
      console.error("Screen sharing failed:", error);
      throw error;
    }
  };
  
  export const stopScreenShare = async (socket) => {
    if (window.screenShareProducerVideo) {
      await window.screenShareProducerVideo.close();
      window.screenShareProducerVideo = null;
    }
    if (window.screenShareProducerAudio) {
      await window.screenShareProducerAudio.close();
      window.screenShareProducerAudio = null;
    }
    if (window.screenShareStream) {
      window.screenShareStream.getTracks().forEach(track => {
        track.stop();
        track.enabled = false;
      });
      window.screenShareStream = null;
    }
    socket.emit('screenShareStatusChanged', { isScreenSharing: false });
    socket.emit('screenShareEnded');
    console.log("Ekran paylaşımı tamamen durduruldu.");
  };
  