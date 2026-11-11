const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ['added', 'given', 'received'],
    required: true,
  },
  person: {
    type: String,
    trim: true,
    maxlength: 100,
    default: '',
  },
  amount: {
    type: Number,
    required: true,
    min: 0.01,
    max: 1000000000000,
  },
  date: {
    type: String,
    required: true,
    match: /^\d{4}-\d{2}-\d{2}$/,
  },
  remarks: {
    type: String,
    trim: true,
    maxlength: 500,
    default: '',
  },
}, { timestamps: true });

transactionSchema.set('toJSON', {
  transform: (_document, value) => {
    value.id = String(value._id);
    delete value._id;
    delete value.__v;
    return value;
  },
});

module.exports = mongoose.model('Transaction', transactionSchema);