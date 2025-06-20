// models/User.js
const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  passwordHash: { type: String, required: true },
  name: { type: String },
  surname: { type: String },
  birthdate: { type: Date },
  email: { type: String },
  phone: { type: String },
  avatar: { type: String },

  // Bu kullanıcının üyesi olduğu Gruplar (MongoDB ObjectId listesi)
  groups: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Group' }],
  // Arkadaşlar listesi (kalıcı olarak DB’de saklanacak)
  friends: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  // Engellenen arkadaşlar listesi
  blockedUsers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }]
});

module.exports = mongoose.model('User', UserSchema);
