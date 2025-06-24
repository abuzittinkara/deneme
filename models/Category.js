// models/Category.js
const mongoose = require('mongoose');

const CategorySchema = new mongoose.Schema({
  categoryId: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  group: { type: mongoose.Schema.Types.ObjectId, ref: 'Group', required: true },
  order: { type: Number, default: 0 }
});

module.exports = mongoose.model('Category', CategorySchema);
