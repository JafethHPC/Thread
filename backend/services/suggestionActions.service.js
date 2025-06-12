const { google } = require("googleapis");
const { getOAuth2Client } = require("./google.service");

/**
 * Service to handle suggestion actions like sending emails, creating events, updating tasks
 */
class SuggestionActionsService {
  /**
   * Send an email reply via Gmail API
   */
  async sendEmailReply(userId, actionData) {
    try {
      const { threadId, to, subject, content, inReplyTo } = actionData;

      const oauth2Client = await getOAuth2Client(userId);
      const gmail = google.gmail({ version: "v1", auth: oauth2Client });

      // Create email message
      const emailLines = [
        `To: ${to}`,
        `Subject: ${subject.startsWith("Re:") ? subject : "Re: " + subject}`,
        inReplyTo ? `In-Reply-To: ${inReplyTo}` : "",
        'Content-Type: text/plain; charset="UTF-8"',
        "",
        content,
      ].filter(Boolean);

      const email = emailLines.join("\n");
      const encodedEmail = Buffer.from(email)
        .toString("base64")
        .replace(/\+/g, "-")
        .replace(/\//g, "_");

      const response = await gmail.users.messages.send({
        userId: "me",
        requestBody: {
          raw: encodedEmail,
          threadId: threadId,
        },
      });

      console.log(`Email sent successfully: ${response.data.id}`);

      return {
        success: true,
        messageId: response.data.id,
        threadId: response.data.threadId,
      };
    } catch (error) {
      console.error("Error sending email reply:", error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Create a calendar event
   */
  async createCalendarEvent(userId, actionData) {
    try {
      const {
        summary,
        description,
        startTime,
        endTime,
        attendees = [],
        location = "",
      } = actionData;

      const oauth2Client = await getOAuth2Client(userId);
      const calendar = google.calendar({ version: "v3", auth: oauth2Client });

      const event = {
        summary,
        description,
        location,
        start: {
          dateTime: startTime,
          timeZone: "America/New_York", // TODO: Use user's timezone
        },
        end: {
          dateTime: endTime,
          timeZone: "America/New_York",
        },
        attendees: attendees.map((email) => ({ email })),
        reminders: {
          useDefault: true,
        },
      };

      const response = await calendar.events.insert({
        calendarId: "primary",
        resource: event,
        sendUpdates: "all", // Send invites to attendees
      });

      console.log(`Calendar event created: ${response.data.id}`);

      return {
        success: true,
        eventId: response.data.id,
        eventLink: response.data.htmlLink,
      };
    } catch (error) {
      console.error("Error creating calendar event:", error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Update a task (mark complete, change due date, etc.)
   */
  async updateTask(userId, actionData) {
    try {
      const { taskId, updates } = actionData;

      const oauth2Client = await getOAuth2Client(userId);
      const tasks = google.tasks({ version: "v1", auth: oauth2Client });

      const response = await tasks.tasks.update({
        tasklist: "@default",
        task: taskId,
        resource: updates,
      });

      console.log(`Task updated: ${taskId}`);

      return {
        success: true,
        taskId: response.data.id,
        updatedFields: Object.keys(updates),
      };
    } catch (error) {
      console.error("Error updating task:", error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Create a new task
   */
  async createTask(userId, actionData) {
    try {
      const { title, notes, due } = actionData;

      const oauth2Client = await getOAuth2Client(userId);
      const tasks = google.tasks({ version: "v1", auth: oauth2Client });

      const task = {
        title,
        notes,
        due: due ? new Date(due).toISOString() : undefined,
      };

      const response = await tasks.tasks.insert({
        tasklist: "@default",
        resource: task,
      });

      console.log(`Task created: ${response.data.id}`);

      return {
        success: true,
        taskId: response.data.id,
      };
    } catch (error) {
      console.error("Error creating task:", error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Mark task as completed
   */
  async completeTask(userId, taskId) {
    return this.updateTask(userId, {
      taskId,
      updates: {
        status: "completed",
        completed: new Date().toISOString(),
      },
    });
  }

  /**
   * Snooze a task (update due date)
   */
  async snoozeTask(userId, taskId, newDueDate) {
    return this.updateTask(userId, {
      taskId,
      updates: {
        due: new Date(newDueDate).toISOString(),
      },
    });
  }

  /**
   * Generate draft email content for a suggestion
   */
  async generateDraftEmail(suggestionContext) {
    try {
      const { type, sourceData, context } = suggestionContext;

      // Simple template-based draft generation
      // In a real implementation, you might use GPT to generate more sophisticated drafts

      let draftContent = "";

      switch (type) {
        case "follow_up_email":
          draftContent = `Hi,

I wanted to follow up on our previous conversation. ${context}

Please let me know if you need any additional information from me.

Best regards`;
          break;

        case "schedule_meeting":
          draftContent = `Hi,

I'd like to schedule a meeting to discuss ${context}. 

Are you available for a 30-minute call this week? I'm flexible on timing.

Best regards`;
          break;

        default:
          draftContent = `Hi,

${context}

Please let me know if you have any questions.

Best regards`;
      }

      return {
        success: true,
        draftContent,
      };
    } catch (error) {
      console.error("Error generating draft email:", error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Suggest meeting times based on calendar availability
   */
  async suggestMeetingTimes(userId, duration = 30, daysAhead = 7) {
    try {
      const oauth2Client = await getOAuth2Client(userId);
      const calendar = google.calendar({ version: "v3", auth: oauth2Client });

      const now = new Date();
      const endTime = new Date(now.getTime() + daysAhead * 24 * 60 * 60 * 1000);

      // Get busy times
      const freeBusyResponse = await calendar.freebusy.query({
        resource: {
          timeMin: now.toISOString(),
          timeMax: endTime.toISOString(),
          items: [{ id: "primary" }],
        },
      });

      const busyTimes = freeBusyResponse.data.calendars.primary.busy || [];

      // Generate suggested times (simplified algorithm)
      const suggestions = [];
      const workingHours = { start: 9, end: 17 }; // 9 AM to 5 PM

      for (let day = 1; day <= daysAhead; day++) {
        const date = new Date(now.getTime() + day * 24 * 60 * 60 * 1000);

        // Skip weekends
        if (date.getDay() === 0 || date.getDay() === 6) continue;

        for (let hour = workingHours.start; hour < workingHours.end; hour++) {
          const startTime = new Date(date);
          startTime.setHours(hour, 0, 0, 0);

          const endTimeSlot = new Date(
            startTime.getTime() + duration * 60 * 1000
          );

          // Check if this time conflicts with busy times
          const hasConflict = busyTimes.some((busy) => {
            const busyStart = new Date(busy.start);
            const busyEnd = new Date(busy.end);
            return startTime < busyEnd && endTimeSlot > busyStart;
          });

          if (!hasConflict) {
            suggestions.push({
              start: startTime.toISOString(),
              end: endTimeSlot.toISOString(),
              displayTime: startTime.toLocaleString(),
            });
          }

          if (suggestions.length >= 5) break; // Limit suggestions
        }

        if (suggestions.length >= 5) break;
      }

      return {
        success: true,
        suggestions: suggestions.slice(0, 5),
      };
    } catch (error) {
      console.error("Error suggesting meeting times:", error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Execute a suggestion action based on type
   */
  async executeSuggestionAction(userId, suggestion, userInput = {}) {
    try {
      const { type, actionData } = suggestion;

      switch (type) {
        case "follow_up_email":
          return await this.sendEmailReply(userId, {
            ...actionData,
            ...userInput,
          });

        case "schedule_meeting":
          return await this.createCalendarEvent(userId, {
            ...actionData,
            ...userInput,
          });

        case "reminder_task_due":
          if (userInput.action === "complete") {
            return await this.completeTask(userId, actionData.taskId);
          } else if (userInput.action === "snooze") {
            return await this.snoozeTask(
              userId,
              actionData.taskId,
              userInput.newDueDate
            );
          }
          break;

        case "deadline_reminder":
          // Create a follow-up task or calendar reminder
          return await this.createTask(userId, {
            title: `Follow up: ${suggestion.title}`,
            notes: suggestion.context,
            due: actionData.dueDate,
          });

        default:
          return {
            success: false,
            error: `Unknown suggestion type: ${type}`,
          };
      }
    } catch (error) {
      console.error("Error executing suggestion action:", error);
      return {
        success: false,
        error: error.message,
      };
    }
  }
}

// Export singleton instance
const suggestionActionsService = new SuggestionActionsService();

module.exports = {
  suggestionActionsService,
  SuggestionActionsService,
};
