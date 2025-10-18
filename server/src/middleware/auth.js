// server/src/middleware/auth.js
const jwt = require("jsonwebtoken");
const Meeting = require("../models/Meeting");

// Verify JWT token
const verifyToken = (req, res, next) => {
  const token = req.headers.authorization?.split(" ")[1];
  
  if (!token) {
    return res.status(401).json({ message: "No token provided" });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded; // { id, email, name }
    next();
  } catch (err) {
    return res.status(401).json({ message: "Invalid token" });
  }
};

// Verify user is admin of the meeting
const verifyAdmin = async (req, res, next) => {
  try {
    const { meetingId } = req.params;
    const userId = req.user.id;

    const meeting = await Meeting.findOne({ meetingId });
    
    if (!meeting) {
      return res.status(404).json({ message: "Meeting not found" });
    }

    if (meeting.createdBy.toString() !== userId.toString()) {
      return res.status(403).json({ message: "Access denied. Admin only." });
    }

    req.meeting = meeting;
    next();
  } catch (err) {
    console.error("Error verifying admin:", err);
    return res.status(500).json({ message: "Server error" });
  }
};

module.exports = { verifyToken, verifyAdmin };