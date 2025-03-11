import mongoose from 'mongoose';

const errorLogSchema = new mongoose.Schema({
  errorMessage: {
    type: String,
    required: true
  },
  originalQuestion: {
    type: String,
    required: true
  },
  stackTrace: String,
  timestamp: {
    type: Date,
    default: Date.now
  }
});

export const ErrorLog = mongoose.model('ErrorLog', errorLogSchema);