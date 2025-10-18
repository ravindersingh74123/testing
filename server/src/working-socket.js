const { Server } = require("socket.io");
const Meeting = require("./models/Meeting");
const ChatMessage = require("./models/ChatMessage");

module.exports = (server) => {
  const io = new Server(server, {
    cors: {
      origin: process.env.FRONTEND_URL || "*",
      methods: ["GET", "POST"],
    },
    pingTimeout: 60000,
    pingInterval: 25000,
  });

  // Store meeting rooms in memory for better tracking
  const meetingRooms = new Map();

  io.on("connection", (socket) => {
    console.log("User connected:", socket.id);

    let currentMeeting = null;
    let currentUser = null;

    // Join meeting
    socket.on("join-meeting", async ({ meetingId, user }) => {
      console.log(`User ${user.name} (${socket.id}) joining meeting ${meetingId}`);
      
      // Clean up previous meeting if exists
      if (currentMeeting && currentMeeting !== meetingId) {
        handleUserLeave(socket, currentMeeting);
      }

      socket.join(meetingId);
      socket.user = user;
      socket.meetingId = meetingId;
      currentMeeting = meetingId;
      currentUser = user;

      // Initialize room if it doesn't exist
      if (!meetingRooms.has(meetingId)) {
        meetingRooms.set(meetingId, new Map());
      }

      const room = meetingRooms.get(meetingId);
      
      // Add/update user in room
      room.set(socket.id, { socketId: socket.id, user });

      // Send previous chat messages to this user
      try {
        const messages = await ChatMessage.find({ meetingId }).sort({
          timestamp: 1,
        });
        console.log(`Sending ${messages.length} chat messages to ${user.name}`);
        socket.emit("chat-history", messages);
      } catch (err) {
        console.error("Error fetching chat messages:", err);
      }

      // Get current participants from our Map (more reliable than socket.io rooms)
      const participants = Array.from(room.values());
      
      console.log(`Meeting ${meetingId} participants:`, participants.length, participants.map(p => p.user?.name));

      // Send list of OTHER participants to the new user
      const otherParticipants = participants.filter(p => p.socketId !== socket.id);
      socket.emit("meeting-participants", otherParticipants);

      // Notify existing participants about the new user
      socket.to(meetingId).emit("user-joined", { 
        socketId: socket.id, 
        user: user 
      });

      console.log(`Meeting ${meetingId} now has ${room.size} participants`);
    });

    // Explicit leave meeting
    socket.on("leave-meeting", ({ meetingId }) => {
      console.log(`User ${socket.id} explicitly leaving meeting ${meetingId}`);
      handleUserLeave(socket, meetingId);
    });

    // Chat message
    socket.on("chat-message", async ({ meetingId, message, user }) => {
      console.log("Received chat-message:", { meetingId, message, user });

      if (!meetingId) {
        console.error("No meetingId provided in chat-message event");
        return;
      }

      if (!user || !user._id) {
        console.error("User or user._id is missing:", user);
        return;
      }

      const timestamp = Date.now();

      // Save message to DB
      try {
        const chatMsg = new ChatMessage({
          meetingId: meetingId,
          user: {
            _id: user._id,
            name: user.name,
          },
          message: message,
          timestamp: timestamp,
        });
        await chatMsg.save();
        console.log("Chat message saved to DB successfully!");
      } catch (err) {
        console.error("Error saving chat message:", err);
      }

      // Emit message to all participants in the meeting
      io.to(meetingId).emit("chat-message", { message, user, timestamp });
    });

    // WebRTC signaling events
    socket.on("webrtc-offer", ({ to, sdp, fromUser }) => {
      console.log(`Relaying WebRTC offer from ${socket.id} to ${to}`);
      io.to(to).emit("webrtc-offer", { 
        from: socket.id, 
        sdp,
        fromUser 
      });
    });

    socket.on("webrtc-answer", ({ to, sdp }) => {
      console.log(`Relaying WebRTC answer from ${socket.id} to ${to}`);
      io.to(to).emit("webrtc-answer", { 
        from: socket.id, 
        sdp 
      });
    });

    socket.on("ice-candidate", ({ to, candidate }) => {
      io.to(to).emit("ice-candidate", { 
        from: socket.id, 
        candidate 
      });
    });

    // Handle disconnection
    socket.on("disconnect", () => {
      console.log("User disconnected:", socket.id);
      
      if (currentMeeting) {
        handleUserLeave(socket, currentMeeting);
      }
    });

    // Helper function to handle user leaving
    function handleUserLeave(socket, meetingId) {
      const room = meetingRooms.get(meetingId);
      
      if (room) {
        const hadUser = room.has(socket.id);
        room.delete(socket.id);
        
        if (hadUser) {
          console.log(`User ${socket.id} left meeting ${meetingId}`);

          // Notify others about user leaving
          socket.to(meetingId).emit("user-left", {
            socketId: socket.id,
          });

          // Clean up empty rooms
          if (room.size === 0) {
            meetingRooms.delete(meetingId);
            console.log(`Meeting ${meetingId} is now empty and removed from memory`);
          } else {
            console.log(`Meeting ${meetingId} now has ${room.size} participants`);
          }
        }
      }

      // Leave the socket.io room
      socket.leave(meetingId);
      
      // Clear current meeting tracking
      if (currentMeeting === meetingId) {
        currentMeeting = null;
        currentUser = null;
      }
    }
  });

  // Optional: Clean up stale meetings periodically
  setInterval(() => {
    for (const [meetingId, room] of meetingRooms.entries()) {
      if (room.size === 0) {
        meetingRooms.delete(meetingId);
        console.log(`Cleaned up empty meeting: ${meetingId}`);
      }
    }
  }, 60000); // Every minute

  return io;
};