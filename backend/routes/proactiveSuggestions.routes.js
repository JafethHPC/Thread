const proactiveSuggestionsController = require("../controllers/proactiveSuggestions.controller");

module.exports = function (app) {
  app.use(function (req, res, next) {
    res.header(
      "Access-Control-Allow-Headers",
      "x-access-token, Origin, Content-Type, Accept"
    );
    next();
  });

  // Get active suggestions for the current user
  app.get(
    "/api/proactive-suggestions",
    proactiveSuggestionsController.getSuggestions
  );

  // Take action on a suggestion (accept, dismiss, snooze, edit)
  app.post(
    "/api/proactive-suggestions/:suggestionId/action",
    proactiveSuggestionsController.takeSuggestionAction
  );

  // Get suggestion statistics
  app.get(
    "/api/proactive-suggestions/stats",
    proactiveSuggestionsController.getSuggestionStats
  );

  // Manually trigger a sync
  app.post(
    "/api/proactive-suggestions/sync",
    proactiveSuggestionsController.triggerSync
  );

  // Get sync status
  app.get(
    "/api/proactive-suggestions/sync/status",
    proactiveSuggestionsController.getSyncStatus
  );

  // Update sync configuration (admin only)
  app.put(
    "/api/proactive-suggestions/sync/config",
    proactiveSuggestionsController.updateSyncConfig
  );

  // Generate draft content for a suggestion
  app.get(
    "/api/proactive-suggestions/:suggestionId/draft",
    proactiveSuggestionsController.generateDraft
  );

  // Get suggested meeting times
  app.get(
    "/api/proactive-suggestions/meeting-times",
    proactiveSuggestionsController.getSuggestedTimes
  );
};
