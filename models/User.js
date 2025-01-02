const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true, lowercase: true },
  passwordHash: { type: String, required: true },
  name: { type: String, required: true },
  surname: { type: String, required: true },
  birthdate: { type: Date, required: true },
  email: { type: String, required: true, unique: true },
  phone: { type: String, required: true },

  // Kullanıcının üye olduğu veya oluşturduğu grupların MongoDB referansları:
  groups: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Group' }]

}, {
  timestamps: true
});

module.exports = mongoose.model('User', UserSchema);
