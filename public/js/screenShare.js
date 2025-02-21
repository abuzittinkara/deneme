// public/js/screenShare.js

/**
 * Bu modül, ekran paylaşımını başlatıp durdurmak için gerekli fonksiyonları sağlar.
 * Kullanım: sendTransport üzerinden yeni producerlar yaratılarak ekran paylaşımı yapılır.
 */

export async function startScreenShare(sendTransport, socket) {
  try {
    // Kullanıcının ekranını paylaşmasını ister (video ve audio alınır)
    const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
    const videoTrack = stream.getVideoTracks()[0];
    // Video producer'ı oluştur
    const videoProducer = await sendTransport.produce({ track: videoTrack, stopTracks: false });
    // Global olarak ekran paylaşım video producer'ını saklıyoruz
    window.screenShareProducerVideo = videoProducer;
    
    // Eğer audio track mevcutsa, ayrı bir producer oluşturuyoruz
    let audioProducer = null;
    if (stream.getAudioTracks().length > 0) {
      const audioTrack = stream.getAudioTracks()[0];
      audioProducer = await sendTransport.produce({ track: audioTrack, stopTracks: false });
      window.screenShareProducerAudio = audioProducer;
    }
    
    // Ekran paylaşım durumu sunucuya bildiriliyor
    socket.emit('screenShareStatusChanged', { isScreenSharing: true });
    // Ekran paylaşımının başladığını video producer ID'si ile sunucuya bildiriyoruz
    socket.emit('screenShareStarted', { producerId: videoProducer.id });
    // Eğer kullanıcı ekran paylaşımını durdurursa otomatik olarak stopScreenShare çağrılır
    videoTrack.onended = () => {
      stopScreenShare(socket);
    };
    return { videoProducer, audioProducer };
  } catch (error) {
    console.error("Screen sharing failed:", error);
    throw error;
  }
}

export async function stopScreenShare(socket) {
  if (window.screenShareProducerVideo) {
    await window.screenShareProducerVideo.close();
    window.screenShareProducerVideo = null;
  }
  if (window.screenShareProducerAudio) {
    await window.screenShareProducerAudio.close();
    window.screenShareProducerAudio = null;
  }
  // Ekran paylaşım durumu kapandığını sunucuya bildiriyoruz
  socket.emit('screenShareStatusChanged', { isScreenSharing: false });
  socket.emit('screenShareEnded');
}
