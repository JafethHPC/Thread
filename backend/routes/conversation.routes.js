const { authJwt } = require("../middleware");
const controller = require("../controllers/conversation.controller");

module.exports = function (app) {
  app.use(function (req, res, next) {
    res.header(
      "Access-Control-Allow-Headers",
      "x-access-token, Origin, Content-Type, Accept"
    );
    next();
  });

  app.get(
    "/api/conversations",
    [authJwt.verifyToken],
    controller.getConversations
  );

  app.get(
    "/api/conversations/:id",
    [authJwt.verifyToken],
    controller.getConversationById
  );

  app.delete(
    "/api/conversations/:id",
    [authJwt.verifyToken],
    controller.deleteConversation
  );

  app.delete(
    "/api/conversations",
    [authJwt.verifyToken],
    controller.deleteAllConversations
  );
};
