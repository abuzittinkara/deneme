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
 * Projenizde, Router'ları ID bazında saklayabilirsiniz.
 * Örneğin: routers[roomId] = routerObj
 * Biz bu dosyada sadece fonksiyonları sunuyoruz.
 */
const routers = {}; 

/**
 * createWorkers() => uygulama başlarken çağrılacak.
 */
async function createWorkers() {
  // Sunucunuzda kaç çekirdek varsa (ör. 2)
  const cpuCores = 2; 
  for (let i = 0; i < cpuCores; i++) {
    const worker = await mediasoup.createWorker({
      rtcMinPort: 10000,
      rtcMaxPort: 10100,
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
      // restart logic vs...
    });
    workers.push(worker);
  }
  console.log(`SFU: ${workers.length} adet Mediasoup Worker oluşturuldu.`);
}

function getNextWorker() {
  const worker = workers[nextWorkerIndex];
  nextWorkerIndex = (nextWorkerIndex + 1) % workers.length;
  return worker;
}

/**
 * createRouter(roomId): yeni bir Router oluşturur.
 * Medya codec ayarları vs. buradan tanımlanır.
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
    // Video desteği için codec ekleyebilirsiniz
  ];
  const router = await worker.createRouter({ mediaCodecs });
  routers[roomId] = router;
  return router;
}

/**
 * getRouter(roomId) => varsa döndür.
 */
function getRouter(roomId) {
  return routers[roomId] || null;
}

/**
 * createWebRtcTransport => Router üzerinde Transport oluşturur.
 * 
 * Burada:
 *  - announcedIp: null => Public IP veya domain kullanmıyoruz.
 *  - iceServers => Basit STUN ekledik.
 *  - TURN kodlarını yoruma aldık (eklemek isterseniz açabilirsiniz).
 */
async function createWebRtcTransport(router) {
  const transportOptions = {
    listenIps: [
      // announcedIp: null => NAT arkasında bir platformdaysanız
      // sabit IP yoksa mecburen bu şekilde bırakın.
      // Aksi halde "xxx.xxx.xxx.xxx" yazabilirsiniz.
      { ip: '0.0.0.0', announcedIp: null }
    ],
    enableUdp: true,
    enableTcp: true,
    preferUdp: true,

    // STUN / TURN sunucuları
    iceServers: [
      // STUN
      { urls: 'stun:stun.l.google.com:19302' },

      // TURN eklemek isterseniz:
      // {
      //   urls: 'turn:my-turn-server:3478',
      //   username: 'test',
      //   credential: 'test'
      // }
    ]
  };

  const transport = await router.createWebRtcTransport(transportOptions);
  return transport;
}

/**
 * connectTransport => DTLS parametreleriyle bağlanır.
 */
async function connectTransport(transport, dtlsParameters) {
  await transport.connect({ dtlsParameters });
}

/**
 * produce => transport üzerinde Producer yaratır.
 */
async function produce(transport, kind, rtpParameters) {
  const producer = await transport.produce({ kind, rtpParameters });
  return producer;
}

/**
 * consume => Producer'a abone olmak için Consumer yaratır.
 */
async function consume(router, transport, producerId) {
  const producer = router.getProducerById(producerId);
  if (!producer) {
    throw new Error('Producer bulunamadı');
  }

  const consumer = await transport.consume({
    producerId: producer.id,
    rtpCapabilities: router.rtpCapabilities,
    paused: true
  });
  // Dilerseniz consumer.resume()'u burada veya sunucuda yapabilirsiniz
  await consumer.resume();
  return consumer;
}

/**
 * Temizlik fonksiyonları => kapanış
 */
async function closeTransport(transport) {
  if (transport && !transport.closed) {
    await transport.close();
    console.log(`SFU: transport closed => ID=${transport.id}`);
  }
}

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

module.exports = {
  createWorkers,
  createRouter,
  getRouter,
  createWebRtcTransport,
  connectTransport,
  produce,
  consume,
  closeTransport,
  closeProducer,
  closeConsumer
};
