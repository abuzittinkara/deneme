// public/js/screenShare.js

/**
 * Bu modül, ekran paylaşımını başlatıp durdurmak için gerekli fonksiyonları sağlar.
 * Kullanım: sendTransport üzerinden yeni producerlar yaratılarak ekran paylaşımı yapılır.
 */

export async function startScreenShare(sendTransport, socket) {
  try {
    // Kullanıcının ekranını paylaşmasını ister (video ve audio alınır)
    const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
    // Dönen stream'i global olarak saklıyoruz
    window.screenShareStream = stream;

    // Video track'ini al ve producer oluştur
    const videoTrack = stream.getVideoTracks()[0];
    const videoProducer = await sendTransport.produce({ track: videoTrack, stopTracks: false });
    window.screenShareProducerVideo = videoProducer;

    // Eğer varsa audio track için de producer oluştur
    let audioProducer = null;
    if (stream.getAudioTracks().length > 0) {
      const audioTrack = stream.getAudioTracks()[0];
      audioProducer = await sendTransport.produce({ track: audioTrack, stopTracks: false });
      window.screenShareProducerAudio = audioProducer;
    }

    // Ekran paylaşım durumunu bildir
    socket.emit('screenShareStatusChanged', { isScreenSharing: true });
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
  // Üreticileri kapat
  if (window.screenShareProducerVideo) {
    await window.screenShareProducerVideo.close();
    window.screenShareProducerVideo = null;
  }
  if (window.screenShareProducerAudio) {
    await window.screenShareProducerAudio.close();
    window.screenShareProducerAudio = null;
  }
  // Stream ve track’leri temizle
  if (window.screenShareStream) {
    window.screenShareStream.getTracks().forEach(track => {
      track.stop();
      track.enabled = false; // Track’i devre dışı bırak
    });
    window.screenShareStream = null;
  }
  // Sunucuya bildir
  socket.emit('screenShareStatusChanged', { isScreenSharing: false });
  socket.emit('screenShareEnded');
  console.log("Ekran paylaşımı tamamen durduruldu.");
}