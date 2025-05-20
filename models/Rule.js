const mongoose = require('mongoose');

const RuleSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true
  },
  field: {
    type: String,
    required: true
  },
  operator: {
    type: String,
    enum: ['contains','equals','regex','gt','lt'],
    default: 'contains'
  },
  value: {
    type: String,
    required: true
  },
  action: {
    type: String,
    enum: ['Allowed','Forbidden','Tag'],
    required: true
  },
  tag: String,
  priority: {
    type: Number,
    default: 100
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('Rule', RuleSchema);
