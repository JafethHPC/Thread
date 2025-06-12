const { google } = require("googleapis");
const OpenAI = require("openai");

const db = require("../models");
const { User, Conversation, Message } = db;
const { getOAuth2Client } = require("../services/google.service");
const { buildRelationshipMap } = require("../services/relationshipMap.service");
const { buildContextCard } = require("../services/contextCardBuilder.service");

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Advanced context management system for AI chatbots
function createConversationSummary(messages) {
  // Group messages into conversation turns (user + assistant pairs)
  const turns = [];
  for (let i = 0; i < messages.length; i += 2) {
    const userMsg = messages[i];
    const assistantMsg = messages[i + 1];
    if (userMsg && assistantMsg) {
      turns.push({
        user:
          typeof userMsg.content === "string"
            ? userMsg.content
            : userMsg.content?.content || "User sent a request",
        assistant: summarizeAssistantResponse(assistantMsg.content),
      });
    }
  }

  // Create a condensed summary of the conversation
  return turns
    .map(
      (turn, index) =>
        `Turn ${index + 1}: User asked "${turn.user}" - Assistant ${
          turn.assistant
        }`
    )
    .join("\n");
}

function summarizeAssistantResponse(content) {
  if (typeof content === "string") {
    return content.length > 100 ? content.substring(0, 100) + "..." : content;
  }

  if (content?.type === "emails" && Array.isArray(content.content)) {
    const count = content.content.length;
    const fromSenders = [
      ...new Set(content.content.map((e) => e.from).filter(Boolean)),
    ];
    return `found ${count} emails from ${fromSenders.slice(0, 3).join(", ")}${
      fromSenders.length > 3 ? " and others" : ""
    }`;
  }

  if (content?.type === "calendar_events" && Array.isArray(content.content)) {
    const count = content.content.length;
    return `found ${count} calendar events`;
  }

  if (content?.type === "tasks" && Array.isArray(content.content)) {
    const count = content.content.length;
    return `found ${count} tasks`;
  }

  return "provided relevant information";
}

function intelligentHistoryManagement(history) {
  if (!history || history.length === 0) return [];

  const MAX_RECENT_MESSAGES = 4; // Keep last 2 user-assistant pairs in full
  const MAX_SUMMARY_LENGTH = 500; // Max characters for conversation summary

  // If conversation is short, use minimal pruning
  if (history.length <= MAX_RECENT_MESSAGES) {
    return history.map((msg) => ({
      ...msg,
      content: pruneMessageContent(msg.content, 300), // 300 chars max per message
    }));
  }

  // For longer conversations: Summary + Recent messages
  const recentMessages = history.slice(-MAX_RECENT_MESSAGES);
  const olderMessages = history.slice(0, -MAX_RECENT_MESSAGES);

  // Create summary of older conversation
  const summary = createConversationSummary(olderMessages);
  const truncatedSummary =
    summary.length > MAX_SUMMARY_LENGTH
      ? summary.substring(0, MAX_SUMMARY_LENGTH) + "..."
      : summary;

  // Return summary + recent messages
  const result = [];

  if (truncatedSummary) {
    result.push({
      role: "system",
      content: `Previous conversation summary:\n${truncatedSummary}`,
    });
  }

  // Add recent messages with content pruning
  recentMessages.forEach((msg) => {
    result.push({
      ...msg,
      content: pruneMessageContent(msg.content, 400), // Slightly more space for recent messages
    });
  });

  return result;
}

function pruneMessageContent(content, maxLength = 200) {
  if (typeof content === "string") {
    return content.length > maxLength
      ? content.substring(0, maxLength) + "..."
      : content;
  }

  if (typeof content === "object" && content !== null) {
    // Handle different content types
    if (content.type === "text" && content.content) {
      const text = content.content;
      return text.length > maxLength
        ? text.substring(0, maxLength) + "..."
        : text;
    }

    if (content.type === "emails" && Array.isArray(content.content)) {
      const count = content.content.length;
      const senders = [
        ...new Set(content.content.map((e) => e.from).filter(Boolean)),
      ];
      return `Found ${count} emails from: ${senders.slice(0, 2).join(", ")}${
        senders.length > 2 ? " and others" : ""
      }`;
    }

    if (content.type === "calendar_events" && Array.isArray(content.content)) {
      const count = content.content.length;
      const titles = content.content.map((e) => e.summary).filter(Boolean);
      return `Found ${count} calendar events: ${titles.slice(0, 2).join(", ")}${
        titles.length > 2 ? " and others" : ""
      }`;
    }

    if (content.type === "tasks" && Array.isArray(content.content)) {
      const count = content.content.length;
      return `Found ${count} tasks`;
    }

    // For other object types, provide minimal representation
    return `Provided ${content.type || "structured"} data`;
  }

  return String(content).substring(0, maxLength);
}

// Replace the old pruneAndSummarizeHistory function
function pruneAndSummarizeHistory(history) {
  return intelligentHistoryManagement(history);
}

function getEmailBody(payload) {
  let bodyData = "";
  let mimeType = "";

  const findPart = (parts, desiredMimeType) => {
    for (const part of parts) {
      if (part.mimeType === desiredMimeType) {
        return part.body.data;
      }
      if (part.parts) {
        const found = findPart(part.parts, desiredMimeType);
        if (found) return found;
      }
    }
    return null;
  };

  if (payload.parts) {
    bodyData = findPart(payload.parts, "text/html");
    mimeType = "text/html";
    if (!bodyData) {
      bodyData = findPart(payload.parts, "text/plain");
      mimeType = "text/plain";
    }
  } else {
    bodyData = payload.body.data;
    mimeType = payload.mimeType;
  }

  if (bodyData) {
    let body = Buffer.from(bodyData, "base64").toString("utf8");

    if (mimeType === "text/plain") {
      // For plain text, we do our best to structure it.
      body = body
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");

      // Wrap quoted replies in a blockquote for styling.
      const replySeparator =
        /(On .* wrote:|-----+\s*Original Message\s*-----*)/i;
      const match = body.match(replySeparator);

      if (match) {
        const separatorIndex = match.index;
        const mainContent = body.substring(0, separatorIndex);
        const replyContent = body.substring(separatorIndex);

        return (
          mainContent.replace(/\r\n|\n/g, "<br>") +
          "<blockquote>" +
          replyContent.replace(/\r\n|\n/g, "<br>") +
          "</blockquote>"
        );
      }
      return body.replace(/\r\n|\n/g, "<br>");
    }

    return body;
  }

  return "";
}

