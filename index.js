import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import { SupabaseVectorStore } from "@langchain/community/vectorstores/supabase";
import { createClient } from '@supabase/supabase-js'
import { OpenAIEmbeddings } from "@langchain/openai";
import { ChatOpenAI } from "@langchain/openai";
import { PromptTemplate } from "@langchain/core/prompts";
import { ChatLog } from './models/chatlog.js';
import { ErrorLog } from './models/errorlog.js';
import 'dotenv/config';

const app = express();
app.use(cors());
app.use(express.json());


// Initialize MongoDB Connection
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('✅ Connected to MongoDB'))
  .catch(err => console.error('❌ MongoDB connection error:', err));


// Initialize Supabase Client
const sbClient = createClient(
  process.env.SUPABASE_URL_LC_CHATBOT,
  process.env.SUPABASE_API_KEY
);

// Initialize Embedding Model
const embeddings = new OpenAIEmbeddings({
  openAIApiKey: process.env.OPENAI_API_KEY
});

// Initialize Vector Store for Searching Context
const vectorStore = new SupabaseVectorStore(embeddings, {
  client: sbClient,
  tableName: 'documents',
  queryName: 'match_documents'
});

// Initialize Chat Model
const llm = new ChatOpenAI({ 
  openAIApiKey: process.env.OPENAI_API_KEY,
  temperature: 0.2
});

// ✅ Prompt to Convert Question to Standalone Question
const standaloneQuestionTemplate = `
You are a friendly and helpful support bot designed to answer questions related personal,professional,family,friends,education,skills,health,aims of Navneet Kumar based on the provided context.Convert the given question into a standalone question that contains all necessary context.

Original Question: {question}
Standalone Question:
`;

// ✅ Prompt to Generate Answer Based on Context
const answerGenerationTemplate = `
You are a friendly and helpful support bot designed to answer questions related personal,professional,family,friends,education,skills,health,aims of Navneet Kumar based on the provided context. Do your best to find the answer within the given context.If question is out of context or answer isn't in context  simply say "I'm sorry, I don't know the answer to that. Try Describing the question in detail or email navneetkumar.learn@gmail.com."
Avoid making up answers and use Relevant emojis where applicable and if appropriate.
Always respond in a casual, friendly tone as if you're chatting with a friend.
if anyone say hi,hello or any greetings then respond with greetings and ask what do you wan to ask navneet kumar.
complete the answer within 3 lines(50-75 words).
Context: {context}
Question: {question}
Answer:
`;


// ✅ Function to Process the Question
const processQuestion = async (originalQuestion) => {
    let aiResponse="";
  try {

    // Step 1: Convert to Standalone Question
    const standalonePrompt = PromptTemplate.fromTemplate(standaloneQuestionTemplate);
    const standaloneChain = standalonePrompt.pipe(llm);
    
    const result = await standaloneChain.invoke({ question: originalQuestion });
    const standaloneQuestion = result.content.trim();
    
    // console.log("✅ Standalone Question:", standaloneQuestion);

    // Step 2: Search Supabase for Relevant Context
    const contextDocs = await vectorStore.similaritySearch(standaloneQuestion, 3);
    const context = contextDocs.map(d => d.pageContent).join('\n\n');
    //  console.log("✅context=",context)
    // Step 3: Generate Answer Based on Context
    const answerPrompt = PromptTemplate.fromTemplate(answerGenerationTemplate);
    const answerChain = answerPrompt.pipe(llm);

    // Handle No Context Scenario
    if (!context.trim()) {
      console.log("❌ No context found.");
      return `I'm sorry, I don't know the answer to that. Please email **navneetkumar.learn@gmail.com** for further assistance.`;
    }

    // Generate Answer
    const finalAnswer = await answerChain.invoke({
      context: context,
      question: standaloneQuestion
    });
    // console.log("✅ Final Answer:", finalAnswer.content.trim());
    aiResponse=finalAnswer.content.trim();
     

    // ✅ Save to MongoDB
    try {
        const chatLog = new ChatLog({
          originalQuestion,
          standaloneQuestion,
          aiResponse
        });
        
        await chatLog.save();
      } catch (dbError) {
        console.error('❌ MongoDB save error:', dbError);
      }




    return aiResponse;
    
  } catch (error) {
    console.error('❌ Processing Error:', error);
    
    // Log error to MongoDB
    try {
      const errorLog = new ErrorLog({
        errorMessage: error.message,
        originalQuestion: originalQuestion,
        stackTrace: error.stack
      });
      
      await errorLog.save();
      console.log('⚠️ Error logged to MongoDB');
    } catch (dbError) {
      console.error('❌ Failed to save error log:', dbError);
    }

    return "Sorry, I'm having trouble answering that right now. Please try again later. Contact navneetkumar.learn@gmail.com for urgent queries.";
  }
};

// ✅ API Endpoint for Questions
app.post('/ask', async (req, res) => {
  try {
    const { question } = req.body;
    
    if (!question?.trim()) {
      return res.status(400).json({ error: "Question is required" });
    }

    const answer = await processQuestion(question.trim());
    res.json({ answer });
    
  } catch (error) {
    console.error('❌ API Error:', error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ✅ Start the Server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
