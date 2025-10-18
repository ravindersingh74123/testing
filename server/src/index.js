// server/src/index.js
require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const http = require("http");
const meetingsRouter = require("./routes/meetingsRoutes");
const usersRouter = require("./routes/users");
const adminRouter = require("./routes/adminRoutes");
const socketHandler = require("./socket");

const app = express();
app.use(cors({ origin: process.env.FRONTEND_URL || "*" }));
app.use(express.json());

app.use("/api/users", usersRouter);
app.use("/api/meetings", meetingsRouter);
app.use("/api/admin", adminRouter);

// Handle unmatched routes
app.use((req, res) => res.status(404).json({ message: "Route not found" }));

const PORT = process.env.PORT || 5000;

// Create HTTP server for socket.io
const server = http.createServer(app);

// Attach socket.io to server
socketHandler(server);

mongoose
  .connect(process.env.MONGO_URI)
  .then(() => {
    console.log("Connected to MongoDB");
    server.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  })
  .catch((err) => {
    console.error("MongoDB connection error:", err.message);
    process.exit(1);
  });