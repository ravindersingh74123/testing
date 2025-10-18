// server/src/routes/adminRoutes.js
const express = require("express");
const router = express.Router();
const Meeting = require("../models/Meeting");
const { verifyToken, verifyAdmin } = require("../middleware/auth");

// All admin routes require authentication
router.use(verifyToken);

// Update meeting settings
router.patch("/:meetingId/settings", verifyAdmin, async (req, res) => {
  try {
    const { settings } = req.body;
    const meeting = req.meeting;

    // Update settings
    if (settings) {
      Object.assign(meeting.settings, settings);
      await meeting.save();
    }

    res.json({ 
      message: "Settings updated", 
      settings: meeting.settings 
    });
  } catch (err) {
    console.error("Error updating settings:", err);
    res.status(500).json({ message: "Failed to update settings" });
  }
});

// Get waiting room participants
router.get("/:meetingId/waiting", verifyAdmin, async (req, res) => {
  try {
    const meeting = req.meeting;
    const waiting = meeting.participants.filter(p => p.status === 'waiting');
    
    res.json({ participants: waiting });
  } catch (err) {
    console.error("Error fetching waiting participants:", err);
    res.status(500).json({ message: "Failed to fetch waiting participants" });
  }
});

// Admit participant
router.post("/:meetingId/admit/:userId", verifyAdmin, async (req, res) => {
  try {
    const { userId } = req.params;
    const meeting = req.meeting;

    const participant = meeting.participants.find(
      p => p.userId.toString() === userId
    );

    if (!participant) {
      return res.status(404).json({ message: "Participant not found" });
    }

    participant.status = 'admitted';
    await meeting.save();

    res.json({ 
      message: "Participant admitted", 
      participant 
    });
  } catch (err) {
    console.error("Error admitting participant:", err);
    res.status(500).json({ message: "Failed to admit participant" });
  }
});

// Deny participant
router.post("/:meetingId/deny/:userId", verifyAdmin, async (req, res) => {
  try {
    const { userId } = req.params;
    const meeting = req.meeting;

    const participant = meeting.participants.find(
      p => p.userId.toString() === userId
    );

    if (!participant) {
      return res.status(404).json({ message: "Participant not found" });
    }

    participant.status = 'denied';
    await meeting.save();

    res.json({ 
      message: "Participant denied", 
      participant 
    });
  } catch (err) {
    console.error("Error denying participant:", err);
    res.status(500).json({ message: "Failed to deny participant" });
  }
});

// Update participant permissions
router.patch("/:meetingId/permissions/:userId", verifyAdmin, async (req, res) => {
  try {
    const { userId } = req.params;
    const { permissions } = req.body;
    const meeting = req.meeting;

    const participant = meeting.participants.find(
      p => p.userId.toString() === userId
    );

    if (!participant) {
      return res.status(404).json({ message: "Participant not found" });
    }

    // Update permissions
    Object.assign(participant.permissions, permissions);
    await meeting.save();

    res.json({ 
      message: "Permissions updated", 
      participant 
    });
  } catch (err) {
    console.error("Error updating permissions:", err);
    res.status(500).json({ message: "Failed to update permissions" });
  }
});

// Remove participant from meeting
router.delete("/:meetingId/participants/:userId", verifyAdmin, async (req, res) => {
  try {
    const { userId } = req.params;
    const meeting = req.meeting;

    meeting.participants = meeting.participants.filter(
      p => p.userId.toString() !== userId
    );
    
    await meeting.save();

    res.json({ message: "Participant removed" });
  } catch (err) {
    console.error("Error removing participant:", err);
    res.status(500).json({ message: "Failed to remove participant" });
  }
});

module.exports = router;