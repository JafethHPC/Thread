const controller = require("../controllers/actionLog.controller");

module.exports = function (app) {
  app.get("/api/action-logs", controller.getLogs);
  app.post("/api/action-logs", controller.addLog);
};
