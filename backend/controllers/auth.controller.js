require("dotenv").config();
const db = require("../models");
const config = require("../config/auth.config");
const User = db.User;

const Op = db.Sequelize.Op;

var jwt = require("jsonwebtoken");
var bcrypt = require("bcryptjs");

exports.signup = (req, res) => {
  // Save User to Database
  User.create({
    name: req.body.name,
    email: req.body.email,
    password: bcrypt.hashSync(req.body.password, 8),
  })
    .then((user) => {
      res.send({ message: "User was registered successfully!" });
    })
    .catch((err) => {
      res.status(500).send({ message: err.message });
    });
};

exports.signin = (req, res) => {
  User.findOne({
    where: {
      email: req.body.email,
    },
  })
    .then((user) => {
      if (!user) {
        return res.status(404).send({ message: "User Not found." });
      }

      var passwordIsValid = bcrypt.compareSync(
        req.body.password,
        user.password
      );

      if (!passwordIsValid) {
        return res.status(401).send({
          accessToken: null,
          message: "Invalid Password!",
        });
      }

      var token = jwt.sign({ id: user.id }, config.secret, {
        expiresIn: 86400, // 24 hours
      });

      req.session.token = token;
      req.session.userId = user.id;

      console.log("=== Signin Session Save ===");
      console.log("Setting session userId:", user.id);
      console.log("Session ID:", req.sessionID);
      console.log("Session before save:", req.session);
      console.log("========================");

      req.session.save((err) => {
        if (err) {
          console.error("Session save error:", err);
          return res.status(500).send({ message: "Error saving session" });
        }
        console.log("Session saved successfully");
        res.status(200).send({
          id: user.id,
          name: user.name,
          email: user.email,
          profilePicture: user.profile_picture,
          accessToken: token,
        });
      });
    })
    .catch((err) => {
      res.status(500).send({ message: err.message });
    });
};

exports.disconnectGoogle = async (req, res) => {
  try {
    const user = await User.findByPk(req.userId);
    if (!user) {
      return res.status(404).send({ message: "User not found." });
    }

    if (!user.google_access_token && !user.google_refresh_token) {
      return res.status(400).send({ message: "Google account not connected." });
    }

    // Optionally revoke the token with Google
    if (user.google_access_token) {
      try {
        await fetch(
          `https://oauth2.googleapis.com/revoke?token=${user.google_access_token}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/x-www-form-urlencoded",
            },
          }
        );
      } catch (error) {
        console.log(
          "Failed to revoke Google token, continuing with local cleanup:",
          error
        );
      }
    }

    // Clear Google tokens and profile picture
    user.google_access_token = null;
    user.google_refresh_token = null;
    user.profile_picture = null;
    await user.save();

    console.log("Google account disconnected for user:", user.id);

    res.status(200).send({
      message: "Google account disconnected successfully.",
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        profilePicture: null,
      },
    });
  } catch (error) {
    console.error("Error disconnecting Google account:", error);
    res.status(500).send({ message: "Error disconnecting Google account." });
  }
};

exports.changePassword = async (req, res) => {
  try {
    const user = await User.findByPk(req.userId);
    if (!user) {
      return res.status(404).send({ message: "User not found." });
    }

    const passwordIsValid = bcrypt.compareSync(
      req.body.currentPassword,
      user.password
    );

    if (!passwordIsValid) {
      return res.status(401).send({ message: "Invalid Current Password!" });
    }

    if (req.body.newPassword) {
      user.password = bcrypt.hashSync(req.body.newPassword, 8);
    }

    await user.save();

    res.send({ message: "Password was updated successfully!" });
  } catch (error) {
    console.error("Error changing password:", error);
    res.status(500).send({ message: "Error changing password." });
  }
};

exports.getProfile = async (req, res) => {
  try {
    // User authentication is already verified by middleware, req.userId is available
    const user = await User.findByPk(req.userId);
    if (!user) {
      return res.status(404).send({ message: "User not found." });
    }
    res.status(200).send({
      id: user.id,
      name: user.name,
      email: user.email,
      profilePicture: user.profile_picture,
    });
  } catch (error) {
    console.error("Error fetching user profile:", error);
    res.status(500).send({ message: "Error fetching user profile" });
  }
};
