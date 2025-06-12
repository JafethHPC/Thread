const OpenAI = require("openai");

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/**
 * Generate proactive suggestions based on user's emails, events, and tasks
 * @param {Object} context - Contains emails, events, tasks, relationshipMap, userId
 * @returns {Array} Array of suggestion objects
 */
async function generateProactiveSuggestions(context) {
  try {
    const { emails, events, tasks, relationshipMap, userId } = context;

    console.log(`Generating proactive suggestions for user ${userId}`);

    // Prepare data for GPT analysis
    const dataForAnalysis = prepareDataForAnalysis(emails, events, tasks);

    if (!dataForAnalysis.hasContent) {
      console.log("No relevant data found for proactive suggestions");
      return [];
    }

    const prompt = createSuggestionPrompt(dataForAnalysis);

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: `You are a proactive personal assistant that analyzes emails, calendar events, and tasks to surface helpful suggestions and reminders.

Your goal is to identify actionable items that the user should follow up on, prioritizing:
1. Time-sensitive items (deadlines, upcoming meetings)
2. Unresponded emails that need attention
3. Tasks that are overdue or due soon
4. Opportunities to schedule meetings or follow up
5. Items connected across multiple data sources

Return suggestions as a JSON array with this structure:
{
  "suggestions": [
    {
      "type": "follow_up_email|reminder_task_due|schedule_meeting|deadline_reminder|unread_important",
      "title": "Brief, actionable title",
      "context": "Why this suggestion is being made",
      "priority": "high|medium|low",
      "sourceData": {
        "emailId": "optional",
        "eventId": "optional", 
        "taskId": "optional",
        "sourceType": "email|event|task|multiple"
      },
      "actionData": {
        "suggestedAction": "reply|schedule|complete|review",
        "dueDate": "ISO date if applicable",
        "participants": ["email addresses if scheduling"],
        "draftContent": "suggested email content if applicable"
      }
    }
  ]
}

SUGGESTION TYPES:
- follow_up_email: Unresponded emails that need attention
- reminder_task_due: Tasks due today/tomorrow or overdue
- schedule_meeting: Opportunities to schedule meetings mentioned in emails
- deadline_reminder: Important deadlines approaching
- unread_important: High-priority unread emails

PRIORITY LEVELS:
- high: Urgent, time-sensitive (due today/tomorrow, overdue)
- medium: Important but not urgent (due this week)
- low: Nice to have (general follow-ups)

Only suggest actionable items. Don't suggest things that are already completed or don't need action.`,
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      response_format: { type: "json_object" },
      max_tokens: 1500,
      temperature: 0.1,
    });

    const result = JSON.parse(response.choices[0].message.content);
    const suggestions = result.suggestions || [];

    console.log(`Generated ${suggestions.length} proactive suggestions`);

    // Validate and enhance suggestions
    return suggestions
      .filter(validateSuggestion)
      .map(enhanceSuggestion)
      .slice(0, 10); // Limit to 10 suggestions max
  } catch (error) {
    console.error("Error generating proactive suggestions:", error);
    return [];
  }
}

function prepareDataForAnalysis(emails, events, tasks) {
  const now = new Date();
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const nextWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  // Filter for recent/relevant emails (last 3 days, unread, or from important senders)
  const relevantEmails = emails
    .filter((email) => {
      const emailDate = new Date(
        email.internalDate ? parseInt(email.internalDate) : email.date
      );
      const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);

      return (
        emailDate > threeDaysAgo ||
        email.labels?.includes("UNREAD") ||
        isImportantSender(email.from)
      );
    })
    .slice(0, 15); // Limit for token management

  // Filter for upcoming events (next 7 days)
  const upcomingEvents = events
    .filter((event) => {
      const eventDate = new Date(event.start);
      return eventDate >= now && eventDate <= nextWeek;
    })
    .slice(0, 10);

  // Filter for active/due tasks
  const activeTasks = tasks
    .filter((task) => {
      if (task.status === "completed") return false;

      if (task.due) {
        const dueDate = new Date(task.due);
        return dueDate <= nextWeek; // Due within a week
      }

      return true; // Include tasks without due dates
    })
    .slice(0, 10);

  const hasContent =
    relevantEmails.length > 0 ||
    upcomingEvents.length > 0 ||
    activeTasks.length > 0;

  return {
    emails: relevantEmails,
    events: upcomingEvents,
    tasks: activeTasks,
    hasContent,
    currentTime: now.toISOString(),
  };
}