// Enhanced email content extraction function for comprehensive analysis
function extractFullEmailContent(payload) {
  let allContent = [];

  // Recursive function to extract all text content from MIME parts
  const extractFromParts = (parts) => {
    if (!parts) return;

    for (const part of parts) {
      // Extract text content from this part
      if (part.body && part.body.data) {
        if (part.mimeType === "text/plain" || part.mimeType === "text/html") {
          try {
            const decoded = Buffer.from(part.body.data, "base64").toString(
              "utf8"
            );
            allContent.push({
              mimeType: part.mimeType,
              content: decoded,
            });
          } catch (error) {
            console.log("Error decoding email part:", error.message);
          }
        }
      }

      // Recursively process nested parts
      if (part.parts) {
        extractFromParts(part.parts);
      }
    }
  };

  // Handle single part messages
  if (payload.body && payload.body.data && !payload.parts) {
    try {
      const decoded = Buffer.from(payload.body.data, "base64").toString("utf8");
      allContent.push({
        mimeType: payload.mimeType,
        content: decoded,
      });
    } catch (error) {
      console.log("Error decoding single part email:", error.message);
    }
  }

  // Handle multipart messages
  if (payload.parts) {
    extractFromParts(payload.parts);
  }

  // Combine all content, prioritizing HTML over plain text
  let combinedContent = "";
  let htmlContent = "";
  let plainContent = "";

  for (const part of allContent) {
    if (part.mimeType === "text/html") {
      htmlContent += part.content + "\n\n";
    } else if (part.mimeType === "text/plain") {
      plainContent += part.content + "\n\n";
    }
  }

  // Use HTML content if available, otherwise plain text
  if (htmlContent) {
    // Strip HTML tags for analysis while preserving content
    combinedContent = htmlContent
      .replace(/<[^>]*>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  } else if (plainContent) {
    combinedContent = plainContent.trim();
  }

  return {
    fullContent: combinedContent,
    htmlContent: htmlContent,
    plainContent: plainContent,
    allParts: allContent,
  };
}

exports.chat = async (req, res) => {
  const { message, timezone, history, conversationId } = req.body;
  const userId = req.session.userId;

  if (!userId) {
    return res.status(401).send({ message: "User not authenticated." });
  }

  try {
    const user = await User.findByPk(userId);
    if (!user) {
      return res.status(404).send({ message: "User not found." });
    }

    const oauth2Client = await getOAuth2Client(userId);

    // Find or create conversation
    let conversation;
    if (conversationId) {
      conversation = await Conversation.findOne({
        where: { id: conversationId, userId },
      });
    }

    if (!conversation) {
      // Create conversation with a temporary title first
      conversation = await Conversation.create({
        userId,
        title: "New Conversation", // Temporary title, will be updated after response
      });
    } else {
      // Update the timestamp to keep it fresh
      await conversation.update({ updatedAt: new Date() });
    }

    // Save user message
    await Message.create({
      role: "user",
      content: { type: "text", content: message },
      type: "text",
      conversationId: conversation.id,
    });

    const dtf = new Intl.DateTimeFormat("fr-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    const [{ value: year }, , { value: month }, , { value: day }] =
      dtf.formatToParts(new Date());
    const userLocalDate = `${year}-${month}-${day}`;

    console.log(
      `DEBUG: User timezone: ${timezone}, User local date: ${userLocalDate}`
    );

    // Filter history to only user/assistant roles before pruning to avoid invalid roles
    const cleanedHistory = (history || []).filter(
      (msg) => msg.role === "user" || msg.role === "assistant"
    );

    // Prune the history to avoid exceeding token limits
    const processedHistory = pruneAndSummarizeHistory(cleanedHistory);

    // Step 1: Advanced Intent and Entity Extraction from User Message
    const systemPrompt = `You are a router assistant. Based on the user's request, generate a JSON command for API calls or answer from history.

Context: Today is ${userLocalDate}, timezone: ${timezone}

Output one of:
1. {"intent": "get_emails", "parameters": {"keywords": "search terms", "from": "sender name/email", "date_filter": "today|yesterday|this_week|YYYY-MM-DD"}}
2. {"intent": "get_calendar_events", "parameters": {"q": "search term", "date_filter": "today|tomorrow|next_week|YYYY-MM-DD"}}
3. {"intent": "get_tasks", "parameters": {"status": "all|completed|incomplete", "keywords": "search terms", "due_date": "today|tomorrow|YYYY-MM-DD"}}
4. {"intent": "context_analysis", "parameters": {"entities": ["person/company names"], "query_type": "requests|action_items|follow_ups|deadlines"}}
5. {"intent": "comprehensive_search", "parameters": {"keywords": "search terms", "search_type": "event_info|travel|appointment|general"}}
6. {"intent": "answer_from_history", "parameters": {"answer": "direct answer"}}

CRITICAL PRIORITY RULES - ALWAYS SEARCH FOR SPECIFIC INFORMATION:
- Questions about COSTS, PRICES, AMOUNTS, MONEY → ALWAYS search emails/bookings, NEVER answer from history
- Questions about DATES, TIMES, WHEN → ALWAYS use comprehensive_search or get_calendar_events
- Questions about DETAILS, SPECIFICS → ALWAYS search, don't rely on conversation history
- Questions mentioning PLATFORMS (super.com, airbnb, etc.) → ALWAYS search with platform name
- Questions about BOOKINGS, RESERVATIONS, CONFIRMATIONS → ALWAYS search emails

Cost/Price/Financial Information Examples (ALWAYS SEARCH):
- "how much did the trip cost" → {"intent": "comprehensive_search", "parameters": {"keywords": "trip cost price amount", "search_type": "travel"}}
- "what was the price" → {"intent": "get_emails", "parameters": {"keywords": "price cost amount total"}}
- "how much did I pay" → {"intent": "get_emails", "parameters": {"keywords": "payment paid amount cost"}}
- "cost of the booking" → {"intent": "get_emails", "parameters": {"keywords": "booking cost price amount"}}
- "trip expenses" → {"intent": "get_emails", "parameters": {"keywords": "expenses cost amount"}}
- "hotel charges" → {"intent": "get_emails", "parameters": {"keywords": "hotel charges cost amount"}}

Platform-Specific Cost Queries (ALWAYS INCLUDE PLATFORM):
- "how much did the super.com trip cost" → {"intent": "get_emails", "parameters": {"keywords": "super.com cost price amount", "from": "super"}}
- "airbnb booking cost" → {"intent": "get_emails", "parameters": {"keywords": "airbnb cost price amount", "from": "airbnb"}}
- "expedia flight price" → {"intent": "get_emails", "parameters": {"keywords": "expedia flight price cost", "from": "expedia"}}

Email Search Examples:
- "emails from Stacy" → {"intent": "get_emails", "parameters": {"from": "Stacy"}}
- "emails from moodys" → {"intent": "get_emails", "parameters": {"from": "moodys"}}
- "interview email" → {"intent": "get_emails", "parameters": {"keywords": "interview"}}
- "tesla appointment" → {"intent": "get_emails", "parameters": {"keywords": "tesla appointment"}}
- "emails about my interview with moodys" → {"intent": "get_emails", "parameters": {"keywords": "interview moodys"}}
- "did I get an offer from moodys" → {"intent": "get_emails", "parameters": {"keywords": "offer moodys"}}
- "job offer from tesla" → {"intent": "get_emails", "parameters": {"keywords": "offer tesla"}}
- "hiring decision" → {"intent": "get_emails", "parameters": {"keywords": "hiring decision"}}
- "check the email from super" → {"intent": "get_emails", "parameters": {"from": "super"}}
- "super.com booking confirmation" → {"intent": "get_emails", "parameters": {"keywords": "super.com booking confirmation", "from": "super"}}

Calendar Rules:
- For person names in calendar queries, use "q" parameter, not date_filter
- For "meeting with George": {"intent": "get_calendar_events", "parameters": {"q": "George"}}
- For "tomorrow's events": {"intent": "get_calendar_events", "parameters": {"date_filter": "tomorrow"}}

Task Rules:
- "do I have any tasks" → {"intent": "get_tasks", "parameters": {"status": "all"}}
- "what are my incomplete tasks" → {"intent": "get_tasks", "parameters": {"status": "incomplete"}}
- "completed tasks" → {"intent": "get_tasks", "parameters": {"status": "completed"}}
- "tasks due today" → {"intent": "get_tasks", "parameters": {"due_date": "today"}}

Context Analysis Rules (for follow-up questions that reference previous conversation):
- "has Stacy asked me to do anything else" → {"intent": "context_analysis", "parameters": {"entities": ["Stacy"], "query_type": "requests"}}
- "did they ask for any follow-ups" → {"intent": "context_analysis", "parameters": {"entities": [], "query_type": "follow_ups"}}
- "any action items from Tesla" → {"intent": "context_analysis", "parameters": {"entities": ["Tesla"], "query_type": "action_items"}}
- "what does John need from me" → {"intent": "context_analysis", "parameters": {"entities": ["John"], "query_type": "requests"}}
- "any deadlines from the meeting" → {"intent": "context_analysis", "parameters": {"entities": [], "query_type": "deadlines"}}

Smart Search Rules (for questions about events, trips, appointments, etc.):
- "when is my beach trip" → {"intent": "comprehensive_search", "parameters": {"keywords": "beach trip", "search_type": "travel"}}
- "do you know when my vacation is" → {"intent": "comprehensive_search", "parameters": {"keywords": "vacation", "search_type": "travel"}}
- "when is my dentist appointment" → {"intent": "comprehensive_search", "parameters": {"keywords": "dentist", "search_type": "appointment"}}
- "when is my flight" → {"intent": "comprehensive_search", "parameters": {"keywords": "flight", "search_type": "travel"}}
- "when is my meeting with John" → {"intent": "get_calendar_events", "parameters": {"q": "John"}}
- "do I have any travel plans" → {"intent": "comprehensive_search", "parameters": {"keywords": "travel", "search_type": "travel"}}

Comprehensive Search Rules (searches both calendar and emails):
- "when is my beach trip" → {"intent": "comprehensive_search", "parameters": {"keywords": "beach trip", "search_type": "travel"}}
- "do you know when my vacation is" → {"intent": "comprehensive_search", "parameters": {"keywords": "vacation", "search_type": "travel"}}
- "when is my dentist appointment" → {"intent": "comprehensive_search", "parameters": {"keywords": "dentist", "search_type": "appointment"}}
- "details about my flight" → {"intent": "comprehensive_search", "parameters": {"keywords": "flight", "search_type": "travel"}}
- "when is my conference" → {"intent": "comprehensive_search", "parameters": {"keywords": "conference", "search_type": "event_info"}}
- "information about my hotel booking" → {"intent": "comprehensive_search", "parameters": {"keywords": "hotel booking", "search_type": "travel"}}

Booking Platform Specific Rules (CRITICAL - when user mentions a specific booking platform):
- "i booked a trip using super.com, when is my beach trip" → {"intent": "comprehensive_search", "parameters": {"keywords": "super.com beach trip", "search_type": "travel"}}
- "my airbnb booking, when is it" → {"intent": "comprehensive_search", "parameters": {"keywords": "airbnb booking", "search_type": "travel"}}
- "expedia flight details" → {"intent": "comprehensive_search", "parameters": {"keywords": "expedia flight", "search_type": "travel"}}
- "booking.com hotel reservation" → {"intent": "comprehensive_search", "parameters": {"keywords": "booking.com hotel", "search_type": "travel"}}
- "uber ride details" → {"intent": "comprehensive_search", "parameters": {"keywords": "uber ride", "search_type": "travel"}}
- "when is my trip that i booked on kayak" → {"intent": "comprehensive_search", "parameters": {"keywords": "kayak trip", "search_type": "travel"}}

General Rules:
- NEVER use answer_from_history for questions about costs, prices, amounts, specific dates, or booking details
- ALWAYS search for financial information, dates, times, and specific details
- CRITICAL: When user mentions a booking platform (super.com, airbnb, expedia, booking.com, kayak, uber, etc.), ALWAYS include the platform name in the search keywords
- Use context_analysis when the question references people/companies from recent conversation and asks about requests, action items, follow-ups, or deadlines
- Use comprehensive_search for questions about events, trips, appointments, bookings, or any "when is my..." queries
- Use get_calendar_events for simple calendar queries with specific dates
- Use get_emails for specific sender searches or keyword searches in email content
- Use answer_from_history ONLY if the exact information was explicitly mentioned in recent conversation AND it's not about costs/dates/specifics
- Extract company names, person names, and topics for searches
- If no date specified for emails, search all emails (no date_filter)
- For tasks, default to "all" status if not specified
- When in doubt between searching and answering from history, ALWAYS prefer searching for fresh information
- Prioritize comprehensive_search over single-source searches for better accuracy
- For booking-related queries, combine the platform name with the trip/event type in keywords
- Questions about money, costs, prices, amounts should ALWAYS trigger email searches, never history answers`;

    // Format messages for OpenAI API - ensure content is always a string
    const messagesForAI = [
      { role: "system", content: systemPrompt },
      ...processedHistory.map((msg) => ({
        role: msg.role,
        content:
          typeof msg.content === "string"
            ? msg.content
            : JSON.stringify(msg.content),
      })),
      { role: "user", content: message },
    ];

    const totalTokenEstimate = messagesForAI.reduce((total, msg) => {
      return total + estimateTokens(JSON.stringify(msg));
    }, 0);

    console.log(`Estimated tokens: ${totalTokenEstimate}`);

    // Aggressive token management - use tiered reduction strategy
    if (totalTokenEstimate > 15000) {
      // Emergency mode: Only keep system prompt and current user message
      messagesForAI.splice(1, messagesForAI.length - 2);
      console.log(
        `Emergency token reduction: Removed all history, keeping only current message`
      );
    } else if (totalTokenEstimate > 8000) {
      // Keep only last 2 messages (1 user-assistant pair)
      const reducedHistory = processedHistory.slice(-2);
      const formattedReducedHistory = reducedHistory.map((msg) => ({
        role: msg.role,
        content:
          typeof msg.content === "string"
            ? msg.content
            : pruneMessageContent(msg.content, 150), // Very aggressive pruning
      }));
      messagesForAI.splice(
        1,
        messagesForAI.length - 2,
        ...formattedReducedHistory
      );
      console.log(`High token count: Reduced to last 2 messages only`);
    } else if (totalTokenEstimate > 5000) {
      // Standard reduction: Apply aggressive pruning to existing history
      const aggressivelyPruned = processedHistory.map((msg) => ({
        role: msg.role,
        content:
          typeof msg.content === "string"
            ? msg.content.substring(0, 100) + "..."
            : pruneMessageContent(msg.content, 100),
      }));
      messagesForAI.splice(1, messagesForAI.length - 2, ...aggressivelyPruned);
      console.log(`Medium token count: Applied aggressive pruning`);
    }

    const intentExtractionResponse = await openai.chat.completions.create({
      model: "gpt-4o-mini", // Switch to mini model which has 128k context window
      messages: messagesForAI,
      response_format: { type: "json_object" },
      max_tokens: 150, // Limit response tokens
      temperature: 0.1, // Lower temperature for more consistent responses
    });

    const command = JSON.parse(
      intentExtractionResponse.choices[0].message.content
    );

    // Step 2: Perform the search using the extracted command
    const { intent, parameters } = command;

    // Inject history-based context into parameters if needed
    if (
      (intent === "get_emails" || intent === "comprehensive_search") &&
      parameters.keywords
    ) {
      const historyKeywords = await extractKeywordsFromHistory(
        processedHistory
      );

      // keep only history keywords that also appear in the user's latest message or are in platform list
      const platforms = [
        "super.com",
        "airbnb",
        "expedia",
        "booking.com",
        "kayak",
        "uber",
        "lyft",
      ];

      const lowerMsg = message.toLowerCase();

      // Build frequency map for last 6 history messages
      const recentHistoryText = processedHistory
        .slice(-6)
        .map((m) =>
          typeof m.content === "string" ? m.content : JSON.stringify(m.content)
        )
        .join(" ")
        .toLowerCase();

      const freqCount = (kw) =>
        recentHistoryText.split(kw.toLowerCase()).length - 1; // occurrences

      const filteredHistory = historyKeywords.filter((kw) => {
        const lowerKw = kw.toLowerCase();
        if (lowerMsg.includes(lowerKw)) return true; // explicit in question

        // If user is using pronouns (it, they, that) we keep the most frequent entity keywords.
        const pronounRef = /(it|they|them|that|those|these)\b/.test(lowerMsg);
        if (pronounRef && freqCount(kw) >= 2) return true; // repeated topic

        return false;
      });

      if (filteredHistory.length > 0) {
        const combinedKeywords = `${parameters.keywords} ${filteredHistory.join(
          " "
        )}`;
        parameters.keywords = combinedKeywords;
        console.log(`Enriched keywords with history: "${combinedKeywords}"`);
      }
    }

    console.log("LLM structured command:", command);

    // ENHANCED CRITICAL OVERRIDE: Advanced scenario-based intent correction
    const lowerMessage = message.toLowerCase();

    let structuredResponse = null;

    if (command.intent === "answer_from_history") {
      structuredResponse = {
        type: "text",
        content: command.parameters.answer,
      };
    } else if (command.intent === "context_analysis") {
      // Perform intelligent context-aware analysis
      structuredResponse = await performContextAnalysis(
        command.parameters,
        message,
        processedHistory,
        oauth2Client,
        timezone
      );
    } else if (command.intent === "comprehensive_search") {
      // Perform comprehensive search across calendar and emails
      structuredResponse = await performComprehensiveSearch(
        command.parameters,
        message,
        oauth2Client,
        timezone
      );
    } else if (command.intent === "get_emails") {
      const gmail = google.gmail({ version: "v1", auth: oauth2Client });
      let query = "";

      // Start with a broader search - don't limit to inbox only initially
      const queryParts = [];

      // Handle "from" parameter for sender-specific searches
      if (command.parameters.from) {
        queryParts.push(`from:${command.parameters.from}`);
      }

      // Handle keywords - search in subject, body, and sender
      if (command.parameters.keywords) {
        queryParts.push(`(${command.parameters.keywords})`);
      }

      // If no specific parameters, search recent emails
      if (!command.parameters.from && !command.parameters.keywords) {
        queryParts.push("in:inbox");
      }

      // Add date filter if specified
      if (command.parameters.date_filter) {
        const { start, end } = getDateRange(
          command.parameters.date_filter,
          timezone
        );
        queryParts.push(`after:${Math.floor(start.getTime() / 1000)}`);
        queryParts.push(`before:${Math.floor(end.getTime() / 1000)}`);
      }

      query = queryParts.join(" ");

      console.log("Constructed GMAIL Query:", query);
      console.log("Search parameters:", command.parameters);

      const emailResponse = await gmail.users.messages.list({
        userId: "me",
        maxResults: 20, // Increased to find more emails
        q: query,
      });

      console.log("Gmail API response:", emailResponse.data);

      if (
        !emailResponse.data.messages ||
        emailResponse.data.messages.length === 0
      ) {
        // Try a fallback search without date restrictions if no results
        if (command.parameters.date_filter) {
          console.log("No results with date filter, trying without date...");
          let fallbackQuery = "";
          const fallbackParts = [];

          if (command.parameters.from) {
            fallbackParts.push(`from:${command.parameters.from}`);
          }
          if (command.parameters.keywords) {
            fallbackParts.push(`(${command.parameters.keywords})`);
          }

          fallbackQuery = fallbackParts.join(" ");

          const fallbackResponse = await gmail.users.messages.list({
            userId: "me",
            maxResults: 20,
            q: fallbackQuery,
          });

          if (
            fallbackResponse.data.messages &&
            fallbackResponse.data.messages.length > 0
          ) {
            emailResponse.data = fallbackResponse.data;
            console.log(
              "Found results with fallback search:",
              fallbackResponse.data
            );
          }
        }

        // If still no results, try even broader searches
        if (
          !emailResponse.data.messages ||
          emailResponse.data.messages.length === 0
        ) {
          console.log("No results found, trying broader search strategies...");

          if (command.parameters.from) {
            // Try searching just the name without "from:" operator
            const broadResponse = await gmail.users.messages.list({
              userId: "me",
              maxResults: 20,
              q: command.parameters.from,
            });

            if (
              broadResponse.data.messages &&
              broadResponse.data.messages.length > 0
            ) {
              emailResponse.data = broadResponse.data;
              console.log(
                "Found results with broad name search:",
                broadResponse.data
              );
            }
          } else if (command.parameters.keywords) {
            // Try just the keywords in a broader search
            const keywordResponse = await gmail.users.messages.list({
              userId: "me",
              maxResults: 20,
              q: command.parameters.keywords,
            });

            if (
              keywordResponse.data.messages &&
              keywordResponse.data.messages.length > 0
            ) {
              emailResponse.data = keywordResponse.data;
              console.log(
                "Found results with keyword search:",
                keywordResponse.data
              );
            }
          }

          // Special handling for job-related queries - try alternative keywords
          if (
            command.parameters.keywords &&
            command.parameters.keywords.toLowerCase().includes("offer")
          ) {
            console.log("Trying job-related fallback searches...");
            const jobKeywords = [
              "position",
              "role",
              "job",
              "employment",
              "hire",
              "congratulations",
            ];

            for (const keyword of jobKeywords) {
              if (
                emailResponse.data.messages &&
                emailResponse.data.messages.length > 0
              )
                break;

              const jobResponse = await gmail.users.messages.list({
                userId: "me",
                maxResults: 20,
                q: `${keyword} ${command.parameters.keywords
                  .replace(/offer/gi, "")
                  .trim()}`,
              });

              if (
                jobResponse.data.messages &&
                jobResponse.data.messages.length > 0
              ) {
                emailResponse.data = jobResponse.data;
                console.log(
                  `Found results with job keyword "${keyword}":`,
                  jobResponse.data
                );
                break;
              }
            }
          }
        }
      }

      if (
        !emailResponse.data.messages ||
        emailResponse.data.messages.length === 0
      ) {
        const searchInfo = [];
        if (parameters.from) searchInfo.push(`from "${parameters.from}"`);
        if (parameters.keywords)
          searchInfo.push(`containing "${parameters.keywords}"`);
        if (parameters.date_filter)
          searchInfo.push(`from ${parameters.date_filter}`);

        const searchDescription =
          searchInfo.length > 0 ? searchInfo.join(", ") : "your criteria";

        structuredResponse = {
          type: "text",
          content: `I couldn't find any emails matching ${searchDescription}. Make sure the sender name or keywords are spelled correctly, or try searching for a broader term.`,
        };
      } else {
        const messages = await Promise.all(
          emailResponse.data.messages.map(async (msg) => {
            const email = await gmail.users.messages.get({
              userId: "me",
              id: msg.id,
              format: "full", // We need more details
            });
            const payload = email.data.payload;
            const headers = payload.headers;
            const fromHeader =
              headers.find((h) => h.name === "From")?.value || "Unknown Sender";
            const subjectHeader =
              headers.find((h) => h.name === "Subject")?.value || "No Subject";
            const dateHeader =
              headers.find((h) => h.name === "Date")?.value || "";
            const fromMatch = fromHeader.match(/(.*)<(.*)>/);

            const fullBody = getEmailBody(payload);

            // Enhanced content extraction for comprehensive analysis
            const extractedContent = extractFullEmailContent(payload);

            // Use enhanced content if available, fallback to original method
            const cleanBody =
              extractedContent.fullContent ||
              fullBody
                .replace(/<[^>]*>/g, " ") // Remove HTML tags
                .replace(/&[^;]+;/g, " ") // Remove HTML entities
                .replace(/\s+/g, " ") // Normalize whitespace
                .trim();

            return {
              id: msg.id,
              from: fromMatch ? fromMatch[1].trim() : fromHeader,
              email: fromMatch ? fromMatch[2].trim() : "",
              subject: subjectHeader,
              date: dateHeader,
              body: email.data.snippet, // Snippet for display
              fullBody: fullBody, // Full HTML body for display
              cleanBody: cleanBody, // Enhanced clean text for AI analysis
              enhancedContent: extractedContent, // Full extracted content for deep analysis
              internalDate: email.data.internalDate,
            };
          })
        );
        // We have emails, let's create a structured response for them
        if (messages.length > 0) {
          // -------- Relevance scoring & pruning --------
          const posPatterns = [
            /booking/i,
            /confirmation/i,
            /payment/i,
            /paid/i,
            /authorized/i,
            /receipt/i,
            /total/i,
            /\$/,
          ];
          const negPatterns = [
            /newsletter/i,
            /sale/i,
            /savings/i,
            /review/i,
            /promo/i,
            /wins/i,
            /no\s*more\s*spreadsheets/i,
          ];

          const scored = messages.map((m) => {
            let score = 0;
            const hay = `${m.subject} ${m.snippet}`;
            posPatterns.forEach((re) => {
              if (re.test(hay)) score += 5;
            });
            negPatterns.forEach((re) => {
              if (re.test(hay)) score -= 3;
            });
            // keyword overlap bonus
            if (parameters.keywords) {
              parameters.keywords.split(/\s+/).forEach((kw) => {
                if (
                  kw.length > 2 &&
                  hay.toLowerCase().includes(kw.toLowerCase())
                )
                  score += 1;
              });
            }
            return { ...m, _score: score };
          });

          const topRelevant = scored
            .filter((e) => e._score > 0)
            .sort((a, b) => b._score - a._score)
            .slice(0, 5)
            .map(({ _score, ...rest }) => rest);

          structuredResponse = {
            type: "emails",
            content:
              topRelevant.length > 0 ? topRelevant : messages.slice(0, 5),
          };
        } else {
          structuredResponse = {
            type: "text",
            content: "No emails found matching your criteria.",
          };
        }
      }
    } else if (command.intent === "get_calendar_events") {
      const calendar = google.calendar({ version: "v3", auth: oauth2Client });
      const { date_filter, q } = command.parameters;

      let timeMin, timeMax;

      if (date_filter) {
        const { start, end } = getDateRange(date_filter, timezone);
        timeMin = start.toISOString();
        timeMax = end.toISOString();
      } else {
        // If no date filter, search from now up to 1 year in the future
        timeMin = new Date().toISOString();
        const oneYearFromNow = new Date();
        oneYearFromNow.setFullYear(oneYearFromNow.getFullYear() + 1);
        timeMax = oneYearFromNow.toISOString();
      }

      const eventResponse = await calendar.events.list({
        calendarId: "primary",
        timeMin: timeMin,
        timeMax: timeMax,
        q: q,
        maxResults: 20, // Increased for better search results
        singleEvents: true,
        orderBy: "startTime",
      });

      if (eventResponse.data.items && eventResponse.data.items.length > 0) {
        // We will create a structured response for calendar events as well
        structuredResponse = {
          type: "calendar_events",
          content: eventResponse.data.items.map((event) => ({
            summary: event.summary,
            start: event.start.dateTime || event.start.date,
            end: event.end.dateTime || event.end.date,
            location: event.location,
          })),
        };
      } else {
        structuredResponse = {
          type: "text",
          content: "No upcoming events found.",
        };
      }
    } else if (command.intent === "get_tasks") {
      const tasks = google.tasks({ version: "v1", auth: oauth2Client });
      const { status, due_date, keywords } = command.parameters;

      // Determine what to show based on status parameter
      let showCompleted = true;
      let showHidden = true;

      if (status === "completed") {
        showCompleted = true;
        showHidden = true; // Show completed tasks (which are hidden by default)
      } else if (status === "incomplete") {
        showCompleted = false;
        showHidden = false; // Only show active tasks
      } else {
        // status === "all" or undefined - show everything
        showCompleted = true;
        showHidden = true;
      }

      // Handle due_date parameter properly
      let dueMin = undefined;
      if (due_date) {
        try {
          if (due_date.match(/^\d{4}-\d{2}-\d{2}$/)) {
            // If it's already a valid date format (YYYY-MM-DD), use it directly
            dueMin = new Date(due_date).toISOString();
          } else {
            // If it's a relative date like "today", "tomorrow", use getDateRange
            const { start } = getDateRange(due_date, timezone);
            dueMin = start.toISOString();
          }
        } catch (error) {
          console.error("Error parsing due_date:", due_date, error);
          // If date parsing fails, ignore the due_date filter
          dueMin = undefined;
        }
      }

      const taskResponse = await tasks.tasks.list({
        tasklist: "@default",
        maxResults: 20,
        showCompleted: showCompleted,
        showHidden: showHidden,
        dueMin: dueMin,
      });

      let filteredTasks = taskResponse.data.items || [];

      // Filter by keywords if provided
      if (keywords && filteredTasks.length > 0) {
        filteredTasks = filteredTasks.filter(
          (task) =>
            task.title?.toLowerCase().includes(keywords.toLowerCase()) ||
            task.notes?.toLowerCase().includes(keywords.toLowerCase())
        );
      }

      // Filter by status if we want only incomplete tasks
      if (status === "incomplete" && filteredTasks.length > 0) {
        filteredTasks = filteredTasks.filter(
          (task) => task.status === "needsAction"
        );
      }

      if (filteredTasks.length > 0) {
        structuredResponse = {
          type: "tasks",
          content: filteredTasks.map((task) => ({
            title: task.title,
            id: task.id,
            status: task.status,
            link: task.selfLink,
            dueDate: task.due,
            notes: task.notes,
          })),
        };
      } else {
        structuredResponse = {
          type: "text",
          content: "You have no tasks matching your criteria.",
        };
      }
    } else {
      structuredResponse = {
        type: "text",
        content:
          "I'm not sure how to help with that. Please ask about emails, calendar events, or tasks.",
      };
    }

    // Generate natural language response for structured data
    if (
      structuredResponse.type !== "text" &&
      structuredResponse.type !== "error"
    ) {
      try {
        const naturalLanguageResponse = await generateNaturalLanguageResponse(
          message,
          structuredResponse,
          timezone
        );

        // Keep the structured data for the frontend but add a natural language description
        structuredResponse.naturalLanguage = naturalLanguageResponse;
      } catch (error) {
        console.error("Error generating natural language response:", error);
        // Fallback - keep original structured response
      }
    }

    // Generate context information for the context panel based on the actual AI response
    let contextData = null;
    try {
      contextData = await generateRelevantContextData(
        message,
        structuredResponse,
        oauth2Client,
        timezone,
        processedHistory
      );
    } catch (error) {
      console.error("Error generating context data:", error);
    }

    // Save assistant message
    await Message.create({
      role: "assistant",
      content: structuredResponse,
      type: structuredResponse.type,
      conversationId: conversation.id,
    });

    // Persist context snapshot so that subsequent GET /conversations retains it
    if (contextData) {
      await Message.create({
        role: "system",
        content: contextData,
        type: "context",
        conversationId: conversation.id,
      });
    }

    // Generate and update conversation title if this is a new conversation (only has 1-2 messages)
    const messageCount = await Message.count({
      where: { conversationId: conversation.id },
    });

    if (messageCount <= 2 && conversation.title === "New Conversation") {
      try {
        const generatedTitle = await generateConversationTitle(
          message,
          structuredResponse.content
        );
        await conversation.update({ title: generatedTitle });
      } catch (error) {
        console.error("Error updating conversation title:", error);
        // Fallback title if generation fails
        const fallbackTitle =
          message.substring(0, 30) + (message.length > 30 ? "..." : "");
        await conversation.update({ title: fallbackTitle });
      }
    }

    // Build relationship map across the datasets we have for this request
    let relationshipMap = null;
    let contextCards = [];
    try {
      const emailsForMap = (contextData && contextData.emails) || [];
      const eventsForMap = (contextData && contextData.events) || [];
      const tasksForMap = (contextData && contextData.tasks) || [];

      relationshipMap = buildRelationshipMap(
        emailsForMap,
        eventsForMap,
        tasksForMap
      );

      // Build context cards for a handful of top items (max 5 to keep latency down)
      const topItems = [
        ...emailsForMap.slice(0, 2),
        ...eventsForMap.slice(0, 2),
        ...tasksForMap.slice(0, 1),
      ];

      for (const itm of topItems) {
        const card = await buildContextCard(itm);
        contextCards.push(card);
      }
    } catch (err) {
      console.error("Error building context relationships / cards", err);
    }

    // Detect actionable suggestions in the assistant natural language response.
    let actionableSuggestions = [];
    if (structuredResponse.naturalLanguage) {
      const regex =
        /(would you like to|shall i|should i|do you want me to) ([^.\n?]+)\?/gi;
      let match;
      while ((match = regex.exec(structuredResponse.naturalLanguage))) {
        actionableSuggestions.push({
          text: match[0],
          suggestionType: match[2].trim(),
        });
      }
    }

    // Attach suggestions so the UI can show confirm buttons
    if (actionableSuggestions.length > 0) {
      structuredResponse.suggestions = actionableSuggestions;
    }

    res.json({
      response: structuredResponse,
      context: contextData,
      contextCards,
      conversationId: conversation.id.toString(),
    });
  } catch (error) {
    console.error("Error processing message:", error);

    // Handle rate limit errors specifically
    if (error.status === 429 || error.code === "rate_limit_exceeded") {
      return res.status(429).json({
        response: {
          type: "error",
          content:
            "I'm currently experiencing high usage. Please try again in a moment.",
        },
      });
    }

    res.status(500).json({
      response: {
        type: "error",
        content: "An error occurred while processing your request.",
      },
    });
  }
};

function getDateRange(filter, timeZone) {
  const now = new Date();

  // FIXED: Use Intl.DateTimeFormat to get proper timezone-aware date parts
  // This avoids the toLocaleString() bug that causes date shifts
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  const parts = formatter.formatToParts(now);
  const year = parseInt(parts.find((p) => p.type === "year").value);
  const month = parseInt(parts.find((p) => p.type === "month").value) - 1; // JS months are 0-indexed
  const day = parseInt(parts.find((p) => p.type === "day").value);

  // Create base date in user's timezone (this represents "today" for the user)
  const userToday = new Date(year, month, day);

  let start, end;

  if (filter.match(/^\d{4}-\d{2}-\d{2}$/)) {
    // Specific date - create dates in user's timezone
    const [filterYear, filterMonth, filterDay] = filter.split("-").map(Number);
    start = new Date(filterYear, filterMonth - 1, filterDay, 0, 0, 0, 0);
    end = new Date(filterYear, filterMonth - 1, filterDay, 23, 59, 59, 999);
  } else {
    // Use the user's today as reference
    start = new Date(userToday);
    end = new Date(userToday);

    switch (filter) {
      case "today":
        start.setHours(0, 0, 0, 0);
        end.setHours(23, 59, 59, 999);
        break;
      case "yesterday":
        start.setDate(userToday.getDate() - 1);
        start.setHours(0, 0, 0, 0);
        end.setDate(userToday.getDate() - 1);
        end.setHours(23, 59, 59, 999);
        break;
      case "tomorrow":
        start.setDate(userToday.getDate() + 1);
        start.setHours(0, 0, 0, 0);
        end.setDate(userToday.getDate() + 1);
        end.setHours(23, 59, 59, 999);
        break;
      case "this_week":
        const firstDayOfWeek = userToday.getDate() - userToday.getDay();
        start.setDate(firstDayOfWeek);
        start.setHours(0, 0, 0, 0);
        end.setDate(firstDayOfWeek + 6);
        end.setHours(23, 59, 59, 999);
        break;
      case "next_week":
        const firstDayOfNextWeek = userToday.getDate() - userToday.getDay() + 7;
        start.setDate(firstDayOfNextWeek);
        start.setHours(0, 0, 0, 0);
        end.setDate(firstDayOfNextWeek + 6);
        end.setHours(23, 59, 59, 999);
        break;
    }
  }

  console.log(
    `Date range for filter "${filter}" in timezone "${timeZone}":`,
    `User today: ${userToday.toDateString()},`,
    `start: ${start.toISOString()}, end: ${end.toISOString()}`
  );

  return { start, end };
}

// Function to generate conversation title
async function generateConversationTitle(userMessage, assistantResponse) {
  try {
    const titlePrompt = `Generate a very short, 3-5 word title for this conversation. The title should capture the main topic or purpose. Be concise and specific.

User: ${userMessage}
Assistant: ${
      typeof assistantResponse === "string"
        ? assistantResponse
        : JSON.stringify(assistantResponse)
    }

Title:`;

    const titleResponse = await openai.chat.completions.create({
      model: "gpt-4o-mini", // Use mini model for simple tasks
      messages: [
        {
          role: "system",
          content:
            "You are a helpful assistant that creates very short, concise titles for conversations. Respond with only the title, no quotes or extra text.",
        },
        {
          role: "user",
          content: titlePrompt,
        },
      ],
      max_tokens: 20,
      temperature: 0.7,
    });

    const title = titleResponse.choices[0].message.content.trim();
    return title.replace(/"/g, ""); // Remove any quotes
  } catch (error) {
    console.error("Error generating title:", error);
    // Fallback to truncated message
    return (
      userMessage.substring(0, 30) + (userMessage.length > 30 ? "..." : "")
    );
  }
}

// Function to generate natural language response from structured data
async function generateNaturalLanguageResponse(
  userMessage,
  structuredResponse,
  timezone
) {
  try {
    // FIXED: Use proper timezone-aware date formatting
    const currentDate = new Date().toLocaleDateString("en-US", {
      timeZone: timezone,
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });

    let dataContext = "";

    if (structuredResponse.type === "calendar_events") {
      if (structuredResponse.content.length === 0) {
        return "I didn't find any calendar events matching your criteria.";
      } else {
        const lowerMessage = userMessage.toLowerCase();
        const isSpecificEventQuestion =
          lowerMessage.match(
            /\b(when|time|date|location|where|details|description|attendees|who|duration|how long)\b/
          ) ||
          lowerMessage.match(
            /(what time|what date|where is|who.*attending|how long|what.*details)/
          );

        if (isSpecificEventQuestion) {
          // Perform deep content analysis for specific event questions
          const eventsForAnalysis = structuredResponse.content.slice(0, 8);
          const eventContent = eventsForAnalysis
            .map((event, index) => {
              const startDate = new Date(event.start);
              const endDate = new Date(event.end);
              const isAllDay = !event.start.includes("T");

              let timeStr = "";
              if (isAllDay) {
                timeStr = `${startDate.toLocaleDateString("en-US", {
                  timeZone: timezone,
                  weekday: "long",
                  month: "long",
                  day: "numeric",
                  year: "numeric",
                })} (All Day)`;
              } else {
                timeStr = `${startDate.toLocaleDateString("en-US", {
                  timeZone: timezone,
                  weekday: "long",
                  month: "long",
                  day: "numeric",
                  year: "numeric",
                })} at ${startDate.toLocaleTimeString("en-US", {
                  timeZone: timezone,
                  hour: "numeric",
                  minute: "2-digit",
                  hour12: true,
                })}`;
                if (endDate.toDateString() !== startDate.toDateString()) {
                  timeStr += ` until ${endDate.toLocaleDateString("en-US", {
                    timeZone: timezone,
                    weekday: "long",
                    month: "long",
                    day: "numeric",
                    year: "numeric",
                  })} at ${endDate.toLocaleTimeString("en-US", {
                    timeZone: timezone,
                    hour: "numeric",
                    minute: "2-digit",
                    hour12: true,
                  })}`;
                } else {
                  timeStr += ` to ${endDate.toLocaleTimeString("en-US", {
                    timeZone: timezone,
                    hour: "numeric",
                    minute: "2-digit",
                    hour12: true,
                  })}`;
                }
              }

              return `Event ${index + 1}:
Title: ${event.summary}
Time: ${timeStr}
Location: ${event.location || "No location specified"}
Description: ${event.description || "No description"}
Attendees: ${
                event.attendees
                  ? event.attendees
                      .map((a) => a.email || a.displayName || a)
                      .join(", ")
                  : "No attendees listed"
              }
Organizer: ${event.organizer || "Not specified"}`;
            })
            .join("\n\n");

          dataContext = `Calendar Event Analysis Request:
Question: "${userMessage}"
Found ${structuredResponse.content.length} events to analyze:

${eventContent}`;
        } else {
          // For general calendar queries, return a simple conversational response
          const count = structuredResponse.content.length;
          if (userMessage.toLowerCase().includes("today")) {
            return `Here are your ${count} event${
              count > 1 ? "s" : ""
            } for today:`;
          } else if (userMessage.toLowerCase().includes("tomorrow")) {
            return `Here are your ${count} event${
              count > 1 ? "s" : ""
            } for tomorrow:`;
          } else {
            return `Here are ${count} calendar event${
              count > 1 ? "s" : ""
            } I found:`;
          }
        }
      }
    } else if (structuredResponse.type === "emails") {
      if (structuredResponse.content.length === 0) {
        return "I didn't find any emails matching your criteria.";
      } else {
        // Check if this is a specific question that needs content analysis
        const lowerMessage = userMessage.toLowerCase();
        const isSpecificQuestion =
          // Financial/Payment patterns
          lowerMessage.match(
            /\b(cost|price|amount|total|fee|charge|payment|bill|expense|paid|spend|spent|refund|receipt|invoice|transaction|purchase|order|balance|statement|credit|debit|deposit|withdrawal|transfer|subscription|renewal|discount|coupon|promo|promotion|deal|sale)\b/
          ) ||
          lowerMessage.match(
            /(how much|what.*cost|what.*price|what.*amount|what.*total|what.*fee|what.*charge|what.*paid|what.*spent)/
          ) ||
          // Decision/Status patterns
          lowerMessage.match(
            /\b(offer|offered|accepted|rejected|hired|fired|approved|denied|confirmed|cancelled|decision|result|outcome|status|update|response|reply|answer)\b/
          ) ||
          // Medical/Health patterns
          lowerMessage.match(
            /\b(medical|doctor|appointment|prescription|medication|test|results|lab|blood|scan|xray|mri|ct|ultrasound|biopsy|surgery|procedure|treatment|therapy|diagnosis|symptoms|condition|illness|disease|injury|accident|emergency)\b/
          ) ||
          // Business/Work patterns
          lowerMessage.match(
            /\b(meeting|interview|salary|bonus|hr|human resources|payroll|benefits|vacation|pto|sick|leave|holiday|overtime|raise|promotion|performance|review|evaluation|feedback|contract|agreement|terms|conditions|policy|warranty|guarantee|insurance|claim|coverage|premium|deductible)\b/
          ) ||
          // Scheduling/Time patterns
          lowerMessage.match(
            /\b(deadline|due date|appointment|meeting|schedule|calendar|event|reminder|notification|when.*due|time|morning|afternoon|evening|night|today|tomorrow|yesterday|urgent|asap|immediately)\b/
          ) ||
          // Shipping/Delivery patterns
          lowerMessage.match(
            /\b(shipped|delivered|tracking|number|code|reference|id|booking|reservation|confirmation|delivery|pickup|store|location|address)\b/
          ) ||
          // Support/Service patterns
          lowerMessage.match(
            /\b(help|support|assistance|service|customer|client|problem|issue|trouble|error|warning|complaint|return|exchange|warranty|guarantee)\b/
          ) ||
          // Information/Details patterns
          lowerMessage.match(
            /\b(information|details|specifics|particulars|facts|data|numbers|report|summary|overview|breakdown|analysis)\b/
          ) ||
          // Question words that indicate need for specific information
          lowerMessage.match(
            /(what|when|where|who|why|how|which|whose|whom).*\b(is|was|are|were|will|would|could|should|can|did|does|do|has|have|had)\b/
          );

        if (isSpecificQuestion) {
          // Perform deep content analysis for specific questions
          const emailsForAnalysis = structuredResponse.content.slice(0, 8); // Limit for token management
          const emailContent = emailsForAnalysis
            .map((email, index) => {
              // Extract more content for better analysis using enhanced extraction
              let fullContent = email.cleanBody || email.body || "";

              // Use enhanced content if available for much better analysis
              if (email.enhancedContent && email.enhancedContent.fullContent) {
                fullContent = email.enhancedContent.fullContent;
                console.log(
                  `DEBUG: Using enhanced content for email ${index + 1}`
                );
              }

              const contentLength = Math.min(fullContent.length, 6000); // Further increased content length
              const content = fullContent.substring(0, contentLength);

              // Debug: Log content for cost-related questions
              if (
                userMessage.toLowerCase().includes("cost") ||
                userMessage.toLowerCase().includes("price") ||
                userMessage.toLowerCase().includes("amount")
              ) {
                console.log(
                  `DEBUG: Email ${index + 1} content length: ${
                    fullContent.length
                  }, truncated to: ${contentLength}`
                );
                console.log(
                  `DEBUG: Email ${
                    index + 1
                  } enhanced content available: ${!!email.enhancedContent}`
                );
                console.log(
                  `DEBUG: Email ${index + 1} content preview:`,
                  content.substring(0, 500)
                );
              }

              return `Email ${index + 1}:
From: ${email.from}
Subject: ${email.subject}
Date: ${email.date}
Full Content: ${content}${contentLength < fullContent.length ? "..." : ""}`;
            })
            .join("\n\n");

          dataContext = `Email Analysis Request:
Question: "${userMessage}"
Found ${structuredResponse.content.length} emails to analyze:

${emailContent}`;
        } else {
          // For general email queries, return a simple conversational response
          const count = structuredResponse.content.length;
          if (userMessage.toLowerCase().includes("today")) {
            return `You received ${count} email${
              count > 1 ? "s" : ""
            } today. Here ${count > 1 ? "they are" : "it is"}:`;
          } else if (userMessage.toLowerCase().includes("yesterday")) {
            return `You got ${count} email${
              count > 1 ? "s" : ""
            } yesterday. Here ${count > 1 ? "they are" : "it is"}:`;
          } else {
            return `I found ${count} email${count > 1 ? "s" : ""} for you:`;
          }
        }
      }
    } else if (structuredResponse.type === "tasks") {
      if (structuredResponse.content.length === 0) {
        return "You don't have any tasks matching your criteria.";
      } else {
        const lowerMessage = userMessage.toLowerCase();
        const isSpecificTaskQuestion =
          lowerMessage.match(
            /\b(deadline|due|when|status|completed|finished|done|priority|urgent|details|notes|description)\b/
          ) ||
          lowerMessage.match(
            /(what.*task|which.*task|how.*task|when.*due|what.*deadline)/
          );

        if (isSpecificTaskQuestion) {
          // Perform deep content analysis for specific task questions
          const tasksForAnalysis = structuredResponse.content.slice(0, 10);
          const taskContent = tasksForAnalysis
            .map((task, index) => {
              return `Task ${index + 1}:
Title: ${task.title}
Status: ${task.status}
Due Date: ${task.due || "No due date"}
Notes: ${task.notes || "No notes"}
Updated: ${task.updated}`;
            })
            .join("\n\n");

          dataContext = `Task Analysis Request:
Question: "${userMessage}"
Found ${structuredResponse.content.length} tasks to analyze:

${taskContent}`;
        } else {
          // For general task queries, return a simple conversational response
          const count = structuredResponse.content.length;
          const incompleteCount = structuredResponse.content.filter(
            (task) => task.status === "needsAction"
          ).length;

          if (userMessage.toLowerCase().includes("today")) {
            return `Here are your ${count} task${
              count > 1 ? "s" : ""
            } for today:`;
          } else if (incompleteCount > 0 && incompleteCount < count) {
            return `Here are your ${count} task${
              count > 1 ? "s" : ""
            } (${incompleteCount} still to do):`;
          } else {
            return `Here are your ${count} task${count > 1 ? "s" : ""}:`;
          }
        }
      }
    } else if (structuredResponse.type === "context_analysis") {
      // Return the analysis directly since it's already a complete answer
      return structuredResponse.content.analysis;
    } else if (structuredResponse.type === "comprehensive_search") {
      // Return the analysis directly since it's already a complete answer
      return structuredResponse.content.analysis;
    }

    const prompt = `You are a helpful personal assistant. Answer this question in a conversational, friendly way using the provided email data:

Question: "${userMessage}"
Date: ${currentDate}

Email Data:
${dataContext}

Instructions:
RESPONSE STYLE:
- Be conversational and friendly, like you're talking to a friend
- Use natural language, not bullet points or formal lists
- Start with a direct answer to their question
- Be concise but informative
- Show that you understand the context of their question

TRIP/BOOKING QUESTIONS:
- For trip costs: "Your [destination] trip cost [amount]. I found this in your [payment source] email..."
- For trip dates: "Your [destination] trip is from [start date] to [end date]. According to your booking confirmation..."
- For booking details: "I see you booked [accommodation] in [location] for [dates]..."

FINANCIAL ANALYSIS:
- CRITICAL: For cost/pricing questions, scan the ENTIRE email content for ALL dollar amounts
- Look for patterns: $XX.XX, $X,XXX.XX, €XX.XX, £XX.XX, ¥XXXX
- Search for context: "total", "cost", "price", "amount", "fee", "charge", "payment", "bill", "invoice", "receipt", "for the stay", "booking cost", "trip cost"
- Payment confirmations: "payment received", "transaction completed", "charged", "billed", "paid", "processed"
- ALWAYS extract the MOST RELEVANT dollar amount based on the question context
- If multiple amounts exist, prioritize the one that directly answers the user's question
- Look for payment methods and reference numbers

JOB/CAREER ANALYSIS:
- For job offers: Look for "pleased to offer", "we would like to extend", "congratulations", "offer letter", "position", "salary", "start date", "compensation", "benefits"
- For interviews: Look for "interview", "meeting", "discussion", "call", "video conference", "in-person", "phone screen"
- For decisions: Look for "hired", "selected", "chosen", "accepted", "rejected", "declined", "not selected"
- For performance: Look for "review", "evaluation", "feedback", "promotion", "raise", "bonus", "performance"

MEDICAL/HEALTH ANALYSIS:
- For appointments: Look for "appointment", "scheduled", "visit", "consultation", "checkup", "follow-up"
- For test results: Look for "results", "lab", "blood work", "scan", "x-ray", "MRI", "CT", "ultrasound", "biopsy"
- For prescriptions: Look for "prescription", "medication", "drug", "dosage", "pharmacy", "refill"
- For procedures: Look for "surgery", "procedure", "treatment", "therapy", "operation"
- For insurance: Look for "insurance", "claim", "coverage", "copay", "deductible", "premium"

BUSINESS/MEETING ANALYSIS:
- For meetings: Look for "meeting", "conference", "call", "discussion", "presentation", "demo"
- For confirmations: Look for "confirmed", "scheduled", "set", "booked", "reserved"
- For cancellations: Look for "cancelled", "postponed", "rescheduled", "moved", "delayed"
- For locations: Look for addresses, room numbers, building names, virtual meeting links

SHIPPING/DELIVERY ANALYSIS:
- For tracking: Look for tracking numbers, "shipped", "delivered", "in transit", "out for delivery"
- For orders: Look for order numbers, "order placed", "confirmed", "processing", "fulfilled"
- For delivery: Look for delivery dates, "delivered", "attempted delivery", "signature required"

TRAVEL/BOOKING ANALYSIS:
- For reservations: Look for "booking", "reservation", "confirmed", "itinerary", "confirmation number"
- For flights: Look for flight numbers, departure/arrival times, airports, gates, seats
- For hotels: Look for check-in/check-out dates, room numbers, hotel names, addresses
- For rentals: Look for pickup/return dates, locations, vehicle details

SUPPORT/SERVICE ANALYSIS:
- For issues: Look for "problem", "issue", "error", "trouble", "not working", "broken"
- For resolutions: Look for "resolved", "fixed", "solved", "completed", "closed"
- For warranties: Look for "warranty", "guarantee", "coverage", "expires", "valid until"

TIME/SCHEDULING ANALYSIS:
- For deadlines: Look for "due", "deadline", "by", "before", "expires", "ends"
- For dates: Extract specific dates, times, time zones
- For urgency: Look for "urgent", "ASAP", "immediately", "priority", "rush"

CALENDAR EVENT ANALYSIS:
- For event times: Look for start/end times, dates, time zones, duration
- For locations: Look for addresses, room numbers, building names, virtual meeting links
- For attendees: Look for participant names, email addresses, organizers
- For event details: Look for descriptions, agendas, meeting purposes
- For recurring events: Look for frequency, patterns, exceptions

TASK ANALYSIS:
- For task status: Look for "completed", "in progress", "pending", "overdue", "needsAction"
- For deadlines: Look for due dates, time remaining, urgency indicators
- For task details: Look for descriptions, notes, subtasks, dependencies
- For assignments: Look for who assigned the task, who is responsible
- For priorities: Look for priority levels, importance indicators

EXTRACT AND PROVIDE:
- For financial questions: First list ALL dollar amounts found in the email, then identify the most relevant one for the user's question
- Exact dollar amounts and currency values with their context (e.g., "$27.27 for the stay")
- Specific dates and times
- Reference numbers, IDs, codes
- Names of people, companies, locations
- Event details, locations, attendee information
- Task statuses, deadlines, priorities
- Direct quotes from emails/events/tasks that answer the question

RESPONSE FORMAT FOR COST QUESTIONS:
When answering cost/price questions, provide the exact amount found and quote the relevant section of the email where it was found.`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o", // Use full model for better analysis
      messages: [
        {
          role: "system",
          content:
            "You are a helpful personal assistant who is great at understanding emails and answering questions about them in a conversational way. You're like a friend who helps organize information. You excel at finding costs, dates, booking details, and other important information from emails. When someone asks about trip costs or booking details, you understand the context and provide friendly, direct answers. You always read email content carefully and extract exact information, especially dollar amounts and dates. You never make up information and always base your answers on what's actually in the emails.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      max_tokens: 400, // Increased for detailed analysis
      temperature: 0.1, // Very low temperature for factual analysis
    });

    return response.choices[0].message.content.trim();
  } catch (error) {
    console.error("Error generating natural language response:", error);
    return "I found some information but had trouble formatting the response.";
  }
}

// Function to generate context data based on the actual AI response
async function generateRelevantContextData(
  userMessage,
  aiResponse,
  oauth2Client,
  timezone,
  conversationHistory = []
) {
  try {
    console.log(`Generating relevant context for: "${userMessage}"`);
    console.log(`AI response type: ${aiResponse.type}`);

    const baseKeywords = await extractContextKeywords(userMessage);

    let contextData = {
      query: userMessage,
      keywords: baseKeywords,
      emails: [],
      events: [],
      tasks: [],
      people: [],
      timestamp: new Date().toISOString(),
    };

    // Determine the source of truth for context
    const hasStructuredContent =
      (aiResponse.content &&
        Array.isArray(aiResponse.content) &&
        aiResponse.content.length > 0) ||
      aiResponse.content?.emails?.length > 0 ||
      aiResponse.content?.calendarEvents?.length > 0;

    if (hasStructuredContent) {
      // If the AI response already contains the source data, use it directly.
      console.log("Using direct structured content for context.");
      contextData.emails =
        aiResponse.content.emails ||
        (aiResponse.type === "emails" ? aiResponse.content : []);
      contextData.events =
        aiResponse.content.calendarEvents ||
        (aiResponse.type === "calendar_events" ? aiResponse.content : []);
      contextData.tasks =
        aiResponse.content.tasks ||
        (aiResponse.type === "tasks" ? aiResponse.content : []);

      const keywords = await extractKeywordsFromHistory(conversationHistory);
      contextData.keywords = keywords;

      contextData.people = extractPeopleFromContext(
        contextData.emails,
        contextData.events,
        keywords
      );
    } else {
      // If we only have a text response, we must re-fetch context.
      console.log("Re-fetching context based on natural language response.");

      // Extract keywords from both the user message and conversation history
      const userKeywords = await extractContextKeywords(userMessage);
      const historyKeywords = await extractKeywordsFromHistory(
        conversationHistory
      );

      // Combine and deduplicate keywords
      const allKeywords = [...new Set([...userKeywords, ...historyKeywords])];
      contextData.keywords = allKeywords;

      console.log(`Combined keywords: ${allKeywords.join(", ")}`);

      if (allKeywords.length > 0) {
        // Search with combined keywords for better context
        const [emails, events, tasks] = await Promise.all([
          searchAndScoreEmails(allKeywords, oauth2Client),
          searchRelatedEvents(allKeywords, oauth2Client, timezone),
          searchRelatedTasks(allKeywords, oauth2Client, timezone),
        ]);

        contextData.emails = emails.slice(0, 5);
        contextData.events = events.slice(0, 3);
        contextData.tasks = tasks.slice(0, 3);

        contextData.people = extractPeopleFromContext(
          contextData.emails,
          contextData.events,
          allKeywords
        );
      }
    }

    // Final filtering to ensure relevance
    if (contextData.keywords.length > 0) {
      const filteredEmails = contextData.emails.filter((email) =>
        contextData.keywords.some(
          (k) =>
            (email.subject || "").toLowerCase().includes(k.toLowerCase()) ||
            (email.snippet || "").toLowerCase().includes(k.toLowerCase()) ||
            (email.from || "").toLowerCase().includes(k.toLowerCase())
        )
      );

      // If filtering would drop everything, keep original list
      if (filteredEmails.length > 0) {
        contextData.emails = filteredEmails;
      }
    }

    // Always cap emails for UI/card sanity
    contextData.emails = contextData.emails.slice(0, 5);

    // Recompute people list based on FINAL filtered sets
    contextData.people = extractPeopleFromContext(
      contextData.emails,
      contextData.events,
      contextData.keywords
    );

    const hasContent =
      contextData.emails.length > 0 ||
      contextData.events.length > 0 ||
      contextData.tasks.length > 0;

    console.log(
      `Generated context: ${contextData.emails.length} emails, ${contextData.events.length} events, ${contextData.tasks.length} tasks, ${contextData.people.length} people (hasContent=${hasContent})`
    );

    return hasContent ? contextData : null;
  } catch (error) {
    console.error("Error generating relevant context data:", error);
    return null;
  }
}

// Legacy function - keep for backward compatibility but not used
async function generateContextData(userMessage, oauth2Client, timezone) {
  try {
    console.log(`Generating context for: "${userMessage}"`);

    // Extract key terms from the user message for context search
    const contextKeywords = await extractContextKeywords(userMessage);
    console.log(`Context keywords: ${contextKeywords.join(", ")}`);

    // Search for related information across all data types
    const [relatedEmails, relatedEvents, relatedTasks] = await Promise.all([
      searchRelatedEmails(contextKeywords, oauth2Client, timezone),
      searchRelatedEvents(contextKeywords, oauth2Client, timezone),
      searchRelatedTasks(contextKeywords, oauth2Client, timezone),
    ]);

    // Extract people mentioned in the context
    const contextPeople = extractPeopleFromContext(
      relatedEmails,
      relatedEvents,
      contextKeywords
    );

    return {
      query: userMessage,
      keywords: contextKeywords,
      emails: relatedEmails,
      events: relatedEvents,
      tasks: relatedTasks,
      people: contextPeople,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    console.error("Error generating context data:", error);
    return null;
  }
}

// Extract context keywords from user message
async function extractContextKeywords(userMessage) {
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini", // Use mini model with higher context window
      messages: [
        {
          role: "system",
          content: `Extract 2-4 key search terms from the user's question. Focus on:
- Company/platform names (e.g., "Super.com", "PayPal", "Tesla")
- Person names (e.g., "Stacy", "George")
- Specific topics (e.g., "trip", "interview", "booking")
- Avoid generic words like "cost", "when", "how much"

Examples:
- "How much did the super.com trip cost?" → ["super.com", "trip"]
- "When is my meeting with George?" → ["George", "meeting"]
- "Tesla interview details" → ["Tesla", "interview"]

Return as JSON object with "keywords" array.`,
        },
        {
          role: "user",
          content: `Extract key search terms from: "${userMessage}"`,
        },
      ],
      response_format: { type: "json_object" },
      max_tokens: 100,
      temperature: 0.1,
    });

    const result = JSON.parse(response.choices[0].message.content);
    return result.keywords || [];
  } catch (error) {
    console.error("Error extracting keywords:", error);
    // Fallback: simple keyword extraction
    return userMessage
      .toLowerCase()
      .split(" ")
      .filter(
        (word) =>
          word.length > 3 &&
          ![
            "what",
            "when",
            "where",
            "how",
            "with",
            "about",
            "from",
            "have",
            "been",
            "much",
            "cost",
            "price",
          ].includes(word)
      )
      .slice(0, 4);
  }
}

// Search for related emails
async function searchRelatedEmails(keywords, oauth2Client, timezone) {
  try {
    const gmail = google.gmail({ version: "v1", auth: oauth2Client });
    const query = `in:inbox (${keywords.join(" OR ")})`;

    const emailResponse = await gmail.users.messages.list({
      userId: "me",
      maxResults: 5,
      q: query,
    });

    if (!emailResponse.data.messages) return [];

    const emails = await Promise.all(
      emailResponse.data.messages.slice(0, 3).map(async (msg) => {
        const email = await gmail.users.messages.get({
          userId: "me",
          id: msg.id,
          format: "full",
        });
        const payload = email.data.payload;
        const headers = payload.headers;
        const fromHeader =
          headers.find((h) => h.name === "From")?.value || "Unknown";
        const subjectHeader =
          headers.find((h) => h.name === "Subject")?.value || "No Subject";
        const dateHeader = headers.find((h) => h.name === "Date")?.value || "";
        const fromMatch = fromHeader.match(/(.*)<(.*)>/);

        return {
          id: msg.id,
          from: fromMatch ? fromMatch[1].trim() : fromHeader,
          email: fromMatch ? fromMatch[2].trim() : "",
          subject: subjectHeader,
          date: dateHeader,
          snippet: email.data.snippet,
        };
      })
    );

    return emails;
  } catch (error) {
    console.error("Error searching related emails:", error);
    return [];
  }
}

async function searchAndScoreEmails(keywords, oauth2Client) {
  if (!keywords || keywords.length === 0) return [];
  console.log(
    `Searching and scoring emails for keywords: ${keywords.join(", ")}`
  );

  const gmail = google.gmail({ version: "v1", auth: oauth2Client });
  const query = `in:inbox (${keywords.join(" OR ")})`;

  try {
    const emailResponse = await gmail.users.messages.list({
      userId: "me",
      maxResults: 25, // Get a larger pool of candidates to score
      q: query,
    });

    if (!emailResponse.data.messages) return [];

    const emailsWithDetails = await Promise.all(
      emailResponse.data.messages.map(async (msg) => {
        try {
          const email = await gmail.users.messages.get({
            userId: "me",
            id: msg.id,
            format: "full",
          });
          const payload = email.data.payload;
          const headers = payload.headers;
          const fromHeader =
            headers.find((h) => h.name === "From")?.value || "";
          const subjectHeader =
            headers.find((h) => h.name === "Subject")?.value || "";

          // Score the email based on keyword relevance
          let score = 0;
          const fromLower = fromHeader.toLowerCase();
          const subjectLower = subjectHeader.toLowerCase();

          keywords.forEach((keyword) => {
            const kwLower = keyword.toLowerCase();
            if (subjectLower.includes(kwLower)) score += 5; // High score for subject match
            if (fromLower.includes(kwLower)) score += 5; // High score for sender match
            if ((email.data.snippet || "").toLowerCase().includes(kwLower))
              score += 1; // Lower score for snippet match
          });

          // Boost score for platform keywords
          const platforms = [
            "super.com",
            "paypal",
            "airbnb",
            "expedia",
            "delta",
          ];
          if (
            platforms.some(
              (p) => fromLower.includes(p) || subjectLower.includes(p)
            )
          ) {
            score += 5;
          }

          return {
            id: msg.id,
            from: fromHeader.match(/(.*)<.*>/)?.[1].trim() || fromHeader,
            email: fromHeader.match(/<(.*)>/)?.[1] || "",
            subject: subjectHeader,
            date: headers.find((h) => h.name === "Date")?.value || "",
            snippet: email.data.snippet || "",
            score: score,
          };
        } catch (err) {
          return null;
        }
      })
    );

    // Filter out nulls and emails with a score of 0, then sort by score
    return emailsWithDetails
      .filter((email) => email && email.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5); // Return the top 5 most relevant emails
  } catch (error) {
    console.error("Error in searchAndScoreEmails:", error);
    return [];
  }
}

// Search for related calendar events
async function searchRelatedEvents(keywords, oauth2Client, timezone) {
  try {
    const calendar = google.calendar({ version: "v3", auth: oauth2Client });

    // Search for events containing any of the keywords
    const results = await Promise.all(
      keywords.map(async (keyword) => {
        const eventResponse = await calendar.events.list({
          calendarId: "primary",
          timeMin: new Date(
            Date.now() - 30 * 24 * 60 * 60 * 1000
          ).toISOString(), // Last 30 days
          timeMax: new Date(
            Date.now() + 365 * 24 * 60 * 60 * 1000
          ).toISOString(), // Next year
          q: keyword,
          maxResults: 3,
          singleEvents: true,
          orderBy: "startTime",
        });

        return eventResponse.data.items || [];
      })
    );

    // Flatten and deduplicate events
    const allEvents = results.flat();
    const uniqueEvents = allEvents
      .filter(
        (event, index, self) =>
          index === self.findIndex((e) => e.id === event.id)
      )
      .slice(0, 5);

    return uniqueEvents.map((event) => ({
      id: event.id,
      summary: event.summary,
      start: event.start.dateTime || event.start.date,
      end: event.end.dateTime || event.end.date,
      location: event.location,
      attendees: event.attendees?.map((a) => a.email) || [],
    }));
  } catch (error) {
    console.error("Error searching related events:", error);
    return [];
  }
}

// Search for related tasks
async function searchRelatedTasks(keywords, oauth2Client, timezone) {
  try {
    const tasks = google.tasks({ version: "v1", auth: oauth2Client });

    const taskResponse = await tasks.tasks.list({
      tasklist: "@default",
      maxResults: 20,
    });

    if (!taskResponse.data.items) return [];

    // Filter tasks that contain any of the keywords
    const relatedTasks = taskResponse.data.items
      .filter((task) =>
        keywords.some(
          (keyword) =>
            task.title?.toLowerCase().includes(keyword.toLowerCase()) ||
            task.notes?.toLowerCase().includes(keyword.toLowerCase())
        )
      )
      .slice(0, 5);

    return relatedTasks.map((task) => ({
      id: task.id,
      title: task.title,
      status: task.status,
      due: task.due,
      notes: task.notes,
    }));
  } catch (error) {
    console.error("Error searching related tasks:", error);
    return [];
  }
}

// Extract people from context
function extractPeopleFromContext(emails, events, keywords) {
  const people = new Set();

  // From emails
  emails.forEach((email) => {
    if (email.from && email.from !== "Unknown") {
      people.add(email.from);
    }
  });

  // From events
  events.forEach((event) => {
    if (event.attendees) {
      event.attendees.forEach((attendee) => {
        if (attendee && !attendee.includes("@")) {
          people.add(attendee);
        }
      });
    }
  });

  // From keywords (names are usually capitalized)
  keywords.forEach((keyword) => {
    if (keyword[0] === keyword[0].toUpperCase() && keyword.length > 2) {
      people.add(keyword);
    }
  });

  return Array.from(people)
    .slice(0, 5)
    .map((name) => ({
      name: name,
      avatarUrl: `https://ui-avatars.com/api/?name=${encodeURIComponent(
        name
      )}&background=random`,
    }));
}

// Add token estimation function
function estimateTokens(text) {
  // Rough estimation: 1 token ≈ 4 characters for English text
  return Math.ceil(text.length / 4);
}

async function performComprehensiveSearch(
  parameters,
  userMessage,
  oauth2Client,
  timezone
) {
  try {
    console.log("Performing comprehensive search:", parameters);

    const keywords = parameters.keywords;
    const searchType = parameters.search_type || "general";

    // Search calendar events
    const calendar = google.calendar({ version: "v3", auth: oauth2Client });
    let calendarEvents = [];

    try {
      const calendarResponse = await calendar.events.list({
        calendarId: "primary",
        timeMin: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString(), // 1 year ago
        timeMax: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(), // 1 year ahead
        maxResults: 50,
        singleEvents: true,
        orderBy: "startTime",
        q: keywords,
      });

      if (calendarResponse.data.items) {
        calendarEvents = calendarResponse.data.items.map((event) => ({
          id: event.id,
          summary: event.summary || "No Title",
          start: event.start?.dateTime || event.start?.date,
          end: event.end?.dateTime || event.end?.date,
          location: event.location || "",
          description: event.description || "",
          source: "calendar",
        }));
      }
    } catch (error) {
      console.log("Error searching calendar:", error.message);
    }

    // Search emails with enhanced platform-specific logic
    const gmail = google.gmail({ version: "v1", auth: oauth2Client });
    let emails = [];

    try {
      // Check if this is a platform-specific search
      const platforms = [
        "super.com",
        "airbnb",
        "expedia",
        "booking.com",
        "kayak",
        "uber",
        "lyft",
        "hotels.com",
        "priceline",
        "orbitz",
      ];
      const mentionedPlatform = platforms.find(
        (platform) =>
          userMessage.toLowerCase().includes(platform) ||
          keywords.toLowerCase().includes(platform)
      );

      let searchQuery = keywords;

      // If a platform is mentioned, prioritize emails from that platform
      if (mentionedPlatform) {
        // Try multiple search strategies for better results
        const platformSearches = [
          `from:${mentionedPlatform}`,
          `${mentionedPlatform}`,
          keywords,
        ];

        console.log(`Platform-specific search detected: ${mentionedPlatform}`);
        console.log(`Trying multiple search strategies:`, platformSearches);

        // Try platform-specific search first
        searchQuery = `from:${mentionedPlatform}`;
      }

      console.log(`Final search query: ${searchQuery}`);

      const emailResponse = await gmail.users.messages.list({
        userId: "me",
        maxResults: 25, // Increased for platform searches
        q: searchQuery,
      });

      console.log(
        `Email search results: ${
          emailResponse.data.messages?.length || 0
        } messages found`
      );

      // If no results with platform-specific search, try broader search
      if (
        mentionedPlatform &&
        (!emailResponse.data.messages ||
          emailResponse.data.messages.length === 0)
      ) {
        console.log(
          `No results with platform search, trying broader search: ${mentionedPlatform}`
        );
        const broaderResponse = await gmail.users.messages.list({
          userId: "me",
          maxResults: 25,
          q: mentionedPlatform, // Just search for the platform name anywhere
        });

        console.log(
          `Broader search results: ${
            broaderResponse.data.messages?.length || 0
          } messages found`
        );

        if (
          broaderResponse.data.messages &&
          broaderResponse.data.messages.length > 0
        ) {
          emailResponse.data.messages = broaderResponse.data.messages;
        } else {
          // Final fallback: search for just the trip/event type
          console.log(
            `No results with platform name, trying final fallback with keywords: ${keywords}`
          );
          const finalFallbackResponse = await gmail.users.messages.list({
            userId: "me",
            maxResults: 25,
            q: keywords, // Just search for the original keywords
          });

          console.log(
            `Final fallback results: ${
              finalFallbackResponse.data.messages?.length || 0
            } messages found`
          );

          if (
            finalFallbackResponse.data.messages &&
            finalFallbackResponse.data.messages.length > 0
          ) {
            emailResponse.data.messages = finalFallbackResponse.data.messages;
          }
        }
      }

      if (emailResponse.data.messages) {
        const emailDetails = await Promise.all(
          emailResponse.data.messages.slice(0, 10).map(async (msg) => {
            const email = await gmail.users.messages.get({
              userId: "me",
              id: msg.id,
              format: "full",
            });

            const payload = email.data.payload;
            const headers = payload.headers;
            const fromHeader =
              headers.find((h) => h.name === "From")?.value || "Unknown";
            const subjectHeader =
              headers.find((h) => h.name === "Subject")?.value || "No Subject";
            const dateHeader =
              headers.find((h) => h.name === "Date")?.value || "";

            const fullBody = getEmailBody(payload);

            // Enhanced content extraction for comprehensive analysis
            const extractedContent = extractFullEmailContent(payload);

            // Use enhanced content if available, fallback to original method
            const cleanBody =
              extractedContent.fullContent ||
              fullBody
                .replace(/<[^>]*>/g, " ")
                .replace(/&[^;]+;/g, " ")
                .replace(/\s+/g, " ")
                .trim();

            return {
              id: msg.id,
              from: fromHeader,
              subject: subjectHeader,
              date: dateHeader,
              body: email.data.snippet,
              cleanBody: cleanBody,
              enhancedContent: extractedContent,
              internalDate: email.data.internalDate,
              source: "email",
            };
          })
        );
        emails = emailDetails;

        // Debug: Log found emails for platform searches
        if (mentionedPlatform) {
          console.log(`Found ${emails.length} emails for platform search:`);
          emails.forEach((email, index) => {
            console.log(
              `  ${index + 1}. From: ${email.from}, Subject: ${email.subject}`
            );

            // Debug: Log content extraction details
            let emailContent = email.cleanBody || "";
            if (email.enhancedContent && email.enhancedContent.fullContent) {
              emailContent = email.enhancedContent.fullContent;
              console.log(
                `  Enhanced content available for email ${index + 1}: ${
                  emailContent.length
                } characters`
              );
            } else {
              console.log(
                `  Using cleanBody for email ${index + 1}: ${
                  emailContent.length
                } characters`
              );
            }

            // Log first 500 characters to see what content is being extracted
            console.log(
              `  Content preview: ${emailContent.substring(0, 500)}...`
            );
          });
        }
      }
    } catch (error) {
      console.log("Error searching emails:", error.message);
    }

    // Analyze the combined results
    const analysisPrompt = `Analyze the following calendar events and emails to answer this question: "${userMessage}"

Search Keywords: ${keywords}
Search Type: ${searchType}

CALENDAR EVENTS FOUND:
${calendarEvents
  .map(
    (event, index) => `
Event ${index + 1}:
Title: ${event.summary}
Date/Time: ${event.start} to ${event.end}
Location: ${event.location}
Description: ${event.description}
`
  )
  .join("\n")}

EMAILS FOUND:
${emails
  .map((email, index) => {
    // Use enhanced content if available, otherwise use cleanBody
    let emailContent = email.cleanBody || "";
    if (email.enhancedContent && email.enhancedContent.fullContent) {
      emailContent = email.enhancedContent.fullContent;
    }

    // Increase content length significantly for better analysis
    const contentLength = Math.min(emailContent.length, 4000);
    const content = emailContent.substring(0, contentLength);

    return `
Email ${index + 1}:
From: ${email.from}
Subject: ${email.subject}
Date: ${email.date}
Full Content: ${content}${contentLength < emailContent.length ? "..." : ""}
`;
  })
  .join("\n")}

Instructions:
- CRITICAL: If the user mentioned a specific booking platform (super.com, airbnb, expedia, etc.), prioritize information from that platform
- Look for specific dates, times, locations, and details related to the user's question
- Pay attention to confirmations, bookings, reservations, and scheduling information
- For travel-related queries, look for flight times, hotel bookings, departure/arrival info, check-in/check-out dates
- For appointments, look for scheduled times and locations
- For cost/pricing questions, carefully scan email content for dollar amounts ($), currency symbols, "total", "cost", "price", "amount", "fee", "charge", "payment"
- Extract specific numerical values when found (e.g., "$27.27", "€50", "£100")
- IMPORTANT: Even if the email doesn't explicitly mention the platform in the "From" field, look for the platform name anywhere in the email content
- Check email subjects, body content, and sender domains for platform references
- If you find relevant information, provide specific details and quote the source
- If no relevant information is found after checking all emails and calendar events, say so clearly
- Prioritize calendar events for timing information, emails for detailed information
- For cost questions, provide the exact amount found in the email content
- When multiple trips/bookings are found, identify which one matches the user's specific request (e.g., the one from the mentioned platform)
- Look for booking confirmations, receipts, and itineraries that might contain the platform name

Answer the user's question based on this analysis:`;

    const analysisResponse = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content:
            "You are a helpful personal assistant who understands what people are looking for when they ask about their trips, bookings, and appointments. When someone asks about their Super.com trip or Airbnb booking, you know to look for information from that specific platform. You're great at finding trip costs, dates, and booking details in emails. You always give friendly, conversational answers that directly address what the person is asking about. You never make up information and always base your answers on what you actually find in their emails and calendar.",
        },
        {
          role: "user",
          content: analysisPrompt,
        },
      ],
      max_tokens: 800,
      temperature: 0.1,
    });

    return {
      type: "comprehensive_search",
      content: {
        analysis: analysisResponse.choices[0].message.content.trim(),
        calendarEvents: calendarEvents.slice(0, 3),
        emails: emails.slice(0, 3),
        keywords: keywords,
        searchType: searchType,
      },
    };
  } catch (error) {
    console.error("Error in comprehensive search:", error);
    return {
      type: "text",
      content:
        "I had trouble searching for that information. Let me try a different approach.",
    };
  }
}

