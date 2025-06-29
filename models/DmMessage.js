const mongoose = require('mongoose');
const AttachmentSchema = require('./Attachment');

const DMMessageSchema = new mongoose.Schema({
  from: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  to: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  content: { type: String, default: '' },
  timestamp: { type: Date, default: Date.now },
  attachments: {
    type: [AttachmentSchema],
    default: []
  },
});

module.exports = mongoose.model('DMMessage', DMMessageSchema);
