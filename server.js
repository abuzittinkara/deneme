const http = require("http");
const express = require("express");
const socketIO = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = socketIO(server);

const users = {};  
const groups = {};

app.use(express.static("public")); // Static files (frontend)

io.on("connection", (socket) => {
  console.log("Kullanıcı bağlandı:", socket.id);
  
  // Kullanıcı ilk bağlandığında username yok, currentGroup yok
  users[socket.id] = { username: null, currentGroup: null };

  // Yeni bağlanan kullanıcıya mevcut grup listesini gönder
  sendGroupsList();

  // Kullanıcıdan kullanıcı adını al
  socket.on('set-username', (username) => {
    if (username && typeof username === 'string') {
      users[socket.id].username = username.trim();
      console.log(`Kullanıcı ${socket.id} için kullanıcı adı belirlendi: ${username}`);
      // İstemci tarafında gruba katılma olmadan önce sadece grup listesi görünecek.
    }
  });

  // Yeni grup oluştur
  socket.on('createGroup', (groupName) => {
    if (groupName && typeof groupName === 'string') {
      groupName = groupName.trim();
      if (!groups[groupName]) {
        groups[groupName] = { users: [] };
        console.log(`Yeni grup oluşturuldu: ${groupName}`);
        sendGroupsList();
      }
    }
  });

  // Bir gruba katıl
  socket.on('joinGroup', (groupName) => {
    if (groupName && groups[groupName]) {
      // Kullanıcı eski bir grupta mı?
      const oldGroup = users[socket.id].currentGroup;
      const username = users[socket.id].username || `(Kullanıcı ${socket.id})`;

      if (oldGroup && groups[oldGroup]) {
        // Eski gruptan çıkar
        groups[oldGroup].users = groups[oldGroup].users.filter(u => u.id !== socket.id);
        // Eski gruptaki kullanıcılara yeni listeyi gönder
        io.to(oldGroup).emit('groupUsers', groups[oldGroup].users);
        socket.leave(oldGroup);
      }

      // Yeni gruba ekle
      groups[groupName].users.push({ id: socket.id, username: username });
      users[socket.id].currentGroup = groupName;
      socket.join(groupName);
      
      // Yeni gruptaki kullanıcılara kullanıcı listesini gönder
      io.to(groupName).emit('groupUsers', groups[groupName].users);

      console.log(`Kullanıcı ${socket.id} (${username}) gruba katıldı: ${groupName}`);
    }
  });

  // Sinyal işleme (WebRTC)
  socket.on("signal", (data) => {
    const targetId = data.to;
    if (targetId && users[targetId]) {
      // Her iki kullanıcı da aynı grupta mı?
      const senderGroup = users[socket.id].currentGroup;
      const targetGroup = users[targetId].currentGroup;
      if (senderGroup && targetGroup && senderGroup === targetGroup) {
        io.to(targetId).emit("signal", {
          from: socket.id,
          signal: data.signal,
        });
      } else {
        console.log(`Signal gönderilemedi. Kullanıcılar aynı grupta değil: ${socket.id} -> ${targetId}`);
      }
    } else {
      console.log(`Hedef kullanıcı mevcut değil: ${data.to}`);
    }
  });

  // Bağlantı kesildiğinde kullanıcıyı listeden çıkar
  socket.on("disconnect", () => {
    console.log("Kullanıcı ayrıldı:", socket.id);
    const userData = users[socket.id];
    if (userData && userData.currentGroup) {
      const grp = userData.currentGroup;
      if (groups[grp]) {
        groups[grp].users = groups[grp].users.filter(u => u.id !== socket.id);
        io.to(grp).emit('groupUsers', groups[grp].users);
      }
    }
    delete users[socket.id];
  });
});

// Her 10 sn'de bir kullanıcılar ve gruplar logla (debug amaçlı)
setInterval(() => {
  console.log("Bağlı kullanıcılar:", users);
  console.log("Gruplar:", groups);
}, 10000);

function sendGroupsList() {
  io.emit('groupsList', Object.keys(groups));
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Sunucu çalışıyor: http://localhost:${PORT}`);
});
