const mongoose = require('mongoose');

const DMMessageSchema = new mongoose.Schema({
  from: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  to: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  content: { type: String, default: '' },
  timestamp: { type: Date, default: Date.now },
  attachments: {
    type: [{
      id: String,
      url: String,
      type: String,
      _id: false
    }],
    default: []
  },
});

module.exports = mongoose.model('DMMessage', DMMessageSchema);