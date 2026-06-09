const express = require('express');
const axios = require('axios');
const app = express();
app.use(express.json());

// === Edit this block for each client ===
const BUSINESS = {
  name: "AutoChat AI Demo",
  products: `
- Ankara Dress ₦8,500 | Sizes S,M,L,XL | Colors Red,Blue | IN STOCK
- Lace Gown ₦14,000 | Size L only | IN STOCK
- Corporate Blazer ₦12,000 | OUT OF STOCK
- Tie-Dye Set ₦9,500 | Sizes M,L | IN STOCK
  `,
  payment: "GTBank — 0123456789 — AutoChat Demo",
  tone: "friendly and warm"
};
// =======================================

const conversations = {}; // in-memory chat history per customer

// Meta calls this once to verify your webhook
app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  if (mode === 'subscribe' && token === process.env.VERIFY_TOKEN) {
    console.log('Webhook verified');
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

// Incoming WhatsApp messages
app.post('/webhook', async (req, res) => {
  res.sendStatus(200); // reply to Meta instantly
  try {
    const value = req.body.entry?.[0]?.changes?.[0]?.value;
    const message = value?.messages?.[0];
    if (!message || message.type !== 'text') return;

    const from = message.from;
    const text = message.text.body;
    const phoneNumberId = value.metadata.phone_number_id;
    console.log(`From ${from}: ${text}`);

    if (!conversations[from]) conversations[from] = [];
    conversations[from].push({ role: 'user', content: text });
    if (conversations[from].length > 10) {
      conversations[from] = conversations[from].slice(-10);
    }

    const reply = await getAIReply(conversations[from]);
    conversations[from].push({ role: 'assistant', content: reply });
    await sendWhatsApp(phoneNumberId, from, reply);
  } catch (err) {
    console.error('Error:', err.response?.data || err.message);
  }
});

async function getAIReply(history) {
  const systemPrompt = `You are a WhatsApp sales assistant for "${BUSINESS.name}".
Tone: ${BUSINESS.tone}. Keep replies under 4 lines. Use emojis naturally.

PRODUCTS:
${BUSINESS.products}

PAYMENT DETAILS: ${BUSINESS.payment}

RULES:
- Never invent products not listed.
- If out of stock, say so and suggest an alternative.
- When the customer wants to order, collect full name, then delivery address, then email — one at a time.
- After collecting all 3, give an order summary and the payment details.
- Delivery: 1-3 days Lagos, 3-5 days other states.`;

  const res = await axios.post(
    'https://api.anthropic.com/v1/messages',
    {
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1000,
      system: systemPrompt,
      messages: history
    },
    {
      headers: {
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json'
      }
    }
  );
  return res.data.content[0].text;
}

async function sendWhatsApp(phoneNumberId, to, message) {
  await axios.post(
    `https://graph.facebook.com/v21.0/${phoneNumberId}/messages`,
    { messaging_product: 'whatsapp', to, type: 'text', text: { body: message } },
    {
      headers: {
        'Authorization': `Bearer ${process.env.WHATSAPP_TOKEN}`,
        'Content-Type': 'application/json'
      }
    }
  );
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`AutoChat bot running on ${PORT}`));
