// WebRTC related socket handlers
const sfu = require('../sfu');

function registerWebrtcHandlers(io, socket, context) {
  const { groups, users } = context;

  socket.on('createWebRtcTransport', async ({ groupId, roomId }, callback) => {
    try {
      if (!groups[groupId] || !groups[groupId].rooms[roomId]) {
        return callback({ error: 'Group/Room bulunamadı' });
      }
      const rmObj = groups[groupId].rooms[roomId];
      const router = rmObj.router;
      if (!router) {
        return callback({ error: 'Router tanımsız (room\'da yok)' });
      }
      const transport = await sfu.createWebRtcTransport(router);
      transport.appData = { peerId: socket.id };
      rmObj.transports = rmObj.transports || {};
      rmObj.transports[transport.id] = transport;
      callback({
        id: transport.id,
        iceParameters: transport.iceParameters,
        iceCandidates: transport.iceCandidates,
        dtlsParameters: transport.dtlsParameters,
        routerRtpCapabilities: router.rtpCapabilities
      });
    } catch (err) {
      callback({ error: err.message });
    }
  });

  socket.on('connectTransport', async ({ groupId, roomId, transportId, dtlsParameters }, callback) => {
    try {
      const rmObj = groups[groupId]?.rooms[roomId];
      if (!rmObj) return callback({ error: 'Room bulunamadı' });
      const transport = rmObj.transports?.[transportId];
      if (!transport) return callback({ error: 'Transport bulunamadı' });
      await sfu.connectTransport(transport, dtlsParameters);
      callback({ connected: true });
    } catch (err) {
      callback({ error: err.message });
    }
  });

  socket.on('produce', async ({ groupId, roomId, transportId, kind, rtpParameters }, callback) => {
    try {
      const rmObj = groups[groupId]?.rooms[roomId];
      if (!rmObj) return callback({ error: 'Room bulunamadı' });
      const transport = rmObj.transports?.[transportId];
      if (!transport) return callback({ error: 'Transport bulunamadı' });
      const producer = await sfu.produce(transport, kind, rtpParameters);
      producer.appData = { peerId: socket.id };
      rmObj.producers = rmObj.producers || {};
      rmObj.producers[producer.id] = producer;
      socket.broadcast.to(`${groupId}::${roomId}`).emit('newProducer', { producerId: producer.id });
      callback({ producerId: producer.id });
    } catch (err) {
      callback({ error: err.message });
    }
  });

  socket.on('consume', async ({ groupId, roomId, transportId, producerId }, callback) => {
    try {
      const rmObj = groups[groupId]?.rooms[roomId];
      if (!rmObj) return callback({ error: 'Room bulunamadı' });
      const router = rmObj.router;
      if (!router) return callback({ error: 'Router yok' });
      const transport = rmObj.transports?.[transportId];
      if (!transport) return callback({ error: 'Transport bulunamadı' });
      const producer = rmObj.producers?.[producerId];
      if (!producer) return callback({ error: 'Producer bulunamadı' });
      const consumer = await sfu.consume(router, transport, producer);
      consumer.appData = { peerId: producer.appData.peerId };
      rmObj.consumers = rmObj.consumers || {};
      rmObj.consumers[consumer.id] = consumer;
      const { producerId: prId, id, kind, rtpParameters } = consumer;
      callback({ producerId: prId, id, kind, rtpParameters, producerPeerId: producer.appData.peerId });
    } catch (err) {
      callback({ error: err.message });
    }
  });

  socket.on('listProducers', ({ groupId, roomId }, callback) => {
    try {
      const rmObj = groups[groupId]?.rooms[roomId];
      if (!rmObj || !rmObj.producers) return callback([]);
      const producers = Object.values(rmObj.producers).map(p => ({ id: p.id, peerId: p.appData ? p.appData.peerId : null }));
      callback(producers);
    } catch (err) {
      callback([]);
    }
  });
}

module.exports = registerWebrtcHandlers;