const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const db = require("./models");
const session = require("express-session");
const app = express();

dotenv.config();

const sessionStore = new session.MemoryStore();

app.use(
  cors({
    origin: "http://localhost:4200",
    credentials: true,
  })
);

app.use(
  session({
    secret: process.env.JWT_SECRET || "a-very-secret-key-for-session",
    resave: false,
    saveUninitialized: false,
    store: sessionStore,
    cookie: {
      secure: false,
      httpOnly: true,
      sameSite: "lax",
    },
  })
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use((req, res, next) => {
  console.log(`--> ${req.method} ${req.path}`);
  console.log("Session ID:", req.sessionID);
  console.log("Session data:", req.session);
  next();
});

app.get("/", (req, res) => {
  res.json({ message: "Welcome to the application." });
});

require("./routes/item.routes")(app);
require("./routes/auth.routes")(app);
require("./routes/conversation.routes")(app);
require("./routes/google.routes")(app);
require("./routes/ai.routes")(app);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}.`);
});

db.sequelize.sync();
