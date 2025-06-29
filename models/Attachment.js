const mongoose = require('mongoose');

const AttachmentSchema = new mongoose.Schema({
  id: String,
  url: String,
  type: String,
}, { _id: false });

module.exports = AttachmentSchema;
