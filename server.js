const http = require("http");
const express = require("express");
const socketIO = require("socket.io");
const { v4: uuidv4 } = require('uuid'); // Grup için benzersiz ID üretmek isterseniz

const app = express();
const server = http.createServer(app);
const io = socketIO(server);

const users = {}; // socket.id -> { username: "..." }
const groups = []; // { id: "groupId", name: "Grup Adı", members: [socketId, ...] }

app.use(express.static("public")); // Static files (frontend)

io.on("connection", (socket) => {
  console.log("Kullanıcı bağlandı:", socket.id);
  
  // Bağlanan kullanıcı için username başta bilinmiyor
  users[socket.id] = { username: null };

  // Mevcut user list gönderiyoruz (gerekirse)
  sendUserList();
  
  // Mevcut grup listesini gönder
  sendGroupList(socket);

  socket.on('set-username', (username) => {
    if (username && typeof username === 'string') {
      users[socket.id].username = username.trim();
      console.log(`Kullanıcı ${socket.id} için kullanıcı adı: ${username}`);
      sendUserList();
      // Kullanıcı ismi alındıktan sonra belki anında grup listesini güncellemek isterseniz:
      sendGroupList();
    }
  });

  // Grup oluşturma
  socket.on('create-group', (data) => {
    const groupName = (data && data.groupName) ? data.groupName.trim() : "";
    if (groupName) {
      const groupId = uuidv4();
      groups.push({
        id: groupId,
        name: groupName,
        members: []
      });
      console.log(`Grup oluşturuldu: ${groupName} (ID: ${groupId})`);
      sendGroupList();
    }
  });

  // Gruba katılma
  socket.on('join-group', (data) => {
    const groupId = data && data.groupId;
    const group = groups.find(g => g.id === groupId);
    if (group) {
      // Kullanıcı zaten ekli değilse ekle
      if (!group.members.includes(socket.id)) {
        group.members.push(socket.id);
      }
      // Grubun üyelerini al
      const groupMembers = group.members.map(id => ({
        id: id,
        username: users[id] ? users[id].username : "(bilinmiyor)"
      }));

      console.log(`Kullanıcı ${socket.id} gruba katıldı: ${group.name}`);

      // Kullanıcıya gruba katıldığı bilgisini gönder ve grubun üyelerini ilet
      io.to(socket.id).emit('joined-group', {
        groupId: groupId,
        members: groupMembers
      });

      // Güncel grup listesi herkese
      sendGroupList();
    }
  });

  // WebRTC sinyalleşme
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

    // Kullanıcı gruplardan çıkar
    groups.forEach(g => {
      const index = g.members.indexOf(socket.id);
      if (index !== -1) {
        g.members.splice(index, 1);
      }
    });

    sendUserList();
    sendGroupList();
  });
});

function sendUserList() {
  const userList = Object.keys(users).map(id => ({
    id: id,
    username: users[id].username
  }));
  io.emit('user-list', userList);
}

function sendGroupList(socketToSend=null) {
  // Tüm grupları ismi, id'si ve üye sayısı ile gönderelim
  const groupList = groups.map(g => ({
    id: g.id,
    name: g.name,
    memberCount: g.members.length
  }));
  if (socketToSend) {
    socketToSend.emit('group-list', groupList);
  } else {
    io.emit('group-list', groupList);
  }
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Sunucu çalışıyor: http://localhost:${PORT}`);
});
