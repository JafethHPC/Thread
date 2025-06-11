const { OpenAI } = require("openai");
const { google } = require("googleapis");
const db = require("../models");
const User = db.User;

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

exports.processMessage = async (req, res) => {
  const { message } = req.body;

  if (!req.userId) {
    return res.status(401).send("User not authenticated.");
  }

  try {
    const user = await User.findByPk(req.userId);
    if (!user || !user.google_access_token) {
      return res
        .status(401)
        .send("Google account not connected or tokens are missing.");
    }

    const oauth2Client = new google.auth.OAuth2(
      process.env.VITE_GOOGLE_CLIENT_ID,
      process.env.VITE_GOOGLE_CLIENT_SECRET
    );

    oauth2Client.setCredentials({
      access_token: user.google_access_token,
      refresh_token: user.google_refresh_token,
    });

    // Add a 'token' event listener to handle token refreshes
    let tokensRefreshed = false;
    oauth2Client.on("tokens", (tokens) => {
      if (tokens.refresh_token) {
        // store the new tokens for next time
        user.google_access_token = tokens.access_token;
        user.google_refresh_token = tokens.refresh_token;
      } else {
        user.google_access_token = tokens.access_token;
      }
      tokensRefreshed = true;
    });

    // Step 1: Advanced Intent and Entity Extraction from User Message
    const systemPrompt = `
You are an intelligent assistant that analyzes a user's request and translates it into a structured command for Google's APIs (Gmail, Calendar, Tasks).

Your task is to determine the user's intent and extract all relevant parameters (entities) from their message.

Respond with a single, minified JSON object with no newlines. The JSON should have two keys: "intent" and "parameters".

Possible intents are: "get_emails", "get_calendar_events", "get_tasks", "unknown".

The "parameters" object should contain the extracted entities.

- For "get_emails", possible parameters are:
  - "from" (string): The sender's name or email.
  - "subject" (string): Keywords in the subject line.
  - "query" (string): General keywords in the email body or subject.
  - "date_filter" (string): Can be "today", "yesterday", "this_week", "this_month".

- For "get_calendar_events", possible parameters are:
  - "date_start" (string): The start date in YYYY-MM-DD format. Understands "today", "tomorrow", "this week", etc.
  - "date_end" (string): The end date in YYYY-MM-DD format.
  - "query" (string): A keyword search for event titles or descriptions.

- For "get_tasks", possible parameters are:
  - "status" (string): "needsAction" or "completed". Defaults to "needsAction".
  - "due_date" (string): A specific due date in YYYY-MM-DD format.

If an intent is unclear or no specific parameters are found, return "unknown" for the intent and an empty parameters object.

Example 1:
User: "show me emails from Dave about the project launch"
{"intent":"get_emails","parameters":{"from":"Dave","query":"project launch"}}

Example 2:
User: "what's on my calendar for tomorrow"
{"intent":"get_calendar_events","parameters":{"date_start":"[TOMORROW_DATE]"}}

Example 3:
User: "show me my incomplete tasks"
{"intent":"get_tasks","parameters":{"status":"needsAction"}}
`;

    const intentExtractionResponse = await openai.chat.completions.create({
      model: "gpt-4o", // Using a more advanced model for better JSON generation
      messages: [
        {
          role: "system",
          // Replace placeholder with today's date for accurate relative date processing
          content: systemPrompt.replace(
            "[TOMORROW_DATE]",
            new Date(new Date().setDate(new Date().getDate() + 1))
              .toISOString()
              .split("T")[0]
          ),
        },
        {
          role: "user",
          content: message,
        },
      ],
      max_tokens: 150,
      temperature: 0, // We want deterministic output
    });

    const structuredCommandText =
      intentExtractionResponse.choices[0].message.content;
    let command;
    try {
      command = JSON.parse(structuredCommandText);
    } catch (e) {
      console.error(
        "Failed to parse LLM response as JSON:",
        structuredCommandText
      );
      return res.status(500).send("Error understanding your request.");
    }

    const { intent, parameters } = command;

    // Helper function to get date ranges
    const getDateRange = (filter) => {
      const start = new Date();
      const end = new Date();
      switch (filter) {
        case "today":
          start.setHours(0, 0, 0, 0);
          end.setHours(23, 59, 59, 999);
          break;
        case "yesterday":
          start.setDate(start.getDate() - 1);
          start.setHours(0, 0, 0, 0);
          end.setDate(end.getDate() - 1);
          end.setHours(23, 59, 59, 999);
          break;
        case "this_week":
          start.setDate(start.getDate() - start.getDay());
          start.setHours(0, 0, 0, 0);
          break;
        case "this_month":
          start.setDate(1);
          start.setHours(0, 0, 0, 0);
          break;
      }
      return { start, end };
    };

    let data;

    // Step 2: Data Retrieval based on the structured command
    if (intent === "get_emails") {
      const gmail = google.gmail({ version: "v1", auth: oauth2Client });
      let query = "in:inbox";
      if (parameters.from) query += ` from:${parameters.from}`;
      if (parameters.subject) query += ` subject:(${parameters.subject})`;
      if (parameters.query) query += ` ${parameters.query}`;
      if (parameters.date_filter) {
        const { start } = getDateRange(parameters.date_filter);
        query += ` after:${Math.floor(start.getTime() / 1000)}`;
      }

      const emailResponse = await gmail.users.messages.list({
        userId: "me",
        maxResults: 5,
        q: query,
      });

      if (!emailResponse.data.messages) {
        data = "I couldn't find any emails matching your search.";
      } else {
        const messages = await Promise.all(
          emailResponse.data.messages.map(async (msg) => {
            const email = await gmail.users.messages.get({
              userId: "me",
              id: msg.id,
              format: "metadata",
              metadataHeaders: ["From", "Subject"],
            });
            return {
              subject:
                email.data.payload.headers.find((h) => h.name === "Subject")
                  ?.value || "No Subject",
              from:
                email.data.payload.headers.find((h) => h.name === "From")
                  ?.value || "Unknown Sender",
              snippet: email.data.snippet,
            };
          })
        );
        data = `Here are your latest emails based on your criteria:\n${JSON.stringify(
          messages,
          null,
          2
        )}`;
      }
    } else if (intent === "get_calendar_events") {
      const calendar = google.calendar({ version: "v3", auth: oauth2Client });
      const { date_start, date_end, query } = parameters;

      const eventResponse = await calendar.events.list({
        calendarId: "primary",
        timeMin: date_start
          ? new Date(date_start).toISOString()
          : new Date().toISOString(),
        timeMax: date_end ? new Date(date_end).toISOString() : undefined,
        q: query,
        maxResults: 10,
        singleEvents: true,
        orderBy: "startTime",
      });
      data = `Here are your upcoming events:\n${JSON.stringify(
        eventResponse.data.items,
        null,
        2
      )}`;
    } else if (intent === "get_tasks") {
      const tasks = google.tasks({ version: "v1", auth: oauth2Client });
      const { status, due_date } = parameters;

      const taskResponse = await tasks.tasks.list({
        tasklist: "@default",
        maxResults: 10,
        showCompleted: status === "completed",
        dueMin: due_date ? new Date(due_date).toISOString() : undefined,
      });
      data = `Here are your tasks:\n${JSON.stringify(
        taskResponse.data.items,
        null,
        2
      )}`;
    } else {
      data =
        "I'm not sure how to help with that. Please ask about emails, calendar events, or tasks.";
    }

    // If tokens were refreshed, save them to the database
    if (tokensRefreshed) {
      await user.save();
    }

    // 3. Response Generation using OpenAI
    const finalResponse = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        {
          role: "system",
          content:
            "You are a helpful assistant. Summarize the following information in a clear and concise way.",
        },
        {
          role: "user",
          content: data,
        },
      ],
    });

    res.json({ response: finalResponse.choices[0].message.content });
  } catch (error) {
    console.error("Error processing message:", error.message);
    res.status(500).send("Error processing your request.");
  }
};