async function performContextAnalysis(
  parameters,
  userMessage,
  conversationHistory,
  oauth2Client,
  timezone
) {
  try {
    console.log("Performing context analysis:", parameters);

    // Extract entities from conversation history and current message
    const allEntities = [...(parameters.entities || [])];

    // Look for additional entities in recent conversation
    const recentMessages = conversationHistory.slice(-6); // Last 6 messages for context
    for (const msg of recentMessages) {
      const content =
        typeof msg.content === "string"
          ? msg.content
          : JSON.stringify(msg.content);
      // Extract names and companies mentioned
      const entityMatches =
        content.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b/g) || [];
      allEntities.push(
        ...entityMatches.filter(
          (entity) =>
            entity.length > 2 &&
            !["Email", "Here", "Today", "Tomorrow", "Yesterday"].includes(
              entity
            )
        )
      );
    }

    // Remove duplicates and limit
    const uniqueEntities = [...new Set(allEntities)].slice(0, 5);
    console.log("Extracted entities for analysis:", uniqueEntities);

    // Enhanced search strategy: search for entities AND keywords from the user message
    const gmail = google.gmail({ version: "v1", auth: oauth2Client });
    const allEmails = [];

    // Extract keywords from user message for broader search
    const messageKeywords =
      userMessage.toLowerCase().match(/\b\w{3,}\b/g) || [];
    const searchTerms = [
      ...uniqueEntities,
      ...messageKeywords.filter(
        (word) =>
          ![
            "did",
            "they",
            "mention",
            "had",
            "anything",
            "else",
            "some",
            "with",
            "for",
          ].includes(word)
      ),
    ];

    console.log("Search terms for context analysis:", searchTerms);

    // First, search for entities
    for (const entity of uniqueEntities) {
      try {
        // Search emails from this entity
        const emailResponse = await gmail.users.messages.list({
          userId: "me",
          maxResults: 10,
          q: `from:${entity} OR ${entity}`,
        });

        if (emailResponse.data.messages) {
          const entityEmails = await Promise.all(
            emailResponse.data.messages.slice(0, 5).map(async (msg) => {
              const email = await gmail.users.messages.get({
                userId: "me",
                id: msg.id,
                format: "full",
              });

              const payload = email.data.payload;
              const headers = payload.headers;
              const fromHeader =
                headers.find((h) => h.name === "From")?.value || "Unknown";
              const subjectHeader =
                headers.find((h) => h.name === "Subject")?.value ||
                "No Subject";
              const dateHeader =
                headers.find((h) => h.name === "Date")?.value || "";

              const fullBody = getEmailBody(payload);

              // Enhanced content extraction for comprehensive analysis
              const extractedContent = extractFullEmailContent(payload);

              // Use enhanced content if available, fallback to original method
              const cleanBody =
                extractedContent.fullContent ||
                fullBody
                  .replace(/<[^>]*>/g, " ")
                  .replace(/&[^;]+;/g, " ")
                  .replace(/\s+/g, " ")
                  .trim();

              return {
                id: msg.id,
                from: fromHeader,
                subject: subjectHeader,
                date: dateHeader,
                cleanBody: cleanBody,
                enhancedContent: extractedContent,
                entity: entity,
                internalDate: email.data.internalDate,
              };
            })
          );
          allEmails.push(...entityEmails);
        }
      } catch (error) {
        console.log(
          `Error searching emails for entity ${entity}:`,
          error.message
        );
      }
    }

    // Second, search for relevant keywords if we don't have enough emails
    if (allEmails.length < 5) {
      const relevantKeywords = messageKeywords.filter((word) =>
        [
          "interview",
          "job",
          "position",
          "application",
          "hiring",
          "recruiter",
          "hr",
          "follow",
          "next",
          "steps",
          "requirements",
          "tasks",
          "action",
          "needed",
          "complete",
          "finish",
          "submit",
          "send",
          "provide",
          "schedule",
          "meeting",
          "call",
          "response",
          "reply",
          "feedback",
          "update",
          "status",
          "progress",
          "deadline",
          "due",
          "urgent",
          "important",
          "asap",
          "soon",
          "today",
          "tomorrow",
          "week",
          "month",
        ].includes(word)
      );

      console.log("Relevant keywords found:", relevantKeywords);

      for (const keyword of relevantKeywords.slice(0, 3)) {
        try {
          const keywordResponse = await gmail.users.messages.list({
            userId: "me",
            maxResults: 10,
            q: `${keyword}`,
          });

          if (keywordResponse.data.messages) {
            const keywordEmails = await Promise.all(
              keywordResponse.data.messages.slice(0, 3).map(async (msg) => {
                const email = await gmail.users.messages.get({
                  userId: "me",
                  id: msg.id,
                  format: "full",
                });

                const payload = email.data.payload;
                const headers = payload.headers;
                const fromHeader =
                  headers.find((h) => h.name === "From")?.value || "Unknown";
                const subjectHeader =
                  headers.find((h) => h.name === "Subject")?.value ||
                  "No Subject";
                const dateHeader =
                  headers.find((h) => h.name === "Date")?.value || "";

                const fullBody = getEmailBody(payload);
                const extractedContent = extractFullEmailContent(payload);

                const cleanBody =
                  extractedContent.fullContent ||
                  fullBody
                    .replace(/<[^>]*>/g, " ")
                    .replace(/&[^;]+;/g, " ")
                    .replace(/\s+/g, " ")
                    .trim();

                return {
                  id: msg.id,
                  from: fromHeader,
                  subject: subjectHeader,
                  date: dateHeader,
                  cleanBody: cleanBody,
                  enhancedContent: extractedContent,
                  entity: keyword,
                  internalDate: email.data.internalDate,
                };
              })
            );
            allEmails.push(...keywordEmails);
          }
        } catch (error) {
          console.log(
            `Error searching emails for keyword ${keyword}:`,
            error.message
          );
        }
      }
    }

    // Sort emails by date (most recent first)
    allEmails.sort(
      (a, b) => parseInt(b.internalDate) - parseInt(a.internalDate)
    );

    // Also search for tasks related to these entities
    const tasks = google.tasks({ version: "v1", auth: oauth2Client });
    let allTasks = [];

    try {
      const taskLists = await tasks.tasklists.list();
      for (const taskList of taskLists.data.items || []) {
        const taskResponse = await tasks.tasks.list({
          tasklist: taskList.id,
          maxResults: 20,
          showCompleted: true,
          showHidden: true,
        });

        if (taskResponse.data.items) {
          const relevantTasks = taskResponse.data.items.filter((task) => {
            const taskText = `${task.title || ""} ${
              task.notes || ""
            }`.toLowerCase();
            return uniqueEntities.some((entity) =>
              taskText.includes(entity.toLowerCase())
            );
          });
          allTasks.push(...relevantTasks);
        }
      }
    } catch (error) {
      console.log("Error fetching tasks:", error.message);
    }

    // Remove duplicates from emails
    const uniqueEmails = allEmails.filter(
      (email, index, self) => index === self.findIndex((e) => e.id === email.id)
    );

    console.log(
      `Found ${uniqueEmails.length} unique emails for context analysis`
    );

    // Analyze content for action items, requests, follow-ups, deadlines
    const analysisPrompt = `Answer this question directly: "${userMessage}"

Search Context: Found ${
      uniqueEmails.length
    } emails related to: ${searchTerms.join(", ")}

EMAILS:
${uniqueEmails
  .slice(0, 10)
  .map((email, index) => {
    // Use enhanced content if available, otherwise use cleanBody
    let emailContent = email.cleanBody || "";
    if (email.enhancedContent && email.enhancedContent.fullContent) {
      emailContent = email.enhancedContent.fullContent;
    }

    // Increase content length for better analysis
    const contentLength = Math.min(emailContent.length, 4000);
    const content = emailContent.substring(0, contentLength);

    return `
Email ${index + 1}:
From: ${email.from}
Subject: ${email.subject}
Date: ${email.date}
Content: ${content}${contentLength < emailContent.length ? "..." : ""}
`;
  })
  .join("\n")}

TASKS:
${allTasks
  .slice(0, 5)
  .map(
    (task, index) => `
Task ${index + 1}: ${task.title}
Status: ${task.status}
Notes: ${task.notes || "No notes"}
Due: ${task.due || "No due date"}
`
  )
  .join("\n")}

Instructions:
- Be DIRECT and SPECIFIC in your answer
- Look for exact phrases about next steps, requirements, follow-ups, or action items
- Quote specific text from emails when relevant
- Focus on what the user needs to know or do
- If asking about job interviews: look for follow-up instructions, next steps, additional requirements, or confirmations
- If no relevant information is found, state that clearly and briefly
- Keep your response concise and actionable

Answer:`;

    const analysisResponse = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content:
            "You are a direct, helpful assistant who analyzes emails to answer specific questions. Give clear, actionable answers. Quote relevant email text when found. If no relevant information exists, say so briefly. Be conversational but precise.",
        },
        {
          role: "user",
          content: analysisPrompt,
        },
      ],
      max_tokens: 500,
      temperature: 0.1,
    });

    return {
      type: "context_analysis",
      content: {
        analysis: analysisResponse.choices[0].message.content.trim(),
        emails: allEmails.slice(0, 5), // Include some emails for display
        tasks: allTasks.slice(0, 3), // Include some tasks for display
        entities: uniqueEntities,
      },
    };
  } catch (error) {
    console.error("Error in context analysis:", error);
    return {
      type: "text",
      content:
        "I had trouble analyzing the context. Let me search for specific information instead.",
    };
  }
}

