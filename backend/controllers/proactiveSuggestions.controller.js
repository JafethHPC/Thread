const db = require("../models");
const { ProactiveSuggestion } = db;
const {
  suggestionActionsService,
} = require("../services/suggestionActions.service");
const { scheduledSyncService } = require("../services/scheduledSync.service");

/**
 * Get active proactive suggestions for the current user
 */
exports.getSuggestions = async (req, res) => {
  try {
    const userId = req.session.userId;

    if (!userId) {
      return res.status(401).json({ message: "User not authenticated." });
    }

    const { priority, type, limit = 10 } = req.query;

    const whereClause = {
      userId,
      status: "active",
    };

    // Add optional filters
    if (priority) {
      whereClause.priority = priority;
    }

    if (type) {
      whereClause.type = type;
    }

    // Filter out expired suggestions
    const now = new Date();
    whereClause[db.Sequelize.Op.or] = [
      { expiresAt: null },
      { expiresAt: { [db.Sequelize.Op.gt]: now } },
    ];

    const suggestions = await ProactiveSuggestion.findAll({
      where: whereClause,
      order: [
        ["priority", "DESC"], // High priority first
        ["createdAt", "DESC"], // Most recent first
      ],
      limit: parseInt(limit),
    });

    res.json({
      suggestions,
      count: suggestions.length,
    });
  } catch (error) {
    console.error("Error fetching proactive suggestions:", error);
    res.status(500).json({
      message: "Error fetching suggestions",
      error: error.message,
    });
  }
};

/**
 * Take action on a suggestion (accept, dismiss, or execute)
 */
exports.takeSuggestionAction = async (req, res) => {
  try {
    const userId = req.session.userId;
    const { suggestionId } = req.params;
    const { action, userInput = {} } = req.body;

    if (!userId) {
      return res.status(401).json({ message: "User not authenticated." });
    }

    const suggestion = await ProactiveSuggestion.findOne({
      where: { id: suggestionId, userId },
    });

    if (!suggestion) {
      return res.status(404).json({ message: "Suggestion not found." });
    }

    let result = { success: true };

    switch (action) {
      case "accept":
        // Execute the suggested action
        result = await suggestionActionsService.executeSuggestionAction(
          userId,
          suggestion,
          userInput
        );

        if (result.success) {
          await suggestion.update({
            status: "accepted",
            actionTaken: { action, userInput, result },
            actionTakenAt: new Date(),
          });
        }
        break;

      case "dismiss":
        await suggestion.update({
          status: "dismissed",
          actionTaken: { action, reason: userInput.reason },
          actionTakenAt: new Date(),
        });
        break;

      case "snooze":
        // Snooze for specified duration (default 1 hour)
        const snoozeMinutes = userInput.minutes || 60;
        const newExpiresAt = new Date(Date.now() + snoozeMinutes * 60 * 1000);

        await suggestion.update({
          expiresAt: newExpiresAt,
          actionTaken: { action, snoozedUntil: newExpiresAt },
          actionTakenAt: new Date(),
        });
        break;

      case "edit":
        // User wants to edit the suggestion before executing
        if (userInput.editedData) {
          result = await suggestionActionsService.executeSuggestionAction(
            userId,
            {
              ...suggestion.toJSON(),
              actionData: { ...suggestion.actionData, ...userInput.editedData },
            },
            userInput
          );

          if (result.success) {
            await suggestion.update({
              status: "accepted",
              actionTaken: { action, editedData: userInput.editedData, result },
              actionTakenAt: new Date(),
            });
          }
        }
        break;

      default:
        return res.status(400).json({ message: "Invalid action." });
    }

    res.json({
      success: result.success,
      message: result.success
        ? "Action completed successfully"
        : "Action failed",
      result,
      suggestion: await suggestion.reload(),
    });
  } catch (error) {
    console.error("Error taking suggestion action:", error);
    res.status(500).json({
      message: "Error processing action",
      error: error.message,
    });
  }
};

/**
 * Get suggestion statistics for the user
 */
