require("dotenv").config();

module.exports = {
  secret: process.env.JWT_SECRET || "your-fallback-secret-key",
};
