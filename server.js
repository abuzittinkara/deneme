const http = require("http");
const express = require("express");
const socketIO = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = socketIO(server);

const users = {}; // Artık bir obje kullanıyoruz

app.use(express.static("public")); // Static files (frontend)

io.on("connection", (socket) => {
  console.log("Kullanıcı bağlandı:", socket.id);
  
  // Başlangıçta henüz kullanıcı adını bilmiyoruz, o yüzden sadece id ile bir kullanıcı ekliyoruz
  users[socket.id] = { username: null };

  // Yeni bağlanan kullanıcıya mevcut kullanıcı listesini gönderelim
  sendUserList();

  // Kullanıcıdan kullanıcı adını al
  socket.on('set-username', (username) => {
    if (username && typeof username === 'string') {
      users[socket.id].username = username.trim();
      console.log(`Kullanıcı ${socket.id} için kullanıcı adı belirlendi: ${username}`);
      // Tüm kullanıcılara güncel listeyi gönder
      sendUserList();
    }
  });

  // Sinyal işleme
  socket.on("signal", (data) => {
    console.log("Signal alındı:", data);
    if (data.to) {
      if (users[data.to]) {
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

  // Bağlantı kesildiğinde kullanıcıyı listeden çıkar
  socket.on("disconnect", () => {
    console.log("Kullanıcı ayrıldı:", socket.id);
    delete users[socket.id];
    sendUserList();
  });
});

// Her 10 sn'de bir kullanıcıları logla (debug amaçlı)
setInterval(() => {
  console.log("Bağlı kullanıcılar:", users);
}, 10000);

function sendUserList() {
  // users objesini diziye çevirip sadece username ve id alanlarını gönderebiliriz.
  const userList = Object.keys(users).map(id => {
    return { id: id, username: users[id].username };
  });
  io.emit('user-list', userList);
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Sunucu çalışıyor: http://localhost:${PORT}`);
});
