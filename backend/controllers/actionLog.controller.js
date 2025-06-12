const { addLog, getActionLogs } = require("../services/actionLog.service");

exports.getLogs = (req, res) => {
  res.json({ logs: getActionLogs() });
};

exports.addLog = (req, res) => {
  try {
    const { suggestionType, sourceItemIds = [] } = req.body || {};
    if (!suggestionType) {
      return res.status(400).json({ message: "suggestionType is required" });
    }
    addLog({ suggestionType, sourceItemIds, userConfirmed: true });
    res.json({ status: "ok" });
  } catch (err) {
    console.error("Error adding action log", err);
    res.status(500).json({ message: "Internal error" });
  }
};
