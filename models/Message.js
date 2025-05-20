const mongoose = require('mongoose');

const MessageSchema = new mongoose.Schema({
  rawXml: String,
  parsed: Object,
  status: {
    type: String,
    enum: ['Allowed', 'Maybe', 'Forbidden'],
    default: 'Maybe'
  },
  receivedAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('Message', MessageSchema);
