module.exports = (app) => {
  const ai = require("../controllers/ai.controller.js");
  const { verifySession } = require("../middleware/authJwt");

  var router = require("express").Router();

  // Process a user's message
  router.post("/chat", verifySession, ai.processMessage);

  app.use("/api/ai", router);
};
