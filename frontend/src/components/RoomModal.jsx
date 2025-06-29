import React from 'react';

export default function RoomModal() {
  return (
    <div id="roomModal" className="modal">
      <div className="modal-content">
        <h2>Oda Oluştur</h2>
        <input type="text" id="modalRoomName" className="input-text" placeholder="Oda Adı" />
        <div className="channel-type-options" style={{ marginTop: '1rem' }}>
          <input type="radio" id="textChannel" name="channelType" value="text" defaultChecked />
          <label htmlFor="textChannel">Metin Kanalı (Yazılı sohbet)</label>
          <br />
          <input type="radio" id="voiceChannel" name="channelType" value="voice" />
          <label htmlFor="voiceChannel">Ses Kanalı (Sesli sohbet)</label>
        </div>
        <div className="modal-buttons">
          <button id="modalCreateRoomBtn" className="btn primary">Oluştur</button>
          <button id="modalCloseRoomBtn" className="btn secondary">Kapat</button>
        </div>
      </div>
    </div>
  );
}
