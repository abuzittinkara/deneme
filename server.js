/**************************************
 * server.js
 * (Discord’a benzeyen SFU mantığı)
 **************************************/
const http = require("http");
const express = require("express");
const socketIO = require("socket.io");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const { v4: uuidv4 } = require("uuid"); 

const User = require("./models/User");
const Group = require("./models/Group");
const Channel = require("./models/Channel");

// ======== Mediasoup Setup ========
const mediasoup = require("mediasoup");

let worker;          // mediasoup Worker
const rooms = {};    // roomId => { router, transports:[], producers:[], ... }

// MongoDB bağlantısı
const uri =
  process.env.MONGODB_URI ||
  "mongodb+srv://abuzorttin:HWZe7uK5yEAE@cluster0.vdrdy.mongodb.net/myappdb?retryWrites=true&w=majority";
mongoose
  .connect(uri)
  .then(() => console.log("MongoDB bağlantısı başarılı!"))
  .catch((err) => console.error("MongoDB bağlantı hatası:", err));

const app = express();
const server = http.createServer(app);
const io = socketIO(server);

app.use(express.static("public"));

// Bellek içi tablolar (Anlık takip için)
const users = {}; // socket.id -> { username, currentGroup, currentRoom }
// (Eskiden groupsMap vb. yapılar kullanılıyordu. Burada basit tuttuk.)

// ======= Mediasoup Worker Başlat =======
(async () => {
  worker = await mediasoup.createWorker({
    // logLevel: 'debug',
    rtcMinPort: 40000,
    rtcMaxPort: 49999,
  });
  console.log("Mediasoup Worker başlatıldı!");
})();

// Her odaya (ör: channelId) ait bir Router olsun
async function createRoomRouter(roomId) {
  if (rooms[roomId]) return rooms[roomId].router;

  const router = await worker.createRouter({
    mediaCodecs: [
      {
        kind: "audio",
        mimeType: "audio/opus",
        clockRate: 48000,
        channels: 2,
      },
    ],
  });

  rooms[roomId] = {
    router,
    transports: [],
    producers: [],
    consumers: [],
  };
  console.log(`createRoomRouter => router oluşturuldu, roomId=${roomId}`);
  return router;
}

// Kullanıcıya bir WebRTC transport oluştur (send/recv)
async function createWebRtcTransport(router) {
  const transport = await router.createWebRtcTransport({
    listenIps: [
      { ip: "127.0.0.1", announcedIp: null } // Prod ortamda announcedIp = gerçek public IP
    ],
    enableUdp: true,
    enableTcp: true,
    preferUdp: true,
  });
  return transport;
}

