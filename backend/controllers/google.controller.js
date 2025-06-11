const { google } = require("googleapis");
const db = require("../models");
const User = db.User;

// Simple OAuth2 client - no PKCE, no complications
const oauth2Client = new google.auth.OAuth2(
  process.env.VITE_GOOGLE_CLIENT_ID,
  process.env.VITE_GOOGLE_CLIENT_SECRET,
  "http://localhost:4200/google-auth-callback"
);

// Generate Google OAuth URL
const getAuthUrl = (req, res) => {
  const scopes = [
    "https://www.googleapis.com/auth/userinfo.email",
    "https://www.googleapis.com/auth/userinfo.profile",
    "https://www.googleapis.com/auth/gmail.readonly",
    "https://www.googleapis.com/auth/calendar.readonly",
    "https://www.googleapis.com/auth/tasks.readonly",
  ];

  const authUrl = oauth2Client.generateAuthUrl({
    access_type: "offline",
    scope: scopes,
    prompt: "consent",
  });

  res.json({ authUrl });
};

// Exchange code for tokens and link account
const exchangeCode = async (req, res) => {
  const { code } = req.body;

  if (!req.userId) {
    return res.status(401).json({ message: "User not authenticated" });
  }

  if (!code) {
    return res.status(400).json({ message: "Authorization code required" });
  }

  try {
    // Manual token exchange to avoid PKCE issues
    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id: process.env.VITE_GOOGLE_CLIENT_ID,
        client_secret: process.env.VITE_GOOGLE_CLIENT_SECRET,
        code: code,
        grant_type: "authorization_code",
        redirect_uri: "http://localhost:4200/google-auth-callback",
      }).toString(),
    });

    const tokens = await response.json();

    if (!response.ok) {
      throw new Error(
        `Token exchange failed: ${tokens.error_description || tokens.error}`
      );
    }

    // Get user info from Google using the access token
    const userInfoResponse = await fetch(
      "https://www.googleapis.com/oauth2/v2/userinfo",
      {
        headers: {
          Authorization: `Bearer ${tokens.access_token}`,
        },
      }
    );

    const googleUser = await userInfoResponse.json();

    if (!userInfoResponse.ok) {
      throw new Error("Failed to get user info from Google");
    }

    // Update user with Google tokens
    const user = await User.findByPk(req.userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    user.google_access_token = tokens.access_token;
    if (tokens.refresh_token) {
      user.google_refresh_token = tokens.refresh_token;
    }
    if (googleUser.picture) {
      user.profile_picture = googleUser.picture;
    }

    await user.save();

    res.json({
      message: "Google account connected successfully",
      googleEmail: googleUser.email,
    });
  } catch (error) {
    console.error("Google OAuth error:", error);
    res.status(500).json({ message: "Failed to connect Google account" });
  }
};

// Check if Google account is connected
const getStatus = async (req, res) => {
  if (!req.userId) {
    return res.status(401).json({ isConnected: false });
  }

  try {
    const user = await User.findByPk(req.userId);
    res.json({
      isConnected: !!(user && user.google_access_token),
    });
  } catch (error) {
    console.error("Error checking Google status:", error);
    res.status(500).json({ isConnected: false });
  }
};

// Disconnect Google account
const disconnect = async (req, res) => {
  if (!req.userId) {
    return res.status(401).json({ message: "User not authenticated" });
  }

  try {
    const user = await User.findByPk(req.userId);
    if (user) {
      user.google_access_token = null;
      user.google_refresh_token = null;
      await user.save();
    }

    res.json({ message: "Google account disconnected" });
  } catch (error) {
    console.error("Error disconnecting Google:", error);
    res.status(500).json({ message: "Failed to disconnect Google account" });
  }
};

module.exports = {
  getAuthUrl,
  exchangeCode,
  getStatus,
  disconnect,
};
