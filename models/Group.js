// models/Group.js
const mongoose = require('mongoose');

const GroupSchema = new mongoose.Schema({
  // Uygulamada grup için oluşturduğumuz rastgele UUID
  groupId: { type: String, required: true, unique: true },
  // Grup ismi
  name: { type: String, required: true },
  // Grubu oluşturan kişinin User tablosundaki _id değeri
  owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  // Bu gruba üye tüm kullanıcıların _id değerleri
  users: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }]
});

module.exports = mongoose.model('Group', GroupSchema);
