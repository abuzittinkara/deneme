/**************************************
 * sfu.js
 **************************************/
const mediasoup = require('mediasoup');

/**
 * Bu dizi, CPU çekirdeği sayınız kadar Worker tutacak.
 */
let workers = [];

/**
 * Round-robin ile Worker seçmek için bir index.
 */
let nextWorkerIndex = 0;

/**
 * İsterseniz Router'ları da ID bazında saklayabilirsiniz: routers[roomId] = ...
 */
const routers = {}; 

/**
 * createWorkers() => uygulama başlarken çağrılacak.
 */
async function createWorkers() {
  // Sunucunuzda kaç çekirdek varsa (ör. 2 ise 2 worker vb.)
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
 * createRouter(roomId)
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
    // Video codec isterseniz buraya ekleyebilirsiniz
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
 * createWebRtcTransport
 * 
 * TURN eklemek istemezseniz, en azından STUN ekleyelim:
 * iceServers: [{ urls:'stun:stun.l.google.com:19302' }]
 */
async function createWebRtcTransport(router) {
  const transportOptions = {
    listenIps: [
      { ip: '0.0.0.0', announcedIp: null }
    ],
    enableUdp: true,
    enableTcp: true,
    preferUdp: true,
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      /*
      // TURN örneği (kapalı):
      // {
      //   urls: 'turn:YOUR_TURN_SERVER:3478',
      //   username: 'test',
      //   credential: 'test'
      // }
      */
    ]
  };
  const transport = await router.createWebRtcTransport(transportOptions);
  return transport;
}

/**
 * connectTransport
 */
async function connectTransport(transport, dtlsParameters) {
  await transport.connect({ dtlsParameters });
}

/**
 * produce => transport üzerinde Producer yaratır
 */
async function produce(transport, kind, rtpParameters) {
  const producer = await transport.produce({ kind, rtpParameters });
  return producer;
}

/**
 * consume => Artık "router.getProducerById(producerId)" yerine,
 * sunucunun "rmObj.producers" içinden Producer alıp consume yapıyoruz.
 */
async function consume(router, transport, producerId, localProducers) {
  // Artık localProducers[producerId] kullanıyoruz:
  const producer = localProducers[producerId];
  if (!producer) {
    throw new Error('Producer bulunamadı (localProducers)!');
  }

  const consumer = await transport.consume({
    producerId: producer.id,  // Yukarıdaki "producer.id"
    rtpCapabilities: router.rtpCapabilities,
    paused: true
  });
  await consumer.resume();
  return consumer;
}

/**
 * Kapatma yardımcıları
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
