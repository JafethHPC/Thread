const { google } = require("googleapis");
const { getOAuth2Client } = require("./google.service");
const { buildRelationshipMap } = require("./relationshipMap.service");
const { buildContextCard } = require("./contextCardBuilder.service");
const {
  generateProactiveSuggestions,
} = require("./proactiveSuggestions.service");
const db = require("../models");
const { User, ProactiveSuggestion } = db;

class ScheduledSyncService {
  constructor() {
    this.syncInterval = null;
    this.isRunning = false;
    this.syncIntervalMinutes = 45; // Default 45 minutes
  }

  start() {
    if (this.isRunning) {
      console.log("Scheduled sync is already running");
      return;
    }

    this.isRunning = true;
    const intervalMs = this.syncIntervalMinutes * 60 * 1000;

    console.log(
      `Starting scheduled sync every ${this.syncIntervalMinutes} minutes`
    );

    // Run immediately on start
    this.performSyncForAllUsers();

    // Then schedule recurring syncs
    this.syncInterval = setInterval(() => {
      this.performSyncForAllUsers();
    }, intervalMs);
  }

  stop() {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
    this.isRunning = false;
    console.log("Scheduled sync stopped");
  }

  async performSyncForAllUsers() {
    try {
      console.log("Starting scheduled sync for all users...");

      // Get all active users (those who have used the system recently)
      const recentThreshold = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); // 7 days
      const activeUsers = await User.findAll({
        where: {
          updatedAt: {
            [db.Sequelize.Op.gte]: recentThreshold,
          },
        },
      });

      console.log(`Found ${activeUsers.length} active users for sync`);

      for (const user of activeUsers) {
        try {
          await this.performSyncForUser(user.id);
        } catch (error) {
          console.error(`Error syncing user ${user.id}:`, error.message);
        }
      }

      console.log("Completed scheduled sync for all users");
    } catch (error) {
      console.error("Error in performSyncForAllUsers:", error);
    }
  }

  async performSyncForUser(userId) {
    try {
      console.log(`Syncing data for user ${userId}...`);

      const oauth2Client = await getOAuth2Client(userId);
      if (!oauth2Client) {
        console.log(`No OAuth client available for user ${userId}`);
        return;
      }

      // Fetch fresh data from Google APIs
      const [emails, events, tasks] = await Promise.all([
        this.fetchRecentEmails(oauth2Client),
        this.fetchUpcomingEvents(oauth2Client),
        this.fetchActiveTasks(oauth2Client),
      ]);

      console.log(
        `Fetched ${emails.length} emails, ${events.length} events, ${tasks.length} tasks for user ${userId}`
      );

      // Build relationship map and context
      const relationshipMap = buildRelationshipMap(emails, events, tasks);

      // Generate proactive suggestions
      const suggestions = await generateProactiveSuggestions({
        emails,
        events,
        tasks,
        relationshipMap,
        userId,
      });

      console.log(
        `Generated ${suggestions.length} proactive suggestions for user ${userId}`
      );

      // Store suggestions in database
      for (const suggestion of suggestions) {
        await ProactiveSuggestion.create({
          userId,
          type: suggestion.type,
          title: suggestion.title,
          context: suggestion.context,
          priority: suggestion.priority,
          sourceData: suggestion.sourceData,
          actionData: suggestion.actionData,
          status: "active",
        });
      }

      console.log(`Sync completed for user ${userId}`);
    } catch (error) {
      console.error(`Error syncing user ${userId}:`, error);
      throw error;
    }
  }

  async fetchRecentEmails(oauth2Client) {
    try {
      const gmail = google.gmail({ version: "v1", auth: oauth2Client });

      // Get emails from the last 24 hours
      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const query = `in:inbox after:${Math.floor(yesterday.getTime() / 1000)}`;

      const response = await gmail.users.messages.list({
        userId: "me",
        maxResults: 50,
        q: query,
      });

      if (!response.data.messages) return [];

      const emails = await Promise.all(
        response.data.messages.slice(0, 20).map(async (msg) => {
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

          return {
            id: msg.id,
            from: fromHeader,
            subject: subjectHeader,
            date: dateHeader,
            snippet: email.data.snippet,
            labels: email.data.labelIds || [],
            threadId: email.data.threadId,
            internalDate: email.data.internalDate,
          };
        })
      );

      return emails;
    } catch (error) {
      console.error("Error fetching recent emails:", error);
      return [];
    }
  }

  async fetchUpcomingEvents(oauth2Client) {
    try {
      const calendar = google.calendar({ version: "v3", auth: oauth2Client });

      const now = new Date();
      const oneWeekFromNow = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

      const response = await calendar.events.list({
        calendarId: "primary",
        timeMin: now.toISOString(),
        timeMax: oneWeekFromNow.toISOString(),
        maxResults: 50,
        singleEvents: true,
        orderBy: "startTime",
      });

      const events = response.data.items || [];

      return events.map((event) => ({
        id: event.id,
        summary: event.summary,
        start: event.start?.dateTime || event.start?.date,
        end: event.end?.dateTime || event.end?.date,
        location: event.location,
        attendees: event.attendees || [],
        organizer: event.organizer,
        description: event.description,
        status: event.status,
      }));
    } catch (error) {
      console.error("Error fetching upcoming events:", error);
      return [];
    }
  }

  async fetchActiveTasks(oauth2Client) {
    try {
      const tasks = google.tasks({ version: "v1", auth: oauth2Client });

      const response = await tasks.tasks.list({
        tasklist: "@default",
        maxResults: 50,
        showCompleted: false,
        showHidden: false,
      });

      const taskItems = response.data.items || [];

      return taskItems.map((task) => ({
        id: task.id,
        title: task.title,
        status: task.status,
        due: task.due,
        notes: task.notes,
        updated: task.updated,
        parent: task.parent,
      }));
    } catch (error) {
      console.error("Error fetching active tasks:", error);
      return [];
    }
  }

  // Configuration methods
  setSyncInterval(minutes) {
    this.syncIntervalMinutes = minutes;
    if (this.isRunning) {
      this.stop();
      this.start();
    }
  }

  getSyncInterval() {
    return this.syncIntervalMinutes;
  }

  getStatus() {
    return {
      isRunning: this.isRunning,
      intervalMinutes: this.syncIntervalMinutes,
      nextSyncAt: this.syncInterval
        ? new Date(Date.now() + this.syncIntervalMinutes * 60 * 1000)
        : null,
    };
  }
}

// Export singleton instance
const scheduledSyncService = new ScheduledSyncService();

module.exports = {
  scheduledSyncService,
  ScheduledSyncService,
};
