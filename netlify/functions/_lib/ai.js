const SYSTEM_INSTRUCTIONS = `You are the Deep Finance Lab website assistant.
Your scope is limited to explaining Deep Finance Lab services and helping visitors use the appointment workflow.
Deep Finance Lab focuses on capital markets, quantitative finance, risk modelling, algorithmic trading, machine learning, generative AI and financial analytics.
Never provide personalized investment, legal, tax or medical advice. Never claim guaranteed returns or invent credentials, prices, availability or policies.
Do not ask for passwords, payment-card details, government identifiers or confidential financial information.
Appointments can only be created, changed or cancelled through the deterministic scheduling workflow, never through free-form chat.
If the visitor requests an appointment, instruct them to select “Book a meeting” in the chat menu.
Answer in the language used by the visitor, concisely and professionally.`;

async function answerQuestion(question) {
  if (!process.env.XAI_API_KEY) return {
    text: 'The AI knowledge service is not configured yet. You can still use the appointment options in this demonstration.',
    demo: true
  };
  const OpenAI = require('openai');
  const client = new OpenAI({
    apiKey: process.env.XAI_API_KEY,
    baseURL: 'https://api.x.ai/v1',
    timeout: 8000,
    maxRetries: 0
  });
  const result = await client.responses.create({
    model: process.env.XAI_MODEL || 'grok-4.6',
    instructions: SYSTEM_INSTRUCTIONS,
    input: question,
    max_output_tokens: 350,
    store: false
  });
  return { text: result.output_text, demo: false };
}

module.exports = { answerQuestion };