// Socket.IO
io.on("connection", (socket) => {
  console.log("Kullanıcı bağlandı:", socket.id);

  users[socket.id] = {
    username: null,
    currentGroup: null,
    currentRoom: null,
  };

  // LOGIN
  socket.on("login", async ({ username, password }) => {
    try {
      if (!username || !password) {
        socket.emit("loginResult", { success: false, message: "Eksik bilgiler" });
        return;
      }
      const user = await User.findOne({ username });
      if (!user) {
        socket.emit("loginResult", { success: false, message: "Kullanıcı bulunamadı." });
        return;
      }
      const pwMatch = await bcrypt.compare(password, user.passwordHash);
      if (!pwMatch) {
        socket.emit("loginResult", { success: false, message: "Yanlış parola." });
        return;
      }
      socket.emit("loginResult", { success: true, username: user.username });
    } catch (err) {
      console.error(err);
      socket.emit("loginResult", { success: false, message: "Giriş hatası." });
    }
  });

  // set-username
  socket.on("set-username", (usernameVal) => {
    if (usernameVal && typeof usernameVal === "string") {
      const trimmedName = usernameVal.trim();
      users[socket.id].username = trimmedName;
      console.log(`User ${socket.id} => set-username => ${trimmedName}`);
    }
  });

  // Discord-benzeri => joinChannel
  socket.on("joinChannel", async ({ groupId, channelId }) => {
    try {
      // Önce eski oda varsa oradan ayrıl
      const oldRoom = users[socket.id].currentRoom;
      if (oldRoom) {
        socket.leave(oldRoom);
      }
      // Odaya gir
      users[socket.id].currentGroup = groupId;
      const roomId = channelId; // SFU room = channel
      users[socket.id].currentRoom = roomId;

      socket.join(roomId);

      // SFU Router oluştur (yoksa)
      const router = await createRoomRouter(roomId);

      // joinedChannel event => client'ta SFU transport yaratma vb.
      socket.emit("joinedChannel", { roomId });
    } catch (err) {
      console.error("joinChannel hata:", err);
      socket.emit("errorMessage", "Kanala katılırken hata oluştu.");
    }
  });

  // ============ createTransport ============
  socket.on("createTransport", async (roomId, callback) => {
    try {
      const rObj = rooms[roomId];
      if (!rObj) {
        return callback({ error: "Room yok" });
      }
      const { router } = rObj;
      const transport = await createWebRtcTransport(router);
      rObj.transports.push(transport);

      callback({
        id: transport.id,
        iceParameters: transport.iceParameters,
        iceCandidates: transport.iceCandidates,
        dtlsParameters: transport.dtlsParameters,
      });
    } catch (err) {
      console.error("createTransport hata:", err);
      callback({ error: err });
    }
  });

  // ============ connectTransport ============
  socket.on("connectTransport", async ({ roomId, transportId, dtlsParameters }, callback) => {
    try {
      const rObj = rooms[roomId];
      if (!rObj) {
        return callback({ error: "Room yok" });
      }
      const transport = rObj.transports.find((t) => t.id === transportId);
      if (!transport) {
        return callback({ error: "Transport yok" });
      }
      await transport.connect({ dtlsParameters });
      callback({ connected: true });
    } catch (err) {
      console.error("connectTransport hata:", err);
      callback({ error: err });
    }
  });

  // ============ produce (audio) ============
  socket.on("produce", async ({ roomId, transportId, kind, rtpParameters }, callback) => {
    try {
      const rObj = rooms[roomId];
      if (!rObj) {
        return callback({ error: "Room yok" });
      }
      const transport = rObj.transports.find((t) => t.id === transportId);
      if (!transport) {
        return callback({ error: "Transport yok" });
      }
      const producer = await transport.produce({ kind, rtpParameters });
      rObj.producers.push(producer);

      producer.on("transportclose", () => {
        console.log("Producer transport closed => remove producer");
        const idx = rObj.producers.indexOf(producer);
        if (idx >= 0) rObj.producers.splice(idx, 1);
      });

      callback({ id: producer.id });
    } catch (err) {
      console.error("produce hata:", err);
      callback({ error: `${err}` });
    }
  });

  // ============ consume (audio) ============
  socket.on("consume", async ({ roomId, transportId, producerId, rtpCapabilities }, callback) => {
    try {
      const rObj = rooms[roomId];
      if (!rObj) {
        return callback({ error: "Room yok" });
      }
      const { router } = rObj;
      const transport = rObj.transports.find((t) => t.id === transportId);
      if (!transport) {
        return callback({ error: "Transport yok" });
      }
      // canConsume?
      if (!router.canConsume({ producerId, rtpCapabilities })) {
        return callback({ error: "cannot consume" });
      }
      const consumer = await transport.consume({
        producerId,
        rtpCapabilities,
        paused: false,
      });
      rObj.consumers.push(consumer);

      consumer.on("transportclose", () => {
        console.log("Consumer transport close => remove consumer");
        const idx = rObj.consumers.indexOf(consumer);
        if (idx >= 0) rObj.consumers.splice(idx, 1);
      });
      consumer.on("producerclose", () => {
        console.log("Producer closed => consumer closed");
        const idx = rObj.consumers.indexOf(consumer);
        if (idx >= 0) rObj.consumers.splice(idx, 1);
        consumer.close();
        callback({ producerClosed: true });
      });

      callback({
        id: consumer.id,
        producerId,
        kind: consumer.kind,
        rtpParameters: consumer.rtpParameters,
      });
    } catch (err) {
      console.error("consume hata:", err);
      callback({ error: `${err}` });
    }
  });

  // ============ Disconnect ============
  socket.on("disconnect", () => {
    console.log("disconnect:", socket.id);
    const userData = users[socket.id];
    if (userData && userData.currentRoom) {
      const roomId = userData.currentRoom;
      const rObj = rooms[roomId];
      if (rObj) {
        // Tüm transport'ları kapatabilirsin
        rObj.transports.forEach((t) => {
          if (!t.closed) {
            t.close();
          }
        });
        // producers, consumers dizilerinden de çıkarabilirsin
      }
    }
    delete users[socket.id];
  });
});

// Sunucuyu başlat
const PORT = process.env.PORT || 10000;
server.listen(PORT, () => {
  console.log(`Sunucu çalışıyor: http://localhost:${PORT}`);
});
