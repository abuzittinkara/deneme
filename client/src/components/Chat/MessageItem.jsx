import React from 'react';

const MessageItem = ({ message }) => {
  return (
    <div className="message-item">
      <div className="message-header">
        <span className="sender-name">{message.username}</span>
        <span className="timestamp">
          {new Date(message.timestamp).toLocaleTimeString()}
        </span>
      </div>
      <div className="message-content">{message.content}</div>
    </div>
  );
};

export default MessageItem;
