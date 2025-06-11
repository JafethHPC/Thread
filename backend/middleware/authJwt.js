const jwt = require("jsonwebtoken");
const config = require("../config/auth.config.js");
const db = require("../models");
const User = db.User;

verifyToken = (req, res, next) => {
  let token = req.headers["x-access-token"];

  if (!token) {
    return res.status(403).send({
      message: "No token provided!",
    });
  }

  jwt.verify(token, config.secret, (err, decoded) => {
    if (err) {
      return res.status(401).send({
        message: "Unauthorized!",
      });
    }
    req.userId = decoded.id;
    next();
  });
};

// Session-based authentication middleware
verifySession = (req, res, next) => {
  console.log("=== Session Debug Info ===");
  console.log("Session ID:", req.sessionID);
  console.log("Session data:", req.session);
  console.log("Session userId:", req.session.userId);
  console.log("========================");

  if (!req.session.userId) {
    return res.status(401).send({
      message: "Not authenticated",
    });
  }
  req.userId = req.session.userId;
  next();
};

const authJwt = {
  verifyToken: verifyToken,
  verifySession: verifySession,
};
module.exports = authJwt;
