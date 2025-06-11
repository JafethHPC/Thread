const controller = require("../controllers/auth.controller");
const { authJwt } = require("../middleware");

module.exports = function (app) {
  app.use(function (req, res, next) {
    res.header(
      "Access-Control-Allow-Headers",
      "x-access-token, Origin, Content-Type, Accept"
    );
    next();
  });

  app.post("/api/auth/signup", controller.signup);

  app.post("/api/auth/signin", controller.signin);

  app.delete(
    "/api/auth/google/disconnect",
    [authJwt.verifySession],
    controller.disconnectGoogle
  );

  app.put(
    "/api/auth/change-password",
    [authJwt.verifySession],
    controller.changePassword
  );

  app.get("/api/auth/profile", [authJwt.verifySession], controller.getProfile);
};
