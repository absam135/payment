const mongoose = require('mongoose');

const settingsSchema = new mongoose.Schema({
  key: { type: String, unique: true, default: 'account' },
  openingBalance: { type: Number, min: 0, max: 1000000000000, default: 0 },
}, { timestamps: true });

module.exports = mongoose.model('Settings', settingsSchema);