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

  app.get("/api/conversations", [authJwt.verifyToken], controller.findAll);

  app.get("/api/conversations/:id", [authJwt.verifyToken], controller.findOne);
};
