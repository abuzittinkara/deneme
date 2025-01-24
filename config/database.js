/**************************************
 * config/database.js
 **************************************/
const mongoose = require('mongoose');

const uri = process.env.MONGODB_URI || "mongodb+srv://abuzorttin:HWZe7uK5yEAE@cluster0.vdrdy.mongodb.net/myappdb?retryWrites=true&w=majority";

mongoose.connect(uri)
  .then(() => console.log("MongoDB bağlantısı başarılı!"))
  .catch(err => console.error("MongoDB bağlantı hatası:", err));

// Bu dosyada mongoose bağlanıyor. Dışarı herhangi bir şey export etmek
// zorunda değilsiniz. require('./config/database') diyerek bağlanmış olursunuz.
