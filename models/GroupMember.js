const mongoose = require('mongoose');

const GroupMemberSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  group: { type: mongoose.Schema.Types.ObjectId, ref: 'Group', required: true },
  unread: { type: Number, default: 0 },
  channelUnreads: {
    type: Map,
    of: Number,
    default: {}
  }
});

GroupMemberSchema.index({ user: 1, group: 1 }, { unique: true });

module.exports = mongoose.model('GroupMember', GroupMemberSchema);