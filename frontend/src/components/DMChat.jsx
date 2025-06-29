import React, { useContext, useEffect, useRef, useState } from 'react';
import { SocketContext } from '../SocketProvider.jsx';

export default function DMChat({ friend, dmActive }) {
  const socket = useContext(SocketContext);
  const [messages, setMessages] = useState([]);
  const inputRef = useRef(null);
  const fileRef = useRef(null);

  useEffect(() => {
    if (!socket || !friend) return;
    socket.emit('joinDM', { friend }, (res) => {
      if (res && res.success) {
        socket.emit('getDMMessages', { friend }, (msgRes) => {
          if (msgRes.success && msgRes.messages) {
            setMessages(msgRes.messages);
          } else {
            setMessages([]);
          }
        });
      }
    });
    const handleNew = (data) => {
      if (data.friend === friend && data.message) {
        setMessages((prev) => [...prev, data.message]);
      }
    };
    const handleDeleted = ({ messageId }) => {
      setMessages((prev) => prev.filter((m) => (m.id || m._id) !== messageId));
    };
    socket.on('newDMMessage', handleNew);
    socket.on('dmMessageDeleted', handleDeleted);
    return () => {
      socket.emit('leaveDM', { friend });
      socket.off('newDMMessage', handleNew);
      socket.off('dmMessageDeleted', handleDeleted);
    };
  }, [socket, friend]);

  const send = () => {
    if (!socket || !friend) return;
    const content = inputRef.current ? inputRef.current.innerText.trim() : '';
    const files = fileRef.current ? Array.from(fileRef.current.files) : [];
    const attachments = files.map((f) => ({ id: f.name, url: URL.createObjectURL(f), type: f.type }));
    if (!content && attachments.length === 0) return;
    socket.emit('dmMessage', { friend, content, attachments }, (ack) => {
      if (ack && ack.success) {
        if (inputRef.current) inputRef.current.innerHTML = '';
        if (fileRef.current) fileRef.current.value = '';
      } else {
        alert('Mesaj gönderilemedi.');
      }
    });
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      send();
    }
  };

  return (
    <div
      id="dmContentArea"
      style={{ display: dmActive && friend ? 'flex' : 'none', flex: 1, flexDirection: 'column', overflow: 'auto' }}
    >
      <div id="dmMessages" className="text-messages" style={{ flex: 1 }}>
        {messages.map((msg) => (
          <div key={msg.id || msg._id} className="text-message">
            <div className="message-item" style={{ position: 'relative' }}>
              <span className="sender-name">{msg.username || msg.user?.username}</span>
              <div className="message-content">{msg.content}</div>
              {Array.isArray(msg.attachments) && msg.attachments.length > 0 && (
                <div className="message-attachments">
                  {msg.attachments.map((a) => (
                    <a key={a.id} href={a.url} target="_blank" rel="noopener noreferrer">
                      {a.name || a.url}
                    </a>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
      <div id="dmTextChatInputBar" className="text-chat-input-bar">
        <div className="chat-input-wrapper">
          <input ref={fileRef} type="file" multiple />
          <div
            id="dmMessageInput"
            className="chat-input"
            contentEditable
            data-placeholder="Bir mesaj yazın..."
            ref={inputRef}
            onKeyDown={handleKeyDown}
          ></div>
          <span id="dmSendButton" className="send-icon material-icons" onClick={send}>
            send
          </span>
        </div>
      </div>
    </div>
  );
}
