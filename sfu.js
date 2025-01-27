/**************************************
 * sfu.js
 **************************************/
const mediasoup = require('mediasoup');

/**
 * Bu dizi, CPU çekirdeği sayınız kadar Worker tutacak.
 * Her Worker bir veya daha fazla Router barındırabilir.
 */
let workers = [];

/**
 * Round-robin ile Worker seçmek için bir index.
 */
let nextWorkerIndex = 0;

/**
 * Router'ları burada saklayabilirsiniz.
 * İsterseniz her oda (channel) için Router oluşturup
 * "routers" objesinde tutabilirsiniz.
 */
const routers = {}; 
// örnek kullanım: routers[roomId] = <routerObj>

/**
 * Projenizin başında (ör. server.js ayaklanırken)
 * createWorkers() çağırarak Worker'ları oluşturun.
 */
async function createWorkers() {
  // Sunucunuzda kaç çekirdek varsa, ya da kaç worker istiyorsanız
  const cpuCores = 2; 
  for (let i = 0; i < cpuCores; i++) {
    const worker = await mediasoup.createWorker({
      rtcMinPort: 10000,
      rtcMaxPort: 10100,
      // worker logLevel vs. isteğe göre
      logLevel: 'warn',
      logTags: [
        'info',
        'ice',
        'dtls',
        'rtp',
        'srtp',
        'rtcp'
      ]
    });
    worker.on('died', () => {
      console.error('Mediasoup Worker died, PID=%d', worker.pid);
      // Burada restart logic vs. uygulayabilirsiniz
    });
    workers.push(worker);
  }
  console.log(`SFU: ${workers.length} adet Mediasoup Worker oluşturuldu.`);
}

/**
 * Round-robin şeklinde sıradaki Worker'ı döndürür.
 */
function getNextWorker() {
  const worker = workers[nextWorkerIndex];
  nextWorkerIndex = (nextWorkerIndex + 1) % workers.length;
  return worker;
}

/**
 * Yeni bir Router oluşturur. Bunu her oda (room) için
 * veya uygulama gereksiniminize göre çağırabilirsiniz.
 */
async function createRouter(roomId) {
  const worker = getNextWorker();
  const mediaCodecs = [
    {
      kind: 'audio',
      mimeType: 'audio/opus',
      clockRate: 48000,
      channels: 2
    }
    // Eğer video desteği de verecekseniz, buraya video codec ekleyebilirsiniz
  ];

  const router = await worker.createRouter({ mediaCodecs });
  routers[roomId] = router;
  console.log(`SFU: Router oluşturuldu => roomId=${roomId}, workerPID=${worker.pid}`);
  return router;
}

/**
 * Mevcut Router'ı döndürür. Yoksa createRouter() çağırabilirsiniz.
 */
function getRouter(roomId) {
  return routers[roomId] || null;
}

/**
 * Mediasoup'ta bir WebRtcTransport oluşturma fonksiyonu.
 * Genelde Socket.IO event'lerinde (createTransport gibi)
 * kullanacaksınız.
 */
async function createWebRtcTransport(router) {
  // Sunucu IP veya harici IP değerlerinizi ayarlayın.
  // announcedIp gerçek bir VPS ip adresi olabilir.
  const transportOptions = {
    listenIps: [
      { ip: '0.0.0.0', announcedIp: null } // announcedIp olmadan da çalışır
    ],
    enableUdp: true,
    enableTcp: true,
    preferUdp: true,
    // enableSctp: false, // datachannels
    // additional config...
  };

  const transport = await router.createWebRtcTransport(transportOptions);
  console.log('SFU: createWebRtcTransport =>', transport.id);

  return transport;
}

/**
 * Transport'u DTLS parametreleri ile connect eder.
 * İstemci tarafında "transport.on('connect')" olduğunda
 * dtlsParameters buraya gönderilir.
 */
async function connectTransport(transport, dtlsParameters) {
  await transport.connect({ dtlsParameters });
  console.log('SFU: connectTransport => transportID=', transport.id);
}

/**
 * İstemci tarafında "transport.produce()" çağırıldığında
 * sunucuya kind, rtpParameters vs. gelir. Burada Producer oluşturur.
 */
async function produce(transport, kind, rtpParameters) {
  const producer = await transport.produce({ kind, rtpParameters });
  console.log(`SFU: producer created => ID=${producer.id}, kind=${kind}`);
  return producer;
}

/**
 * Consumer oluşturma (diğer kullanıcıların audio/video'sunu tüketmek).
 * Producer ID'yi parametre olarak alır.
 */
async function consume(router, transport, producerId) {
  const producer = router.getProducerById(producerId);
  if (!producer) {
    throw new Error('Producer bulunamadı');
  }

  const consumer = await transport.consume({
    producerId: producer.id,
    rtpCapabilities: router.rtpCapabilities,
    paused: true  // ilk başta paused, sonradan resume edilebilir
  });
  console.log(`SFU: consumer created => ID=${consumer.id}, producerID=${producer.id}`);
  return consumer;
}

/**
 * Producer veya Consumer durdurmak/silmek için.
 * (Odan ayrılınca temizlik yapmanız gerekecek.)
 */
async function closeProducer(producer) {
  if (producer && !producer.closed) {
    await producer.close();
    console.log(`SFU: producer closed => ID=${producer.id}`);
  }
}
async function closeConsumer(consumer) {
  if (consumer && !consumer.closed) {
    await consumer.close();
    console.log(`SFU: consumer closed => ID=${consumer.id}`);
  }
}
async function closeTransport(transport) {
  if (transport && !transport.closed) {
    await transport.close();
    console.log(`SFU: transport closed => ID=${transport.id}`);
  }
}

/**
 * İhtiyaç duyduğunuz tüm fonksiyonları dışa aktarıyoruz.
 */
module.exports = {
  createWorkers,
  getRouter,
  createRouter,
  createWebRtcTransport,
  connectTransport,
  produce,
  consume,
  closeProducer,
  closeConsumer,
  closeTransport
};
