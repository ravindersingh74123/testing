const Meeting = require("../models/Meeting");

// Approve user to join meeting
exports.approveUserToJoin = async (req, res) => {
  const { meetingId, userId, socketId } = req.body;
  
  try {
    const meeting = await Meeting.findOne({ meetingId });
    if (!meeting) {
      return res.status(404).json({ message: "Meeting not found" });
    }
    
    // Remove from waiting room
    meeting.waitingRoom = meeting.waitingRoom.filter(
      (user) => user.userId.toString() !== userId
    );
    
    // Add to participants as approved
    const waitingUser = meeting.waitingRoom.find(
      (user) => user.userId.toString() === userId
    );
    
    if (waitingUser) {
      meeting.participants.push({
        socketId,
        userId: waitingUser.userId,
        userName: waitingUser.userName,
        email: waitingUser.email,
        status: "approved",
        permissions: {
          canUnmute: true,
          canToggleVideo: true,
          canScreenShare: false,
          canChat: true,
        },
      });
    }
    
    await meeting.save();
    res.json({ message: "User approved to join", meeting });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Reject user from joining
exports.rejectUserFromJoining = async (req, res) => {
  const { meetingId, userId } = req.body;
  
  try {
    const meeting = await Meeting.findOne({ meetingId });
    if (!meeting) {
      return res.status(404).json({ message: "Meeting not found" });
    }
    
    meeting.waitingRoom = meeting.waitingRoom.filter(
      (user) => user.userId.toString() !== userId
    );
    
    await meeting.save();
    res.json({ message: "User rejected from joining" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Toggle unmute permission for user
exports.toggleUnmutePermission = async (req, res) => {
  const { meetingId, userId } = req.body;
  
  try {
    const meeting = await Meeting.findOne({ meetingId });
    if (!meeting) {
      return res.status(404).json({ message: "Meeting not found" });
    }
    
    const participant = meeting.participants.find(
      (p) => p.userId.toString() === userId
    );
    
    if (participant) {
      participant.permissions.canUnmute = !participant.permissions.canUnmute;
      await meeting.save();
      res.json({ message: "Unmute permission toggled", participant });
    }
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Toggle video permission for user
exports.toggleVideoPermission = async (req, res) => {
  const { meetingId, userId } = req.body;
  
  try {
    const meeting = await Meeting.findOne({ meetingId });
    if (!meeting) {
      return res.status(404).json({ message: "Meeting not found" });
    }
    
    const participant = meeting.participants.find(
      (p) => p.userId.toString() === userId
    );
    
    if (participant) {
      participant.permissions.canToggleVideo = !participant.permissions.canToggleVideo;
      await meeting.save();
      res.json({ message: "Video permission toggled", participant });
    }
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Toggle screen share permission for user
exports.toggleScreenSharePermission = async (req, res) => {
  const { meetingId, userId } = req.body;
  
  try {
    const meeting = await Meeting.findOne({ meetingId });
    if (!meeting) {
      return res.status(404).json({ message: "Meeting not found" });
    }
    
    const participant = meeting.participants.find(
      (p) => p.userId.toString() === userId
    );
    
    if (participant) {
      participant.permissions.canScreenShare = !participant.permissions.canScreenShare;
      await meeting.save();
      res.json({ message: "Screen share permission toggled", participant });
    }
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Remove user from meeting
exports.removeUserFromMeeting = async (req, res) => {
  const { meetingId, userId } = req.body;
  
  try {
    const meeting = await Meeting.findOne({ meetingId });
    if (!meeting) {
      return res.status(404).json({ message: "Meeting not found" });
    }
    
    meeting.participants = meeting.participants.filter(
      (p) => p.userId.toString() !== userId
    );
    
    await meeting.save();
    res.json({ message: "User removed from meeting" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Get meeting participants
exports.getMeetingParticipants = async (req, res) => {
  const { meetingId } = req.params;
  
  try {
    const meeting = await Meeting.findOne({ meetingId });
    if (!meeting) {
      return res.status(404).json({ message: "Meeting not found" });
    }
    
    res.json({
      participants: meeting.participants,
      waitingRoom: meeting.waitingRoom,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};