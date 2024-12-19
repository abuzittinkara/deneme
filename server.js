const http = require("http");
const express = require("express");
const socketIO = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = socketIO(server);

const users = {};  
const groups = {};

// Basit kayıtlı kullanıcılar listesi (veritabanı yerine)
const registeredUsers = {
// örnek: 'ahmet': { password: '12345', name:'Ahmet', surname:'Yılmaz', birthdate:'1990-01-01', email:'...', phone:'...' }
};

app.use(express.static("public")); // Static files (frontend)

io.on("connection", (socket) => {
  console.log("Kullanıcı bağlandı:", socket.id);
  
  // Kullanıcı ilk bağlandığında username yok, currentGroup yok
  users[socket.id] = { username: null, currentGroup: null };

  // Yeni bağlanan kullanıcıya mevcut grup listesini gönder
  sendGroupsList();

  // Login olayı
  socket.on('login', ({ username, password }) => {
    if (registeredUsers[username] && registeredUsers[username].password === password) {
      socket.emit('loginResult', { success: true, username: username });
    } else {
      socket.emit('loginResult', { success: false, message: 'Kullanıcı adı veya parola hatalı.' });
    }
  });

  // Register olayı
  socket.on('register', (userData) => {
    const { username, name, surname, birthdate, email, phone, password, passwordConfirm } = userData;

    if (!username || !name || !surname || !birthdate || !email || !phone || !password || !passwordConfirm) {
      socket.emit('registerResult', { success: false, message: 'Tüm alanları doldurunuz.' });
      return;
    }

    if (username !== username.toLowerCase()) {
      socket.emit('registerResult', { success: false, message: 'Kullanıcı adı sadece küçük harf olmalı.' });
      return;
    }

    if (registeredUsers[username]) {
      socket.emit('registerResult', { success: false, message: 'Bu kullanıcı adı zaten alınmış.' });
      return;
    }

    if (password !== passwordConfirm) {
      socket.emit('registerResult', { success: false, message: 'Parolalar eşleşmiyor.' });
      return;
    }

    // Kullanıcıyı kaydet
    registeredUsers[username] = {
      password: password,
      name: name,
      surname: surname,
      birthdate: birthdate,
      email: email,
      phone: phone
    };

    socket.emit('registerResult', { success: true });
  });

  // Kullanıcı adını ayarla
  socket.on('set-username', (username) => {
    if (username && typeof username === 'string') {
      users[socket.id].username = username.trim();
      console.log(`Kullanıcı ${socket.id} için kullanıcı adı belirlendi: ${username}`);
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
      const oldGroup = users[socket.id].currentGroup;
      const username = users[socket.id].username || `(Kullanıcı ${socket.id})`;

      if (oldGroup && groups[oldGroup]) {
        groups[oldGroup].users = groups[oldGroup].users.filter(u => u.id !== socket.id);
        io.to(oldGroup).emit('groupUsers', groups[oldGroup].users);
        socket.leave(oldGroup);
      }

      groups[groupName].users.push({ id: socket.id, username: username });
      users[socket.id].currentGroup = groupName;
      socket.join(groupName);
      
      io.to(groupName).emit('groupUsers', groups[groupName].users);

      console.log(`Kullanıcı ${socket.id} (${username}) gruba katıldı: ${groupName}`);
    }
  });

  // Sinyal işleme (WebRTC)
  socket.on("signal", (data) => {
    const targetId = data.to;
    if (targetId && users[targetId]) {
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
