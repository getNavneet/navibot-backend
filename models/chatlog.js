import mongoose from 'mongoose';

const chatLogSchema = new mongoose.Schema({
  originalQuestion: String,
  standaloneQuestion: String,
  aiResponse: String,
  timestamp: { type: Date, default: Date.now }
});

export const ChatLog = mongoose.model('ChatLog', chatLogSchema);