module.exports = (app) => {
  const google = require("../controllers/google.controller.js");
  const { authJwt } = require("../middleware");

  var router = require("express").Router();

  // Redirect to Google's consent screen
  router.get("/auth", [authJwt.verifySession], google.getAuthUrl);

  // Exchange authorization code for tokens (frontend callback)
  router.post("/exchange-code", [authJwt.verifySession], google.exchangeCode);

  // Routes for settings page
  router.get("/status", [authJwt.verifySession], google.getStatus);
  router.post("/disconnect", [authJwt.verifySession], google.disconnect);

  app.use("/api/google", router);
};
