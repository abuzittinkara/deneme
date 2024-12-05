const http = require("http");
const express = require("express");
const socketIO = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = socketIO(server);

const users = new Set();

app.use(express.static("public")); // Static files (frontend)

io.on("connection", (socket) => {
  users.add(socket.id);
  console.log("User connected:", socket.id);

  // Signaling for WebRTC
  socket.on("signal", (data) => {
    console.log("Signal received:", data);

    if (users.has(data.to)) {
      io.to(data.to).emit("signal", {
        from: socket.id,
        signal: data.signal,
      });
    } else {
      console.log(`Target user (${data.to}) not found.`);
    }
  });

  socket.on("disconnect", () => {
    users.delete(socket.id);
    console.log("User disconnected:", socket.id);
  });
});

// Debugging connected users every 10 seconds
setInterval(() => {
  console.log("Connected users:", Array.from(users));
}, 10000);

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
