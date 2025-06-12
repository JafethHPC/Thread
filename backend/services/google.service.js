const { google } = require("googleapis");
const db = require("../models");
const User = db.User;

const getOAuth2Client = async (userId) => {
  const user = await User.findByPk(userId);
  if (!user || !user.google_access_token) {
    throw new Error(
      "User not authenticated with Google or tokens are missing."
    );
  }

  const oauth2Client = new google.auth.OAuth2(
    process.env.VITE_GOOGLE_CLIENT_ID,
    process.env.VITE_GOOGLE_CLIENT_SECRET,
    process.env.VITE_GOOGLE_REDIRECT_URI
  );

  oauth2Client.setCredentials({
    access_token: user.google_access_token,
    refresh_token: user.google_refresh_token,
  });

  // The googleapis library will automatically use the refresh_token to get a new
  // access_token when it's expired. We can listen for the 'tokens' event to save
  // the new token if one is issued.
  oauth2Client.on("tokens", async (tokens) => {
    if (tokens.refresh_token) {
      // store the new tokens for next time
      user.google_refresh_token = tokens.refresh_token;
    }
    user.google_access_token = tokens.access_token;
    await user.save();
    console.log("Google tokens refreshed and saved for user:", user.id);
  });

  return oauth2Client;
};

module.exports = { getOAuth2Client };
