// public/js/screenShare.js

/**
 * Bu modül, ekran paylaşımını başlatıp durdurmak için gerekli fonksiyonları sağlar.
 * Kullanım: sendTransport üzerinden yeni bir producer yaratılarak ekran paylaşımı yapılır.
 */

export async function startScreenShare(sendTransport, socket) {
  try {
    // Kullanıcının ekranını paylaşmasını ister (yalnızca video alınır, ses yok)
    const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
    const track = stream.getVideoTracks()[0];
    // sendTransport üzerinden yeni bir producer oluşturuyoruz
    const producer = await sendTransport.produce({ track, stopTracks: false });
    // Global olarak ekran paylaşım producer'ını saklıyoruz (örneğin, window nesnesinde)
    window.screenShareProducer = producer;
    // Ekran paylaşım durumu sunucuya bildiriliyor
    socket.emit('screenShareStatusChanged', { isScreenSharing: true });
    // Eğer kullanıcı ekran paylaşımını durdurursa otomatik olarak stopScreenShare çağrılır
    track.onended = () => {
      stopScreenShare(socket);
    };
    return producer;
  } catch (error) {
    console.error("Screen sharing failed:", error);
    throw error;
  }
}

export async function stopScreenShare(socket) {
  if (window.screenShareProducer) {
    await window.screenShareProducer.close();
    window.screenShareProducer = null;
    // Ekran paylaşım durumu kapandığını sunucuya bildiriyoruz
    socket.emit('screenShareStatusChanged', { isScreenSharing: false });
  }
}
