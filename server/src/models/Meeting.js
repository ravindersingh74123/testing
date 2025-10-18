// const mongoose = require("mongoose");

// const meetingSchema = new mongoose.Schema({
//   meetingId: { type: String, required: true, unique: true },
//   createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
//   createdAt: { type: Date, default: Date.now },
// });

// module.exports = mongoose.model("Meeting", meetingSchema);





// const mongoose = require("mongoose");

// const meetingSchema = new mongoose.Schema({
//   meetingId: { type: String, required: true, unique: true },
//   createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
//   createdAt: { type: Date, default: Date.now },
  
//   // NEW: Admin settings
//   adminSettings: {
//     muteAllOnEntry: { type: Boolean, default: false },
//     screenShareEnabled: { type: Boolean, default: true },
//     requireApprovalToJoin: { type: Boolean, default: false },
//   },
  
//   // NEW: Participant permissions
//   participants: [{
//     socketId: { type: String },
//     userId: { type: mongoose.Schema.Types.ObjectId },
//     userName: { type: String },
//     email: { type: String },
//     status: { 
//       type: String, 
//       enum: ['pending', 'approved', 'rejected', 'active'], 
//       default: 'active' 
//     },
//     permissions: {
//       canUnmute: { type: Boolean, default: true },
//       canToggleVideo: { type: Boolean, default: true },
//       canScreenShare: { type: Boolean, default: false },
//       canChat: { type: Boolean, default: true },
//     },
//     joinedAt: { type: Date, default: Date.now },
//   }],
  
//   // NEW: Track waiting room
//   waitingRoom: [{
//     socketId: { type: String },
//     userId: { type: mongoose.Schema.Types.ObjectId },
//     userName: { type: String },
//     email: { type: String },
//     requestedAt: { type: Date, default: Date.now },
//   }],
// });

// module.exports = mongoose.model("Meeting", meetingSchema);


const mongoose = require("mongoose");

const participantSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  name: { type: String, required: true },
  joinedAt: { type: Date, default: Date.now },
  permissions: {
    canUnmute: { type: Boolean, default: true },
    canVideo: { type: Boolean, default: true },
    canScreenShare: { type: Boolean, default: false },
  },
  status: { 
    type: String, 
    enum: ['waiting', 'admitted', 'denied'], 
    default: 'admitted' 
  }
}, { _id: false });

const meetingSchema = new mongoose.Schema({
  meetingId: { type: String, required: true, unique: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  createdAt: { type: Date, default: Date.now },
  
  // Admin settings
  settings: {
    requireAdmission: { type: Boolean, default: false },
    muteMicOnEntry: { type: Boolean, default: false },
    disableVideoOnEntry: { type: Boolean, default: false },
    allowScreenShare: { type: Boolean, default: true }, // Allow anyone to screen share by default
  },
  
  // Track participants
  participants: [participantSchema],
});

// Helper method to check if user is admin
meetingSchema.methods.isAdmin = function(userId) {
  return this.createdBy.toString() === userId.toString();
};

// Helper method to get participant permissions
meetingSchema.methods.getParticipantPermissions = function(userId) {
  const participant = this.participants.find(
    p => p.userId.toString() === userId.toString()
  );
  return participant ? participant.permissions : null;
};

module.exports = mongoose.model("Meeting", meetingSchema);