async function extractKeywordsFromHistory(conversationHistory) {
  if (!conversationHistory || conversationHistory.length === 0) {
    return [];
  }
  try {
    const historyText = conversationHistory
      .map((msg) => JSON.stringify(msg.content))
      .join("\\n");

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `You are an expert at identifying key entities from a conversation.
Review the provided conversation history and extract the most important and specific proper nouns, company names, or topics.
These keywords will be used to enrich a new search.

CRITICAL RULES:
- Focus on specific, identifiable entities (e.g., "Super.com", "PayPal", "Stacy", "Tesla").
- AVOID generic terms (e.g., "trip," "cost," "meeting").
- Return a maximum of 2-3 of the most important keywords.
- If no specific entities are found, return an empty array.

Return as a JSON object with a "keywords" array of strings.`,
        },
        {
          role: "user",
          content: `Extract key entities from this history:\\n\\n${historyText}`,
        },
      ],
      response_format: { type: "json_object" },
      max_tokens: 80,
      temperature: 0.1,
    });

    const result = JSON.parse(response.choices[0].message.content);
    return result.keywords || [];
  } catch (error) {
    console.error("Error extracting keywords from history:", error);
    return [];
  }
}

// Extract context keywords from both user message and AI response for better relevance
async function extractContextFromResponse(
  userMessage,
  aiResponse,
  oauth2Client,
  timezone
) {
  try {
    console.log(`Generating relevant context for: "${userMessage}"`);
    console.log(`AI response type: ${aiResponse.type}`);

    let contextData = {
      query: userMessage,
      keywords: [],
      emails: [],
      events: [],
      tasks: [],
      people: [],
      timestamp: new Date().toISOString(),
    };

    // Generate context based on what the AI actually responded with
    if (aiResponse.type === "calendar_events") {
      // For calendar responses, show the events AND related context
      contextData.events = aiResponse.content || [];

      const eventPeople =
        aiResponse.content
          ?.map((event) => {
            const attendees = event.attendees || [];
            const organizer = event.organizer ? [event.organizer] : [];
            return [...attendees, ...organizer];
          })
          .flat()
          .filter(Boolean) || [];

      contextData.people = [...new Set(eventPeople)].slice(0, 5);

      // Find related emails and tasks based on event attendees
      if (eventPeople.length > 0) {
        contextData.emails = await searchRelatedEmails(
          eventPeople.slice(0, 3),
          oauth2Client,
          timezone
        );
        contextData.tasks = await searchRelatedTasks(
          eventPeople.slice(0, 3),
          oauth2Client,
          timezone
        );
      }
    } else if (aiResponse.type === "emails") {
      // For email responses, show the emails AND related context
      contextData.emails = aiResponse.content || [];

      const emailPeople =
        aiResponse.content
          ?.map((email) => [email.from, email.email])
          .flat()
          .filter(Boolean) || [];
      contextData.people = [...new Set(emailPeople)].slice(0, 5);

      // Find related calendar events and tasks based on email senders
      if (emailPeople.length > 0) {
        contextData.events = await searchRelatedEvents(
          emailPeople.slice(0, 3),
          oauth2Client,
          timezone
        );
        contextData.tasks = await searchRelatedTasks(
          emailPeople.slice(0, 3),
          oauth2Client,
          timezone
        );
      }
    } else if (aiResponse.type === "tasks") {
      // For task responses, show the tasks AND related context
      contextData.tasks = aiResponse.content || [];

      const taskKeywords =
        aiResponse.content?.map((task) => task.title).filter(Boolean) || [];

      if (taskKeywords.length > 0) {
        contextData.emails = await searchRelatedEmails(
          taskKeywords.slice(0, 3),
          oauth2Client,
          timezone
        );
        contextData.events = await searchRelatedEvents(
          taskKeywords.slice(0, 3),
          oauth2Client,
          timezone
        );
      }
    } else {
      // For text responses, try to extract context from the response content
      const responseText =
        aiResponse.naturalLanguage || aiResponse.content || "";
      const contextKeywords = await extractContextKeywords(
        userMessage + " " + responseText
      );
      contextData.keywords = contextKeywords;

      // Search for minimal related information (fewer results for text responses)
      const [relatedEmails, relatedEvents, relatedTasks] = await Promise.all([
        searchRelatedEmails(
          contextKeywords.slice(0, 2),
          oauth2Client,
          timezone
        ),
        searchRelatedEvents(
          contextKeywords.slice(0, 2),
          oauth2Client,
          timezone
        ),
        searchRelatedTasks(contextKeywords.slice(0, 2), oauth2Client, timezone),
      ]);

      contextData.emails = relatedEmails.slice(0, 2);
      contextData.events = relatedEvents.slice(0, 2);
      contextData.tasks = relatedTasks.slice(0, 2);

      contextData.people = extractPeopleFromContext(
        contextData.emails,
        contextData.events,
        contextKeywords
      );
    }

    console.log(
      `Generated context: ${contextData.emails.length} emails, ${contextData.events.length} events, ${contextData.tasks.length} tasks, ${contextData.people.length} people`
    );
    return contextData;
  } catch (error) {
    console.error("Error generating relevant context data:", error);
    return null;
  }
}

