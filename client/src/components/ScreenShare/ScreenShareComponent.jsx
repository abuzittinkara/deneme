import React, { useState, useContext } from 'react';
import { SocketContext } from '../../content/SocketContext';
import { startScreenShare, stopScreenShare } from '../../services/socketService';

const ScreenShareComponent = ({ sendTransport }) => {
  const socket = useContext(SocketContext);
  const [screenSharing, setScreenSharing] = useState(false);

  const handleStart = async () => {
    try {
      await startScreenShare(sendTransport, socket);
      setScreenSharing(true);
    } catch (error) {
      console.error("Ekran paylaşımı başlatılamadı:", error);
    }
  };

  const handleStop = async () => {
    await stopScreenShare(socket);
    setScreenSharing(false);
  };

  return (
    <div className="screen-share-component">
      {screenSharing ? (
        <button onClick={handleStop}>Ekran Paylaşımını Durdur</button>
      ) : (
        <button onClick={handleStart}>Ekran Paylaşımını Başlat</button>
      )}
    </div>
  );
};

export default ScreenShareComponent;