function isImportantSender(fromField) {
  const importantDomains = [
    "noreply",
    "no-reply",
    "donotreply",
    "support",
    "help",
    "service",
    "hr",
    "recruiting",
    "talent",
    "booking",
    "reservation",
    "confirmation",
  ];

  const fromLower = fromField.toLowerCase();

  // Skip newsletters and promotional emails
  if (
    fromLower.includes("newsletter") ||
    fromLower.includes("marketing") ||
    fromLower.includes("promo")
  ) {
    return false;
  }

  // Include emails from important service domains
  return importantDomains.some((domain) => fromLower.includes(domain));
}

function createSuggestionPrompt(data) {
  const { emails, events, tasks, currentTime } = data;

  return `Current time: ${currentTime}

RECENT EMAILS (${emails.length}):
${emails
  .map(
    (email, i) => `
Email ${i + 1}:
From: ${email.from}
Subject: ${email.subject}
Date: ${email.date}
Snippet: ${email.snippet}
Labels: ${email.labels?.join(", ") || "none"}
Thread ID: ${email.threadId}
`
  )
  .join("\n")}

UPCOMING EVENTS (${events.length}):
${events
  .map(
    (event, i) => `
Event ${i + 1}:
Title: ${event.summary}
Start: ${event.start}
End: ${event.end}
Location: ${event.location || "No location"}
Attendees: ${event.attendees?.map((a) => a.email).join(", ") || "none"}
Status: ${event.status}
`
  )
  .join("\n")}

ACTIVE TASKS (${tasks.length}):
${tasks
  .map(
    (task, i) => `
Task ${i + 1}:
Title: ${task.title}
Status: ${task.status}
Due: ${task.due || "No due date"}
Notes: ${task.notes || "No notes"}
Updated: ${task.updated}
`
  )
  .join("\n")}

Analyze this data and suggest actionable items the user should follow up on. Focus on:
1. Unread emails that need responses
2. Tasks due today/tomorrow or overdue
3. Meetings that need scheduling based on email content
4. Important deadlines approaching
5. Follow-ups mentioned in emails

Be specific and actionable. Only suggest things that genuinely need the user's attention.`;
}

function validateSuggestion(suggestion) {
  const requiredFields = ["type", "title", "context", "priority"];
  const validTypes = [
    "follow_up_email",
    "reminder_task_due",
    "schedule_meeting",
    "deadline_reminder",
    "unread_important",
  ];
  const validPriorities = ["high", "medium", "low"];

  return (
    requiredFields.every((field) => suggestion[field]) &&
    validTypes.includes(suggestion.type) &&
    validPriorities.includes(suggestion.priority) &&
    suggestion.title.length > 0 &&
    suggestion.context.length > 0
  );
}

function enhanceSuggestion(suggestion) {
  // Add timestamp and ID
  return {
    id: generateSuggestionId(),
    ...suggestion,
    createdAt: new Date().toISOString(),
    status: "active",
  };
}

function generateSuggestionId() {
  return "sug_" + Date.now() + "_" + Math.random().toString(36).substr(2, 9);
}

/**
 * Get suggestion statistics for a user
 */
async function getSuggestionStats(userId, timeframe = "7d") {
  // This would query the database for suggestion metrics
  // For now, return mock data structure
  return {
    totalGenerated: 0,
    totalAccepted: 0,
    totalDismissed: 0,
    byType: {},
    byPriority: {},
    acceptanceRate: 0,
  };
}

/**
 * Mark a suggestion as acted upon
 */
async function markSuggestionActioned(suggestionId, action, userId) {
  console.log(
    `Marking suggestion ${suggestionId} as ${action} for user ${userId}`
  );

  // This would update the database record
  // For now, just log the action
  return {
    suggestionId,
    action,
    timestamp: new Date().toISOString(),
  };
}

module.exports = {
  generateProactiveSuggestions,
  getSuggestionStats,
  markSuggestionActioned,
};