// This function is the key to providing relevant context for follow-up questions.
// It analyzes the full conversation to extract specific entities, avoiding generic terms.
async function extractContextFromResponse(
  userMessage,
  aiResponse,
  conversationHistory = []
) {
  if (!conversationHistory || conversationHistory.length === 0) {
    // If there's no history, fall back to the basic keyword extractor
    return extractContextKeywords(userMessage);
  }

  try {
    const historyText = conversationHistory
      .map(
        (msg) =>
          `${msg.role}: ${
            typeof msg.content === "string"
              ? msg.content
              : JSON.stringify(msg.content)
          }`
      )
      .join("\n");

    const response = await openai.chat.completions.create({
      model: "gpt-4o", // Use the more powerful model for this critical task
      messages: [
        {
          role: "system",
          content: `You are an expert at identifying the key entities and topics in a conversation to find relevant documents.
Analyze the user's LATEST question in the context of the conversation history and the AI's latest response.
Your goal is to extract 1-3 highly specific search terms (keywords) that will be used to find relevant emails, events, and tasks.

CRITICAL RULES:
- First, look at the conversation history to understand the topic. Is the user asking a follow-up question?
- If the latest question is generic (e.g., "how much was it?", "when is it?"), you MUST use the history to identify the specific subject (e.g., "Super.com trip", "interview with Tesla").
- Extract the MOST SPECIFIC identifiers possible. Prioritize proper nouns, company names, booking platforms (Super.com, PayPal, Airbnb), hotel names, locations, and people's names.
- AVOID generic terms like "trip", "cost", "email", "booking" unless they are part of a specific name (e.g., "booking.com").

Conversation Analysis Examples:

### Example 1: Follow-up about cost
- CONVERSATION HISTORY:
  - user: "When is my trip I booked on super.com?"
  - assistant: "Your trip is on June 29..."
- LATEST QUESTION: "How much did it cost?"
- LATEST AI RESPONSE: "Your trip cost $330.17. I found this in your PayPal email..."
- **OUTPUT:** ["Super.com", "PayPal"]

### Example 2: Standalone question
- CONVERSATION HISTORY: []
- LATEST QUESTION: "What's the status of my flight with Delta?"
- LATEST AI RESPONSE: "Your Delta flight DL123 is on time."
- **OUTPUT:** ["Delta", "flight DL123"]

Return as JSON object with a "keywords" array of strings.`,
        },
        {
          role: "user",
          content: `CONVERSATION HISTORY:\n${historyText}\n\nLATEST QUESTION: "${userMessage}"\n\nLATEST AI RESPONSE: "${aiResponse}"\n\nExtract specific search terms:`,
        },
      ],
      response_format: { type: "json_object" },
      max_tokens: 100,
      temperature: 0.1,
    });

    const result = JSON.parse(response.choices[0].message.content);
    const keywords = result.keywords || [];

    console.log(`Extracted keywords using history: ${keywords.join(", ")}`);
    return keywords.slice(0, 3);
  } catch (error) {
    console.error(
      "Error extracting context from response with history:",
      error
    );
    // Fallback to method without history
    return extractContextKeywords(userMessage);
  }
}