exports.getSuggestionStats = async (req, res) => {
  try {
    const userId = req.session.userId;

    if (!userId) {
      return res.status(401).json({ message: "User not authenticated." });
    }

    const { timeframe = "7d" } = req.query;

    // Calculate date range
    const now = new Date();
    let startDate;

    switch (timeframe) {
      case "1d":
        startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        break;
      case "7d":
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case "30d":
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      default:
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    }

    const whereClause = {
      userId,
      createdAt: {
        [db.Sequelize.Op.gte]: startDate,
      },
    };

    // Get total counts
    const totalGenerated = await ProactiveSuggestion.count({
      where: whereClause,
    });

    const totalAccepted = await ProactiveSuggestion.count({
      where: { ...whereClause, status: "accepted" },
    });

    const totalDismissed = await ProactiveSuggestion.count({
      where: { ...whereClause, status: "dismissed" },
    });

    // Get counts by type
    const byType = await ProactiveSuggestion.findAll({
      where: whereClause,
      attributes: [
        "type",
        [db.Sequelize.fn("COUNT", db.Sequelize.col("id")), "count"],
      ],
      group: ["type"],
    });

    // Get counts by priority
    const byPriority = await ProactiveSuggestion.findAll({
      where: whereClause,
      attributes: [
        "priority",
        [db.Sequelize.fn("COUNT", db.Sequelize.col("id")), "count"],
      ],
      group: ["priority"],
    });

    const acceptanceRate =
      totalGenerated > 0
        ? ((totalAccepted / totalGenerated) * 100).toFixed(1)
        : 0;

    res.json({
      timeframe,
      totalGenerated,
      totalAccepted,
      totalDismissed,
      acceptanceRate: parseFloat(acceptanceRate),
      byType: byType.reduce((acc, item) => {
        acc[item.type] = parseInt(item.dataValues.count);
        return acc;
      }, {}),
      byPriority: byPriority.reduce((acc, item) => {
        acc[item.priority] = parseInt(item.dataValues.count);
        return acc;
      }, {}),
    });
  } catch (error) {
    console.error("Error fetching suggestion stats:", error);
    res.status(500).json({
      message: "Error fetching statistics",
      error: error.message,
    });
  }
};

/**
 * Manually trigger a sync for the current user
 */
exports.triggerSync = async (req, res) => {
  try {
    const userId = req.session.userId;

    if (!userId) {
      return res.status(401).json({ message: "User not authenticated." });
    }

    // Trigger sync for this user
    await scheduledSyncService.performSyncForUser(userId);

    res.json({
      success: true,
      message: "Sync completed successfully",
    });
  } catch (error) {
    console.error("Error triggering sync:", error);
    res.status(500).json({
      message: "Error triggering sync",
      error: error.message,
    });
  }
};

/**
 * Get sync status and configuration
 */
exports.getSyncStatus = async (req, res) => {
  try {
    const status = scheduledSyncService.getStatus();

    res.json({
      ...status,
      lastSyncAt: null, // TODO: Track last sync time per user
      nextSyncIn: status.nextSyncAt
        ? Math.max(0, Math.floor((status.nextSyncAt - new Date()) / 1000 / 60))
        : null,
    });
  } catch (error) {
    console.error("Error getting sync status:", error);
    res.status(500).json({
      message: "Error getting sync status",
      error: error.message,
    });
  }
};

/**
 * Update sync configuration (admin only)
 */
exports.updateSyncConfig = async (req, res) => {
  try {
    const { intervalMinutes } = req.body;

    if (!intervalMinutes || intervalMinutes < 15 || intervalMinutes > 1440) {
      return res.status(400).json({
        message: "Interval must be between 15 minutes and 24 hours",
      });
    }

    scheduledSyncService.setSyncInterval(intervalMinutes);

    res.json({
      success: true,
      message: "Sync interval updated",
      newInterval: intervalMinutes,
    });
  } catch (error) {
    console.error("Error updating sync config:", error);
    res.status(500).json({
      message: "Error updating sync configuration",
      error: error.message,
    });
  }
};

/**
 * Generate draft content for a suggestion
 */
exports.generateDraft = async (req, res) => {
  try {
    const userId = req.session.userId;
    const { suggestionId } = req.params;

    if (!userId) {
      return res.status(401).json({ message: "User not authenticated." });
    }

    const suggestion = await ProactiveSuggestion.findOne({
      where: { id: suggestionId, userId },
    });

    if (!suggestion) {
      return res.status(404).json({ message: "Suggestion not found." });
    }

    const draft = await suggestionActionsService.generateDraftEmail(suggestion);

    res.json(draft);
  } catch (error) {
    console.error("Error generating draft:", error);
    res.status(500).json({
      message: "Error generating draft",
      error: error.message,
    });
  }
};

/**
 * Get suggested meeting times for scheduling suggestions
 */
exports.getSuggestedTimes = async (req, res) => {
  try {
    const userId = req.session.userId;
    const { duration = 30, daysAhead = 7 } = req.query;

    if (!userId) {
      return res.status(401).json({ message: "User not authenticated." });
    }

    const suggestions = await suggestionActionsService.suggestMeetingTimes(
      userId,
      parseInt(duration),
      parseInt(daysAhead)
    );

    res.json(suggestions);
  } catch (error) {
    console.error("Error getting suggested times:", error);
    res.status(500).json({
      message: "Error getting suggested times",
      error: error.message,
    });
  }
};
