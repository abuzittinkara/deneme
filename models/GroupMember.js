const mongoose = require('mongoose');

const GroupMemberSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  group: { type: mongoose.Schema.Types.ObjectId, ref: 'Group', required: true },
  unread: { type: Number, default: 0 },
  muteUntil: { type: Date },
  channelUnreads: {
    type: Map,
    of: Number,
    default: {}
  },
  mentionUnreads: {
    type: Map,
    of: Number,
    default: {}
  },
  channelMuteUntil: {
    type: Map,
    of: Date,
    default: {}
  },
  notificationType: {
    type: String,
    enum: ['all', 'mentions', 'nothing'],
    default: 'all'
  },
  channelNotificationType: {
    type: Map,
    of: { type: String, enum: ['all', 'mentions', 'nothing'] },
    default: {}
  },
  categoryOrder: {
    type: Map,
    of: Number,
    default: {}
  },
  collapsedCategories: {
    type: Map,
    of: Boolean,
    default: {}
  }
});

GroupMemberSchema.index({ user: 1, group: 1 }, { unique: true });

module.exports = mongoose.model('GroupMember', GroupMemberSchema);
