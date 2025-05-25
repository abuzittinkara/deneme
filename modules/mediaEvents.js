/**************************************
 * modules/mediaEvents.js
 **************************************/
module.exports = function registerMediaEvents(io, socket, { groups, users, sfu, broadcastAllChannelsData, logger }) {
  socket.on('audioStateChanged', ({ micEnabled, selfDeafened, hasMic }) => {
    if (!users[socket.id]) return;
    users[socket.id].micEnabled = micEnabled;
    users[socket.id].selfDeafened = selfDeafened;
    if (typeof hasMic !== 'undefined') {
      users[socket.id].hasMic = hasMic;
    }
    const gId = users[socket.id].currentGroup;
    if (gId) {
      broadcastAllChannelsData(gId);
    }
  });

  socket.on('screenShareStatusChanged', ({ isScreenSharing }) => {
    if (users[socket.id]) {
      users[socket.id].isScreenSharing = isScreenSharing;
      const gId = users[socket.id].currentGroup;
      if (gId) {
        broadcastAllChannelsData(gId);
      }
    }
  });

  socket.on('screenShareStarted', ({ producerId }) => {
    if (users[socket.id]) {
      users[socket.id].screenShareProducerId = producerId;
      const gId = users[socket.id].currentGroup;
      if (gId) {
        broadcastAllChannelsData(gId);
      }
    }
  });

  socket.on('screenShareEnded', () => {
    const userData = users[socket.id];
    if (userData && userData.currentGroup && userData.currentRoom) {
      io.to(`${userData.currentGroup}::${userData.currentRoom}`).emit('screenShareEnded', {
        userId: socket.id,
        username: userData.username
      });
    }
  });
  socket.on('createWebRtcTransport', async ({ groupId, roomId }, callback) => {
    try {
      if (!groups[groupId] || !groups[groupId].rooms[roomId]) {
        logger.warn('createWebRtcTransport failed (grup/oda bellekte yok): %s/%s', groupId, roomId);
        return callback({ error: "Group/Room bulunamadı" });
      }
      const rmObj = groups[groupId].rooms[roomId];
      const router = rmObj.router;
      if (!router) {
        logger.warn('createWebRtcTransport failed (router yok): %s/%s', groupId, roomId);
        return callback({ error: "Router tanımsız (room'da yok)" });
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
      logger.info('WebRTC transport created for user %s in room %s/%s', users[socket.id]?.username, groupId, roomId);
    } catch (err) {
      logger.error("createWebRtcTransport error: %o", err);
      callback({ error: err.message });
    }
  });

  socket.on('connectTransport', async ({ groupId, roomId, transportId, dtlsParameters }, callback) => {
    try {
      const rmObj = groups[groupId]?.rooms[roomId];
      if (!rmObj) {
        logger.warn('connectTransport failed (oda bellekte yok): %s/%s', groupId, roomId);
        return callback({ error: "Room bulunamadı" });
      }
      const transport = rmObj.transports?.[transportId];
      if (!transport) {
        logger.warn('connectTransport failed (transport bellekte yok): %s/%s, transportId: %s', groupId, roomId, transportId);
        return callback({ error: "Transport bulunamadı" });
      }
      await sfu.connectTransport(transport, dtlsParameters);
      callback({ connected: true });
      logger.info('Transport connected for user %s in room %s/%s, transportId: %s', users[socket.id]?.username, groupId, roomId, transportId);
    } catch (err) {
      logger.error("connectTransport error: %o", err);
      callback({ error: err.message });
    }
  });

  socket.on('produce', async ({ groupId, roomId, transportId, kind, rtpParameters }, callback) => {
    try {
      const rmObj = groups[groupId]?.rooms[roomId];
      if (!rmObj) {
        logger.warn('Produce failed (oda bellekte yok): %s/%s', groupId, roomId);
        return callback({ error: "Room bulunamadı" });
      }
      const transport = rmObj.transports?.[transportId];
      if (!transport) {
        logger.warn('Produce failed (transport bellekte yok): %s/%s, transportId: %s', groupId, roomId, transportId);
        return callback({ error: "Transport bulunamadı" });
      }
      const producer = await sfu.produce(transport, kind, rtpParameters);
      producer.appData = { peerId: socket.id };
      rmObj.producers = rmObj.producers || {};
      rmObj.producers[producer.id] = producer;
      socket.broadcast.to(`${groupId}::${roomId}`).emit('newProducer', { producerId: producer.id });
      callback({ producerId: producer.id });
      logger.info('Producer created for user %s in room %s/%s, kind: %s', users[socket.id]?.username, groupId, roomId, kind);
    } catch (err) {
      logger.error("produce error: %o", err);
      callback({ error: err.message });
    }
  });

  socket.on('consume', async ({ groupId, roomId, transportId, producerId }, callback) => {
    try {
      const rmObj = groups[groupId]?.rooms[roomId];
      if (!rmObj) {
        logger.warn('Consume failed (oda bellekte yok): %s/%s', groupId, roomId);
        return callback({ error: "Room bulunamadı" });
      }
      const router = rmObj.router;
      if (!router) {
        logger.warn('Consume failed (router yok): %s/%s', groupId, roomId);
        return callback({ error: "Router yok" });
      }
      const transport = rmObj.transports?.[transportId];
      if (!transport) {
        logger.warn('Consume failed (transport bellekte yok): %s/%s, transportId: %s', groupId, roomId, transportId);
        return callback({ error: "Transport bulunamadı" });
      }
      const producer = rmObj.producers?.[producerId];
      if (!producer) {
        logger.warn('Consume failed (producer bellekte yok): %s/%s, producerId: %s', groupId, roomId, producerId);
        return callback({ error: "Producer bulunamadı" });
      }
      const consumer = await sfu.consume(router, transport, producer);
      consumer.appData = { peerId: producer.appData.peerId };
      rmObj.consumers = rmObj.consumers || {};
      rmObj.consumers[consumer.id] = consumer;
      const { producerId: prId, id, kind, rtpParameters } = consumer;
      callback({
        producerId: prId,
        id,
        kind,
        rtpParameters,
        producerPeerId: producer.appData.peerId
      });
      logger.info('Consumer created for user %s in room %s/%s, consuming producerId: %s', users[socket.id]?.username, groupId, roomId, producerId);
    } catch (err) {
      logger.error("consume error: %o", err);
      callback({ error: err.message });
    }
  });

  socket.on('listProducers', ({ groupId, roomId }, callback) => {
    try {
      const rmObj = groups[groupId]?.rooms[roomId];
      if (!rmObj || !rmObj.producers) {
        return callback([]);
      }
      const producers = Object.values(rmObj.producers).map(producer => ({
        id: producer.id,
        peerId: (producer.appData && producer.appData.peerId) ? producer.appData.peerId : null
      }));
      callback(producers);
    } catch (err) {
      console.error("listProducers error:", err);
      callback([]);
    }
  });
};