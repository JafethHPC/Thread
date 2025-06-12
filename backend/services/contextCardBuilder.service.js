const OpenAI = require("openai");
const { getContextRelationships } = require("./relationshipMap.service");

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Helper to decide the display type of an item
function detectItemType(item) {
  if (item.subject) return "email";
  if (item.summary) return "event";
  if (item.title) return "task";
  return "item";
}

async function summariseItem(item) {
  const type = detectItemType(item);
  const systemPrompt =
    "You are an assistant that writes VERY short one-sentence summaries (max 15 words). Write a friendly, concise sentence describing the core fact of the given " +
    type +
    ". Do NOT add any extra commentary.";

  const userContent = JSON.stringify(item).slice(0, 1500); // safety limit

  try {
    const resp = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userContent },
      ],
      max_tokens: 30,
      temperature: 0.3,
    });
    return resp.choices[0].message.content.trim();
  } catch (err) {
    console.error("ContextCardBuilder summary error", err.message);
    return "Summary unavailable";
  }
}

async function buildContextCard(item) {
  // Fetch related items
  const related = getContextRelationships(item).slice(0, 3);
  const summaryText = await summariseItem(item);
  return {
    item,
    related,
    summaryText,
  };
}

module.exports = {
  buildContextCard,
};
