/**************************************
 * script.js
 * (Discord’a benzer SFU client mantığı)
 **************************************/
const socket = io();
let username = null;

// Basit: Mevcut group/channel 
let currentGroup = null;
let currentChannel = null;

// Mediasoup SFU approach
let sendTransport = null;
let audioProducer = null;
let audioConsumers = []; // Diğer user'ların consumer'ları, basit

/************** Login **************/
const loginScreen = document.getElementById("loginScreen");
const callScreen = document.getElementById("callScreen");
const loginUsernameInput = document.getElementById("loginUsernameInput");
const loginPasswordInput = document.getElementById("loginPasswordInput");
const loginButton = document.getElementById("loginButton");
const loginErrorMessage = document.getElementById("loginErrorMessage");

loginButton.addEventListener("click", attemptLogin);

function attemptLogin() {
  const usernameVal = loginUsernameInput.value.trim();
  const passwordVal = loginPasswordInput.value.trim();
  if (!usernameVal || !passwordVal) {
    loginErrorMessage.textContent = "Gerekli alanlar boş!";
    loginErrorMessage.style.display = "block";
    return;
  }
  socket.emit("login", { username: usernameVal, password: passwordVal });
}

socket.on("loginResult", (data) => {
  if (data.success) {
    username = data.username;
    loginScreen.style.display = "none";
    callScreen.style.display = "flex";
    socket.emit("set-username", username);
  } else {
    loginErrorMessage.textContent = data.message || "Hata oluştu";
    loginErrorMessage.style.display = "block";
  }
});

/*************** Discord-like Oda (Channel) ***************/
// Basit bir örnek => channel'a girme butonu
// Normalde UI'de group ve channel listesi olur. Biz basit bir fonksiyon:

function joinChannelClick() {
  const grpId = "e3a65c24-8d92-4c8c-8502-ad71130abb2d"; // Örnek
  const chId = "8b87c485-7243-49dd-a7b0-13ea4c665df3"; // Örnek
  joinVoiceChannel(grpId, chId);
}
document.getElementById("createGroupButton").addEventListener("click", joinChannelClick);

function joinVoiceChannel(groupId, channelId) {
  currentGroup = groupId;
  currentChannel = channelId;
  socket.emit("joinChannel", { groupId, channelId });
}

socket.on("joinedChannel", async ({ roomId }) => {
  console.log("joinedChannel => roomId:", roomId);
  // SFU => transport ve produce
  await createSendTransport(roomId);
  await produceAudio(roomId);
});

/*************** CREATE TRANSPORT ***************/
function createSendTransport(roomId) {
  return new Promise((resolve, reject) => {
    socket.emit("createTransport", roomId, async (data) => {
      if (data.error) {
        console.error("createTransport hata:", data.error);
        return reject(data.error);
      }
      console.log("createTransport =>", data);
      sendTransport = data;

      // Now connect it (DTLS)
      connectTransport(roomId, sendTransport)
        .then(() => {
          resolve();
        })
        .catch(reject);
    });
  });
}

function connectTransport(roomId, transportObj) {
  return new Promise((resolve, reject) => {
    socket.emit(
      "connectTransport",
      {
        roomId,
        transportId: transportObj.id,
        dtlsParameters: transportObj.dtlsParameters,
      },
      (res) => {
        if (res.error) {
          console.error("connectTransport hata:", res.error);
          return reject(res.error);
        }
        console.log("connectTransport => success", res);
        resolve();
      }
    );
  });
}

/*************** PRODUCE (Audio) ***************/
async function produceAudio(roomId) {
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: false,
    });
    console.log("Mikrofon izni verildi");
  } catch (err) {
    console.error("Mikrofon izni alınamadı:", err);
    return;
  }
  const audioTrack = stream.getAudioTracks()[0];
  // normalde "mediasoup-client" => device produce rtpParameters
  const rtpParameters = {
    // basit, gerçekte "opus" parametreleri vs.
  };

  return new Promise((resolve, reject) => {
    socket.emit(
      "produce",
      {
        roomId,
        transportId: sendTransport.id,
        kind: "audio",
        rtpParameters,
      },
      (res) => {
        if (res.error) {
          console.error("produce hata:", res.error);
          return reject(res.error);
        }
        console.log("Audio Producer created =>", res);
        audioProducer = res; // { id: ... }
        resolve();
      }
    );
  });
}

/*************** CONSUME (Audio) ***************/
// Gerçekte, sunucu newProducer => broadcast => "hey user, produce var" => consume
// Basit, manuel "consumeAll" vs. 
// Bunu ekleyebilirsiniz. Minimal şekilde burada yok.

/*************** Disconnect vb. ***************/
socket.on("disconnect", () => {
  console.log("socket.io disconnected");
});

/*************** Extra UI / Panel ***************/
// Eski "micToggleButton" vb. ekleyebilirsiniz
