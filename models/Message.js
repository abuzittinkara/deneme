// models/Message.js
const mongoose = require('mongoose');
const AttachmentSchema = require('./Attachment');

const MessageSchema = new mongoose.Schema({
  channel: { type: mongoose.Schema.Types.ObjectId, ref: 'Channel', required: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  content: { type: String, default: '' },
  timestamp: { type: Date, default: Date.now },
  attachments: {
    type: [AttachmentSchema],
    default: []
  },
});

module.exports = mongoose.model('Message', MessageSchema);
