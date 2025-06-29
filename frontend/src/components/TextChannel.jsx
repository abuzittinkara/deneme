import React, { useContext, useEffect, useRef, useState } from 'react';
import { SocketContext } from '../SocketProvider.jsx';
import { UserContext } from '../UserContext.jsx';
import AttachmentPreview from './AttachmentPreview.jsx';

function isDifferentDay(a, b) {
  const d1 = new Date(a);
  const d2 = new Date(b);
  return (
    d1.getFullYear() !== d2.getFullYear() ||
    d1.getMonth() !== d2.getMonth() ||
    d1.getDate() !== d2.getDate()
  );
}

const MONTHS = [
  'Ocak','Şubat','Mart','Nisan','Mayıs','Haziran',
  'Temmuz','Ağustos','Eylül','Ekim','Kasım','Aralık'
];

function formatLongDate(ts) {
  const d = new Date(ts);
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

function pad(n) { return String(n).padStart(2, '0'); }
function formatTimestamp(ts) {
  const d = new Date(ts);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function TypingIndicator({ socket, channelId, username }) {
  const [typers, setTypers] = useState(new Set());

  useEffect(() => setTypers(new Set()), [channelId]);

  useEffect(() => {
    if (!socket) return;
    const handleTyping = ({ username:u, channel }) => {
      if (channel === channelId && u !== username) {
        setTypers(prev => new Set(prev).add(u));
      }
    };
    const handleStop = ({ username:u, channel }) => {
      if (channel === channelId && u !== username) {
        setTypers(prev => {
          const n = new Set(prev); n.delete(u); return n;
        });
      }
    };
    socket.on('typing', handleTyping);
    socket.on('stop typing', handleStop);
    return () => {
      socket.off('typing', handleTyping);
      socket.off('stop typing', handleStop);
    };
  }, [socket, channelId, username]);

  if (typers.size === 0) return null;
  const names = Array.from(typers).join(', ');
  return <div className="typing-indicator">{names} yazıyor...</div>;
}

export default function TextChannel() {
  const socket = useContext(SocketContext);
  const { username } = useContext(UserContext);
  const [channelId, setChannelId] = useState(() => window.currentTextChannel);
  const [messages, setMessages] = useState([]);
  const inputRef = useRef(null);
  const attachRef = useRef(null);

  // poll for channel changes
  useEffect(() => {
    const id = setInterval(() => {
      if (window.currentTextChannel !== channelId) {
        setChannelId(window.currentTextChannel);
      }
    }, 500);
    return () => clearInterval(id);
  }, [channelId]);

  useEffect(() => {
    if (!socket || !channelId) return;
    socket.emit('joinTextChannel', { groupId: window.selectedGroup, roomId: channelId });
    setMessages([]);
    const handleHistory = (msgs) => setMessages(msgs);
    const handleNew = (data) => {
      if (data.channelId === channelId) {
        setMessages(prev => [...prev, data.message]);
      }
    };
    const handleDel = ({ channelId: cid, messageId }) => {
      if (cid === channelId) {
        setMessages(prev => prev.filter(m => (m.id || m._id) !== messageId));
      }
    };
    socket.on('textHistory', handleHistory);
    socket.on('newTextMessage', handleNew);
    socket.on('textMessageDeleted', handleDel);
    return () => {
      socket.off('textHistory', handleHistory);
      socket.off('newTextMessage', handleNew);
      socket.off('textMessageDeleted', handleDel);
    };
  }, [socket, channelId]);

  useEffect(() => {
    if (!socket || !channelId) return;
    const input = inputRef.current;
    if (!input) return;
    let typing = false;
    let interval = null;
    const handler = () => {
      const val = input.innerText.trim();
      if (val !== '') {
        socket.emit('typing', { channel: channelId });
        typing = true;
        if (!interval) {
          interval = setInterval(() => {
            const v = input.innerText.trim();
            if (v !== '') socket.emit('typing', { channel: channelId });
            else {
              clearInterval(interval); interval=null; typing=false;
              socket.emit('stop typing', { channel: channelId });
            }
          }, 2000);
        }
      } else if (typing) {
        socket.emit('stop typing', { channel: channelId });
        typing = false;
        if (interval) { clearInterval(interval); interval=null; }
      }
    };
    input.addEventListener('input', handler);
    return () => {
      input.removeEventListener('input', handler);
      if (interval) clearInterval(interval);
      if (typing) socket.emit('stop typing', { channel: channelId });
    };
  }, [socket, channelId]);

  const send = () => {
    if (!socket || !channelId) return;
    const content = inputRef.current ? inputRef.current.innerText.trim() : '';
    const files = attachRef.current ? attachRef.current.getFiles() : [];
    const atts = files.map(f => ({ id: f.name, url: URL.createObjectURL(f), type: f.type }));
    if (!content && atts.length === 0) return;
    socket.emit('textMessage', {
      groupId: window.selectedGroup,
      roomId: channelId,
      message: content,
      attachments: atts
    });
    if (inputRef.current) inputRef.current.innerHTML = '';
    if (attachRef.current) attachRef.current.clear();
  };

  const handleKey = (e) => { if (e.key === 'Enter') { e.preventDefault(); send(); } };


  return (
    <div
      id="textChannelContainer"
      className="text-channel-container"
      style={{
        display:
          channelId && window.currentRoomType !== 'voice' ? 'flex' : 'none',
        flexDirection: 'column',
      }}
    >
      <div id="textMessages" className="text-messages" style={{ flex: 1 }}>
        {messages.map((msg, idx) => {
          const prev = messages[idx - 1];
          const showDate = !prev || isDifferentDay(prev.timestamp, msg.timestamp);
          return (
            <React.Fragment key={msg.id || msg._id}>
              {showDate && (
                <div className="date-separator">
                  <span className="separator-text">{formatLongDate(msg.timestamp)}</span>
                </div>
              )}
              <div className="text-message">
                <div className="message-item" style={{ position: 'relative' }}>
                  <span className="sender-name">{msg.username || msg.user?.username}</span>
                  <span className="timestamp">{formatTimestamp(msg.timestamp)}</span>
                  <div className="message-content">{msg.content}</div>
                  {Array.isArray(msg.attachments) && msg.attachments.length > 0 && (
                    <div className="message-attachments">
                      {msg.attachments.map(a => (
                        <a key={a.id} href={a.url} target="_blank" rel="noreferrer">
                          {a.name || a.url}
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </React.Fragment>
          );
        })}
      </div>
      <div id="textChatInputBar" className="text-chat-input-bar">
        <div className="chat-input-wrapper">
          <AttachmentPreview ref={attachRef} />
          <div
            id="textChannelMessageInput"
            className="chat-input"
            contentEditable
            data-placeholder="Bir mesaj yazın..."
            ref={inputRef}
            onKeyDown={handleKey}
          ></div>
          <span id="sendTextMessageBtn" className="material-icons send-icon" onClick={send}>send</span>
        </div>
        {/* AttachmentPreview renders previews itself */}
        <TypingIndicator socket={socket} channelId={channelId} username={username} />
      </div>
    </div>
  );
}
