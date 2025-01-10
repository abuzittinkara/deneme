// models/Channel.js
const mongoose = require('mongoose');

const ChannelSchema = new mongoose.Schema({
  channelId: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  group: { type: mongoose.Schema.Types.ObjectId, ref: 'Group', required: true },
  users: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],

  // EKLENDİ: Kanal türü: "voice" veya "text"
  type: { type: String, enum: ['voice', 'text'], default: 'voice' }
});

module.exports = mongoose.model('Channel', ChannelSchema);
