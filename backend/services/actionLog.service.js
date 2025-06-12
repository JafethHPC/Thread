// Simple in-memory action log – suitable for prototyping / local sessions.
// A production implementation should persist this to a DB.

const logs = [];

function addLog({ suggestionType, sourceItemIds = [], userConfirmed }) {
  logs.push({
    id: logs.length + 1,
    timestamp: new Date().toISOString(),
    suggestionType,
    sourceItemIds,
    userConfirmed: !!userConfirmed,
  });
}

function getActionLogs() {
  // Return newest first
  return [...logs].reverse();
}

module.exports = {
  addLog,
  getActionLogs,
};
