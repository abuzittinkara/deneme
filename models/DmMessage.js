const mongoose = require('mongoose');

const DMMessageSchema = new mongoose.Schema({
  from: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  to: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  content: { type: String, required: true },
  timestamp: { type: Date, default: Date.now },
  attachments: {
    type: [{ id: String, url: String, type: String }],
    default: []
  },
});

module.exports = mongoose.model('DMMessage', DMMessageSchema);
