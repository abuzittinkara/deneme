const http = require("http");
const express = require("express");
const socketIO = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = socketIO(server);

const users = new Set();

app.use(express.static("public")); // Static files (frontend)

io.on("connection", (socket) => {
  console.log("Kullanıcı bağlandı:", socket.id);
  users.add(socket.id); // Kullanıcıyı sete ekle

  // Mevcut kullanıcı listesini yeni bağlanan kullanıcıya gönder
  socket.emit("users", Array.from(users).filter((id) => id !== socket.id));

  // Diğer kullanıcılara yeni kullanıcının bağlandığını bildir
  socket.broadcast.emit("new-user", socket.id);

  socket.on("signal", (data) => {
    console.log("Signal alındı:", data);
    if (data.to) {
      if (users.has(data.to)) {
        io.to(data.to).emit("signal", {
          from: socket.id,
          signal: data.signal,
        });
        console.log("Signal iletildi:", data);
      } else {
        console.log(`Hedef kullanıcı (${data.to}) mevcut değil.`);
      }
    } else {
      console.log("Hedef kullanıcı yok:", data.to);
    }
  });

  socket.on("disconnect", () => {
    users.delete(socket.id); // Kullanıcıyı setten çıkar
    console.log("Kullanıcı ayrıldı:", socket.id);
  });
});

// 10 saniyede bir bağlı kullanıcıları logla
setInterval(() => {
  console.log("Bağlı kullanıcılar:", Array.from(users));
}, 10000);

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log(`Sunucu çalışıyor: http://localhost:${PORT}`);
});
