// server/src/socket.js
// server/src/socket.js
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

  const meetingRooms = new Map();
  const admittedParticipants = new Map();

  io.on("connection", (socket) => {
    console.log("✅ [CONNECTION] User connected:", socket.id);

    socket.on("join-meeting", async ({ meetingId, user }) => {
      console.log(`\n🚀 [JOIN-MEETING] ${user.name} (${socket.id}) joining ${meetingId}`);
      
      try {
        const meeting = await Meeting.findOne({ meetingId });
        
        if (!meeting) {
          console.log(`❌ [ERROR] Meeting ${meetingId} not found`);
          socket.emit("join-error", { message: "Meeting not found" });
          return;
        }

        const userId = user._id || user.id;
        const isAdmin = meeting.isAdmin(userId);
        console.log(`👤 [USER] ${user.name}, ID: ${userId}, IsAdmin: ${isAdmin}`);

        // ALWAYS join the socket.io room first
        socket.join(meetingId);
        socket.user = user;
        socket.meetingId = meetingId;
        socket.userId = userId;
        socket.isAdmin = isAdmin;

        // Initialize room tracking
        if (!meetingRooms.has(meetingId)) {
          console.log(`📦 [INIT] Creating room for ${meetingId}`);
          meetingRooms.set(meetingId, new Map());
          admittedParticipants.set(meetingId, new Set());
        }

        const room = meetingRooms.get(meetingId);
        const admitted = admittedParticipants.get(meetingId);

        // Add to room tracking immediately
        room.set(socket.id, { 
          socketId: socket.id, 
          user,
          userId,
          isAdmin,
          status: 'pending'
        });

        console.log(`📊 [ROOM] Current size: ${room.size}`);

        // --- ADMIN FLOW ---
        if (isAdmin) {
          console.log(`👑 [ADMIN] Admin joining`);
          
          let participant = meeting.participants.find(
            p => p.userId.toString() === userId.toString()
          );

          if (!participant) {
            meeting.participants.push({
              userId: userId,
              name: user.name,
              status: 'admitted',
              permissions: {
                canUnmute: true,
                canVideo: true,
                canScreenShare: true,
              }
            });
            await meeting.save();
            participant = meeting.participants[meeting.participants.length - 1];
          } else {
            participant.status = 'admitted';
            participant.permissions = {
              canUnmute: true,
              canVideo: true,
              canScreenShare: true,
            };
            await meeting.save();
          }

          room.get(socket.id).status = 'admitted';
          room.get(socket.id).permissions = participant.permissions;
          admitted.add(socket.id);

          console.log(`✅ [ADMIN] Admin admitted, sending meeting-joined`);
          socket.emit("meeting-joined", {
            isAdmin: true,
            permissions: participant.permissions,
            settings: meeting.settings
          });

          // Send chat history
          const messages = await ChatMessage.find({ meetingId }).sort({ timestamp: 1 });
          socket.emit("chat-history", messages);

          // Get list of OTHER admitted participants
          const otherAdmitted = Array.from(room.values()).filter(p => 
            admitted.has(p.socketId) && p.socketId !== socket.id
          );
          console.log(`👥 [ADMIN] Sending ${otherAdmitted.length} existing participants`);
          socket.emit("meeting-participants", otherAdmitted);

          // Get current waiting room users from room tracking
          const waiting = Array.from(room.values()).filter(p => p.status === 'waiting');
          console.log(`⏳ [ADMIN] Current waiting room: ${waiting.length} users`);
          
          // Send each waiting user as a separate admission request
          waiting.forEach(w => {
            console.log(`   -> Sending admission-request for ${w.user.name} (${w.socketId})`);
            socket.emit("admission-request", {
              userId: w.userId,
              name: w.user.name,
              socketId: w.socketId
            });
          });

          // Notify other admitted participants that admin joined
          socket.to(meetingId).emit("user-joined", { 
            socketId: socket.id, 
            user,
            permissions: participant.permissions,
            isAdmin: true
          });

          console.log(`✅ [ADMIN-COMPLETE] Admin join complete\n`);
          return;
        }

        // --- REGULAR USER FLOW ---
        console.log(`👤 [USER] Regular user joining`);
        
        // Check if admission is required
        if (meeting.settings.requireAdmission) {
          console.log(`🚪 [ADMISSION] Admission required`);
          
          let participant = meeting.participants.find(
            p => p.userId.toString() === userId.toString()
          );

          // Create participant if doesn't exist
          if (!participant) {
            console.log(`➕ [DB] Adding participant to database`);
            meeting.participants.push({
              userId: userId,
              name: user.name,
              status: 'waiting',
              permissions: {
                canUnmute: !meeting.settings.muteMicOnEntry,
                canVideo: !meeting.settings.disableVideoOnEntry,
                canScreenShare: false,
              }
            });
            await meeting.save();
            participant = meeting.participants[meeting.participants.length - 1];
          }

          console.log(`📋 [STATUS] Participant status: ${participant.status}`);

          // Check current status
          if (participant.status === 'waiting') {
            console.log(`⏳ [WAITING] Placing in waiting room`);
            
            room.get(socket.id).status = 'waiting';
            room.get(socket.id).permissions = participant.permissions;
            
            socket.emit("waiting-room");

            // FIX: Notify ALL sockets in the meeting room (not just admin flag check)
            console.log(`📢 [NOTIFY] Broadcasting admission request to meeting room`);
            const requestData = {
              userId: userId,
              name: user.name,
              socketId: socket.id
            };
            
            // Emit to all OTHER sockets in the room (admins will receive it)
            socket.to(meetingId).emit("admission-request", requestData);
            
            // Also log for debugging
            let adminCount = 0;
            for (const [sid, data] of room.entries()) {
              if (data.isAdmin) {
                adminCount++;
                console.log(`   -> Admin socket in room: ${sid}`);
              }
            }
            console.log(`📢 [NOTIFY-COMPLETE] Broadcasted to ${room.size - 1} sockets, ${adminCount} admin(s)\n`);
            return;
          }
          
          if (participant.status === 'denied') {
            console.log(`🚫 [DENIED] Access denied`);
            socket.emit("admission-denied");
            room.delete(socket.id);
            socket.leave(meetingId);
            return;
          }

          // Status is 'admitted' - proceed
          console.log(`✅ [ADMITTED] User already admitted`);
          room.get(socket.id).status = 'admitted';
          room.get(socket.id).permissions = participant.permissions;
          admitted.add(socket.id);
        } else {
          // No admission required - auto-admit
          console.log(`✅ [AUTO-ADMIT] No admission required`);
          
          let participant = meeting.participants.find(
            p => p.userId.toString() === userId.toString()
          );

          if (!participant) {
            meeting.participants.push({
              userId: userId,
              name: user.name,
              status: 'admitted',
              permissions: {
                canUnmute: !meeting.settings.muteMicOnEntry,
                canVideo: !meeting.settings.disableVideoOnEntry,
                canScreenShare: meeting.settings.allowScreenShare,
              }
            });
            await meeting.save();
            participant = meeting.participants[meeting.participants.length - 1];
          } else {
            participant.status = 'admitted';
            await meeting.save();
          }

          room.get(socket.id).status = 'admitted';
          room.get(socket.id).permissions = participant.permissions;
          admitted.add(socket.id);
        }

        // User is admitted - complete the join
        const roomData = room.get(socket.id);
        console.log(`📝 [PERMISSIONS] ${user.name}:`, roomData.permissions);

        socket.emit("meeting-joined", {
          isAdmin: false,
          permissions: roomData.permissions,
          settings: meeting.settings
        });

        // Send chat history
        const messages = await ChatMessage.find({ meetingId }).sort({ timestamp: 1 });
        socket.emit("chat-history", messages);

        // Get list of OTHER admitted participants
        const otherAdmitted = Array.from(room.values()).filter(p => 
          admitted.has(p.socketId) && p.socketId !== socket.id
        );
        console.log(`👥 [PARTICIPANTS] Sending ${otherAdmitted.length} participants`);
        socket.emit("meeting-participants", otherAdmitted);

        // Notify others that user joined
        console.log(`📢 [BROADCAST] Notifying others of join`);
        socket.to(meetingId).emit("user-joined", { 
          socketId: socket.id, 
          user,
          permissions: roomData.permissions,
          isAdmin: false
        });

        console.log(`✅ [JOIN-COMPLETE] User join complete\n`);

      } catch (err) {
        console.error("❌ [ERROR] Join error:", err);
        socket.emit("join-error", { message: "Failed to join meeting" });
      }
    });

    // Admin admits user
    socket.on("admit-user", async ({ meetingId, userId, socketId }) => {
      console.log(`\n👮 [ADMIT] Admin ${socket.id} admitting ${userId} (socket: ${socketId})`);
      
      if (!socket.isAdmin) {
        console.log(`❌ [ERROR] Not admin`);
        return;
      }

      try {
        const meeting = await Meeting.findOne({ meetingId });
        const participant = meeting.participants.find(
          p => p.userId.toString() === userId.toString()
        );

        if (participant) {
          participant.status = 'admitted';
          await meeting.save();

          const room = meetingRooms.get(meetingId);
          const admitted = admittedParticipants.get(meetingId);
          
          if (room && room.has(socketId)) {
            room.get(socketId).status = 'admitted';
            admitted.add(socketId);
            
            console.log(`✅ [ADMIT] User admitted, notifying socket ${socketId}`);
            io.to(socketId).emit("admission-granted", {
              permissions: participant.permissions,
              settings: meeting.settings
            });

            // FIX: Broadcast to entire room that user was admitted
            io.to(meetingId).emit("user-admitted", { 
              userId, 
              socketId 
            });
          }
        }
      } catch (err) {
        console.error("❌ [ERROR] Admit error:", err);
      }
    });

    // Admin denies user
    socket.on("deny-user", async ({ meetingId, userId, socketId }) => {
      console.log(`\n🚫 [DENY] Admin ${socket.id} denying ${userId}`);
      
      if (!socket.isAdmin) return;

      try {
        const meeting = await Meeting.findOne({ meetingId });
        const participant = meeting.participants.find(
          p => p.userId.toString() === userId.toString()
        );

        if (participant) {
          participant.status = 'denied';
          await meeting.save();

          io.to(socketId).emit("admission-denied");
          
          const room = meetingRooms.get(meetingId);
          if (room) {
            room.delete(socketId);
            const admitted = admittedParticipants.get(meetingId);
            if (admitted) admitted.delete(socketId);
          }
          
          // Force disconnect
          const targetSocket = io.sockets.sockets.get(socketId);
          if (targetSocket) {
            targetSocket.leave(meetingId);
            targetSocket.disconnect(true);
          }
        }
      } catch (err) {
        console.error("❌ [ERROR] Deny error:", err);
      }
    });

    // Update permissions
    socket.on("update-permissions", async ({ meetingId, userId, permissions }) => {
      console.log(`\n🔐 [PERMISSIONS] Updating for ${userId}:`, permissions);
      
      if (!socket.isAdmin) return;

      try {
        const meeting = await Meeting.findOne({ meetingId });
        const participant = meeting.participants.find(
          p => p.userId.toString() === userId.toString()
        );

        if (participant) {
          Object.assign(participant.permissions, permissions);
          await meeting.save();

          const room = meetingRooms.get(meetingId);
          if (room) {
            for (const [sid, data] of room.entries()) {
              if (data.userId.toString() === userId.toString()) {
                data.permissions = participant.permissions;
                io.to(sid).emit("permissions-updated", permissions);
                console.log(`✅ [PERMISSIONS] Updated for socket ${sid}`);
                break;
              }
            }
          }
        }
      } catch (err) {
        console.error("❌ [ERROR] Permission update error:", err);
      }
    });

    // Remove participant
    socket.on("remove-participant", async ({ meetingId, userId }) => {
      console.log(`\n🗑️ [REMOVE] Removing ${userId}`);
      
      if (!socket.isAdmin) return;

      try {
        const room = meetingRooms.get(meetingId);
        const admitted = admittedParticipants.get(meetingId);
        
        if (room) {
          for (const [sid, data] of room.entries()) {
            if (data.userId.toString() === userId.toString()) {
              io.to(sid).emit("removed-by-admin");
              const participantSocket = io.sockets.sockets.get(sid);
              if (participantSocket) {
                participantSocket.leave(meetingId);
                participantSocket.disconnect(true);
              }
              room.delete(sid);
              if (admitted) admitted.delete(sid);
              
              // Notify others
              io.to(meetingId).emit("user-left", { socketId: sid });
              break;
            }
          }
        }

        const meeting = await Meeting.findOne({ meetingId });
        if (meeting) {
          meeting.participants = meeting.participants.filter(
            p => p.userId.toString() !== userId.toString()
          );
          await meeting.save();
        }
      } catch (err) {
        console.error("❌ [ERROR] Remove error:", err);
      }
    });

    // Screen share request
    socket.on("request-screen-share", async ({ meetingId }) => {
      console.log(`\n🖥️ [SCREEN-SHARE] Request from ${socket.id}`);
      
      try {
        const meeting = await Meeting.findOne({ meetingId });
        const participant = meeting.participants.find(
          p => p.userId.toString() === socket.userId.toString()
        );

        if (socket.isAdmin || (participant && participant.permissions.canScreenShare)) {
          socket.emit("screen-share-granted");
        } else {
          socket.emit("screen-share-denied");
        }
      } catch (err) {
        console.error("❌ [ERROR] Screen share error:", err);
      }
    });

    // Chat
    socket.on("chat-message", async ({ meetingId, message, user }) => {
      if (!meetingId || !user?._id) return;

      const timestamp = Date.now();
      try {
        await ChatMessage.create({ 
          meetingId, 
          user: { _id: user._id, name: user.name }, 
          message, 
          timestamp 
        });
      } catch (err) {
        console.error("❌ [ERROR] Chat save error:", err);
      }

      io.to(meetingId).emit("chat-message", { message, user, timestamp });
    });

    // WebRTC signaling
    socket.on("webrtc-offer", ({ to, sdp, fromUser }) => {
      console.log(`🔗 [OFFER] ${socket.id} -> ${to}`);
      io.to(to).emit("webrtc-offer", { from: socket.id, sdp, fromUser });
    });

    socket.on("webrtc-answer", ({ to, sdp }) => {
      console.log(`🔗 [ANSWER] ${socket.id} -> ${to}`);
      io.to(to).emit("webrtc-answer", { from: socket.id, sdp });
    });

    socket.on("ice-candidate", ({ to, candidate }) => {
      io.to(to).emit("ice-candidate", { from: socket.id, candidate });
    });

    socket.on("leave-meeting", ({ meetingId }) => {
      console.log(`\n👋 [LEAVE] ${socket.id} leaving`);
      handleUserLeave(socket, meetingId);
    });

    socket.on("disconnect", () => {
      console.log(`\n🔌 [DISCONNECT] ${socket.id}`);
      if (socket.meetingId) handleUserLeave(socket, socket.meetingId);
    });

    function handleUserLeave(socket, meetingId) {
      const room = meetingRooms.get(meetingId);
      const admitted = admittedParticipants.get(meetingId);
      
      if (room) {
        const userData = room.get(socket.id);
        room.delete(socket.id);
        if (admitted) admitted.delete(socket.id);
        
        // Only notify if user was admitted (not in waiting room)
        if (userData && userData.status === 'admitted') {
          socket.to(meetingId).emit("user-left", { socketId: socket.id });
        }

        if (room.size === 0) {
          meetingRooms.delete(meetingId);
          admittedParticipants.delete(meetingId);
          console.log(`🗑️ [CLEANUP] Room ${meetingId} deleted`);
        }
      }

      socket.leave(meetingId);
    }
  });

  // Cleanup stale rooms every 5 minutes
  setInterval(() => {
    for (const [meetingId, room] of meetingRooms.entries()) {
      if (room.size === 0) {
        meetingRooms.delete(meetingId);
        admittedParticipants.delete(meetingId);
        console.log(`🧹 [CLEANUP] Removed empty room: ${meetingId}`);
      }
    }
  }, 300000);

  console.log("🚀 [SOCKET.IO] Server initialized");
  return io;
};