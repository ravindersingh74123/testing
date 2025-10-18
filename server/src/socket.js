


// server/src/sockets/meetingSocket.js
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

  const meetingRooms = new Map(); // meetingId -> Map(socketId -> meta)
  const admittedParticipants = new Map(); // meetingId -> Set(socketId)
  const userSocketIndex = new Map(); // userId -> Set(socketId)

  const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;
  const cleanupInterval = setInterval(() => {
    for (const [meetingId, room] of meetingRooms.entries()) {
      if (!room || room.size === 0) {
        meetingRooms.delete(meetingId);
        admittedParticipants.delete(meetingId);
        console.log(`🧹 [CLEANUP] Removed empty room: ${meetingId}`);
      }
    }
  }, CLEANUP_INTERVAL_MS);

  function emitToSocket(socketId, event, payload) {
    const target = io.sockets.sockets.get(socketId);
    if (target) target.emit(event, payload);
  }

  function indexSocketForUser(userId, socketId) {
    if (!userId) return;
    if (!userSocketIndex.has(userId)) userSocketIndex.set(userId, new Set());
    userSocketIndex.get(userId).add(socketId);
  }

  function deindexSocketForUser(userId, socketId) {
    if (!userId) return;
    const s = userSocketIndex.get(userId);
    if (!s) return;
    s.delete(socketId);
    if (s.size === 0) userSocketIndex.delete(userId);
  }

  async function findMeetingSafe(meetingId) {
    try {
      return await Meeting.findOne({ meetingId });
    } catch (err) {
      console.error("❌ [DB] Error finding meeting:", err);
      return null;
    }
  }

  function isUserAdmin(meeting, userId) {
    try {
      if (!meeting) return false;
      if (typeof meeting.isAdmin === "function") return meeting.isAdmin(userId);
      if (meeting.hostId && meeting.hostId.toString() === userId.toString()) return true;
      return false;
    } catch (e) {
      return false;
    }
  }

  io.on("connection", (socket) => {
    console.log("✅ [CONNECTION] User connected:", socket.id);

    socket.on("join-meeting", async ({ meetingId, user }) => {
      if (!meetingId || !user) {
        return socket.emit("join-error", { message: "Missing meetingId or user" });
      }

      try {
        const meeting = await findMeetingSafe(meetingId);
        if (!meeting) return socket.emit("join-error", { message: "Meeting not found" });

        const userId = user._id || user.id;
        if (!userId) return socket.emit("join-error", { message: "Invalid user object" });

        const isAdmin = isUserAdmin(meeting, userId);

        socket.user = user;
        socket.userId = userId;
        socket.meetingId = meetingId;
        socket.isAdmin = isAdmin;

        if (!meetingRooms.has(meetingId)) {
          meetingRooms.set(meetingId, new Map());
          admittedParticipants.set(meetingId, new Set());
        }
        const room = meetingRooms.get(meetingId);
        const admitted = admittedParticipants.get(meetingId);

        room.set(socket.id, {
          socketId: socket.id,
          user,
          userId,
          isAdmin,
          status: "pending",
          permissions: null,
        });

        indexSocketForUser(userId, socket.id);
        socket.join(meetingId);

        // ADMIN flow
        if (isAdmin) {
          console.log(`👑 [ADMIN-JOIN] Admin ${user.name} (${userId}) joined ${meetingId}`);

          let participant = meeting.participants.find((p) => p.userId.toString() === userId.toString());
          if (!participant) {
            participant = {
              userId,
              name: user.name,
              status: "admitted",
              permissions: { canUnmute: true, canVideo: true, canScreenShare: true },
            };
            meeting.participants.push(participant);
            await meeting.save();
          } else {
            participant.status = "admitted";
            participant.permissions = participant.permissions || { canUnmute: true, canVideo: true, canScreenShare: true };
            await meeting.save();
          }

          const meta = room.get(socket.id);
          meta.status = "admitted";
          meta.permissions = participant.permissions;
          admitted.add(socket.id);

          socket.emit("meeting-joined", { isAdmin: true, permissions: participant.permissions, settings: meeting.settings || {} });

          const messages = await ChatMessage.find({ meetingId }).sort({ timestamp: 1 });
          socket.emit("chat-history", messages || []);

          // Send other admitted participants to admin
          const otherAdmitted = Array.from(room.values()).filter((p) => admitted.has(p.socketId) && p.socketId !== socket.id);
          socket.emit("meeting-participants", otherAdmitted);

          // Send admission-request events to this admin for each waiting user (admin-specific)
          const waiting = Array.from(room.values()).filter((p) => p.status === "waiting");
          waiting.forEach((w) => {
            socket.emit("admission-request", { userId: w.userId, name: w.user.name, socketId: w.socketId });
          });

          socket.to(meetingId).emit("user-joined", { socketId: socket.id, user, permissions: participant.permissions, isAdmin: true });
          return;
        }

        // REGULAR user flow - admission or auto-admit
        const requireAdmission = meeting.settings?.requireAdmission;
        let participant = meeting.participants.find((p) => p.userId.toString() === userId.toString());

        if (requireAdmission) {
          if (!participant) {
            participant = {
              userId,
              name: user.name,
              status: "waiting",
              permissions: {
                canUnmute: !meeting.settings?.muteMicOnEntry,
                canVideo: !meeting.settings?.disableVideoOnEntry,
                canScreenShare: false,
              },
            };
            meeting.participants.push(participant);
            await meeting.save();
          }

          if (participant.status === "waiting") {
            const meta = room.get(socket.id);
            meta.status = "waiting";
            meta.permissions = participant.permissions;

            socket.emit("waiting-room");

            // --- FIX: emit admission-request only to admin sockets (do not broadcast to entire room)
            const requestData = { userId, name: user.name, socketId: socket.id };
            for (const [sid, meta] of room.entries()) {
              if (meta.isAdmin) {
                emitToSocket(sid, "admission-request", requestData);
              }
            }
            return;
          }

          if (participant.status === "denied") {
            socket.emit("admission-denied");
            room.delete(socket.id);
            deindexSocketForUser(userId, socket.id);
            socket.leave(meetingId);
            return;
          }

          participant.status = "admitted";
          await meeting.save();
          const meta = room.get(socket.id);
          meta.status = "admitted";
          meta.permissions = participant.permissions;
          admitted.add(socket.id);
        } else {
          if (!participant) {
            participant = {
              userId,
              name: user.name,
              status: "admitted",
              permissions: {
                canUnmute: !meeting.settings?.muteMicOnEntry,
                canVideo: !meeting.settings?.disableVideoOnEntry,
                canScreenShare: !!meeting.settings?.allowScreenShare,
              },
            };
            meeting.participants.push(participant);
            await meeting.save();
          } else {
            participant.status = "admitted";
            await meeting.save();
          }
          const meta = room.get(socket.id);
          meta.status = "admitted";
          meta.permissions = participant.permissions;
          admitted.add(socket.id);
        }

        // Now user is admitted -> notify the joiner
        const roomData = room.get(socket.id);
        socket.emit("meeting-joined", { isAdmin: false, permissions: roomData.permissions, settings: meeting.settings || {} });

        const messages = await ChatMessage.find({ meetingId }).sort({ timestamp: 1 });
        socket.emit("chat-history", messages || []);

        const otherAdmitted = Array.from(room.values()).filter((p) => admitted.has(p.socketId) && p.socketId !== socket.id);
        socket.emit("meeting-participants", otherAdmitted);

        // Delay notifying others so joiner gets participants first
        setTimeout(() => {
          socket.to(meetingId).emit("user-joined", { socketId: socket.id, user, permissions: roomData.permissions, isAdmin: false });
        }, 300);

      } catch (err) {
        console.error("❌ [ERROR] Join error:", err);
        socket.emit("join-error", { message: "Failed to join meeting" });
      }
    }); // end join-meeting

    // Admin admit
    socket.on("admit-user", async ({ meetingId, userId, socketId }) => {
      if (!socket.isAdmin) return;
      try {
        const meeting = await findMeetingSafe(meetingId);
        if (!meeting) return;
        const participant = meeting.participants.find((p) => p.userId.toString() === userId.toString());
        if (!participant) return;
        if (participant.status === "admitted") return;
        participant.status = "admitted";
        await meeting.save();

        const room = meetingRooms.get(meetingId);
        const admitted = admittedParticipants.get(meetingId);
        if (room && room.has(socketId)) {
          const meta = room.get(socketId);
          meta.status = "admitted";
          meta.permissions = participant.permissions;
          admitted.add(socketId);

          // Send admission-granted + chat history + participants
          emitToSocket(socketId, "admission-granted", { permissions: participant.permissions, settings: meeting.settings || {} });
          const messages = await ChatMessage.find({ meetingId }).sort({ timestamp: 1 });
          emitToSocket(socketId, "chat-history", messages || []);
          const otherAdmitted = Array.from(room.values()).filter((p) => admitted.has(p.socketId) && p.socketId !== socketId);
          emitToSocket(socketId, "meeting-participants", otherAdmitted);

          // Notify everyone else user joined (so they can show video)
          setTimeout(() => {
            socket.to(meetingId).emit("user-joined", { socketId, user: meta.user, permissions: participant.permissions, isAdmin: false });
            io.to(meetingId).emit("user-admitted", { userId, socketId });
          }, 300);
        }
      } catch (err) {
        console.error("❌ [ERROR] Admit error:", err);
      }
    });

    // Deny user
    socket.on("deny-user", async ({ meetingId, userId, socketId }) => {
      if (!socket.isAdmin) return;
      try {
        const meeting = await findMeetingSafe(meetingId);
        if (!meeting) return;
        const participant = meeting.participants.find((p) => p.userId.toString() === userId.toString());
        if (participant) {
          participant.status = "denied";
          await meeting.save();
        }
        const room = meetingRooms.get(meetingId);
        if (room && room.has(socketId)) {
          emitToSocket(socketId, "admission-denied");
          const tgt = io.sockets.sockets.get(socketId);
          if (tgt) { tgt.leave(meetingId); try { tgt.disconnect(true); } catch (e) {} }
          room.delete(socketId);
          const admitted = admittedParticipants.get(meetingId);
          if (admitted) admitted.delete(socketId);
        }
      } catch (err) {
        console.error("❌ [ERROR] Deny error:", err);
      }
    });

    // Update permissions
    socket.on("update-permissions", async ({ meetingId, userId, permissions }) => {
      if (!socket.isAdmin) return;
      try {
        const meeting = await findMeetingSafe(meetingId);
        if (!meeting) return;
        const participant = meeting.participants.find((p) => p.userId.toString() === userId.toString());
        if (!participant) return;
        participant.permissions = { ...(participant.permissions || {}), ...(permissions || {}) };
        await meeting.save();

        // Notify all sockets of that user
        const socketsOfUser = userSocketIndex.get(userId);
        if (socketsOfUser) {
          for (const sid of socketsOfUser) {
            emitToSocket(sid, "permissions-updated", participant.permissions);
            const room = meetingRooms.get(meetingId);
            if (room && room.has(sid)) room.get(sid).permissions = participant.permissions;
          }
        }
        console.log(`🔐 [PERMISSIONS] Updated for userId ${userId}`);
      } catch (err) {
        console.error("❌ [ERROR] Permission update error:", err);
      }
    });

    // Remove participant
    socket.on("remove-participant", async ({ meetingId, userId }) => {
      if (!socket.isAdmin) return;
      try {
        const room = meetingRooms.get(meetingId);
        const admitted = admittedParticipants.get(meetingId);
        if (room) {
          for (const [sid, data] of Array.from(room.entries())) {
            if (data.userId.toString() === userId.toString()) {
              emitToSocket(sid, "removed-by-admin");
              const participantSocket = io.sockets.sockets.get(sid);
              if (participantSocket) { participantSocket.leave(meetingId); try { participantSocket.disconnect(true); } catch (e) {} }
              room.delete(sid);
              if (admitted) admitted.delete(sid);
              io.to(meetingId).emit("user-left", { socketId: sid });
            }
          }
        }
        const meeting = await findMeetingSafe(meetingId);
        if (meeting) {
          meeting.participants = meeting.participants.filter((p) => p.userId.toString() !== userId.toString());
          await meeting.save();
        }
      } catch (err) {
        console.error("❌ [ERROR] Remove error:", err);
      }
    });

    // Screen share request
    socket.on("request-screen-share", async ({ meetingId }) => {
      if (!meetingId) return;
      try {
        const meeting = await findMeetingSafe(meetingId);
        const participant = meeting?.participants.find((p) => p.userId.toString() === socket.userId?.toString());
        if (socket.isAdmin || participant?.permissions?.canScreenShare) socket.emit("screen-share-granted");
        else socket.emit("screen-share-denied");
      } catch (err) {
        console.error("❌ [SCREEN-SHARE-ERROR]", err);
      }
    });

    // Chat message
    socket.on("chat-message", async ({ meetingId, message, user }) => {
      if (!meetingId || !message || !user) return;
      try {
        const timestamp = Date.now();
        try {
          await ChatMessage.create({ meetingId, user: { _id: user._id, name: user.name }, message, timestamp });
        } catch (err) {
          console.error("❌ [CHAT-SAVE-ERROR]", err);
        }
        io.to(meetingId).emit("chat-message", { message, user, timestamp });
      } catch (err) {
        console.error("❌ [ERROR] chat-message handler", err);
      }
    });

    // WebRTC signaling relay
    socket.on("webrtc-offer", ({ to, sdp, fromUser }) => {
      if (!to || !sdp) return;
      const target = io.sockets.sockets.get(to);
      if (target) target.emit("webrtc-offer", { from: socket.id, sdp, fromUser });
    });
    socket.on("webrtc-answer", ({ to, sdp }) => {
      if (!to || !sdp) return;
      const target = io.sockets.sockets.get(to);
      if (target) target.emit("webrtc-answer", { from: socket.id, sdp });
    });
    socket.on("ice-candidate", ({ to, candidate }) => {
      if (!to || !candidate) return;
      const target = io.sockets.sockets.get(to);
      if (target) target.emit("ice-candidate", { from: socket.id, candidate });
    });

    // Request participants (client fallback)
    socket.on("request-participants", ({ meetingId }) => {
      if (!meetingId) return;
      const room = meetingRooms.get(meetingId);
      const admitted = admittedParticipants.get(meetingId);
      if (!room || !admitted) {
        socket.emit("meeting-participants", []);
        return;
      }
      const otherAdmitted = Array.from(room.values()).filter((p) => admitted.has(p.socketId) && p.socketId !== socket.id);
      socket.emit("meeting-participants", otherAdmitted);
    });

    // Leave meeting (explicit)
    socket.on("leave-meeting", ({ meetingId }) => {
      try {
        handleUserLeave(socket, meetingId);
      } catch (e) {
        console.error("❌ [LEAVE-ERROR]", e);
      }
    });

    // Disconnect
    socket.on("disconnect", (reason) => {
      console.log(`🔌 [DISCONNECT] ${socket.id} reason=${reason}`);
      try {
        if (socket.meetingId) handleUserLeave(socket, socket.meetingId, { removeDbEntry: false });
      } catch (e) {
        console.error("❌ [DISCONNECT-CLEANUP] Error:", e);
      }
      if (socket.userId) deindexSocketForUser(socket.userId, socket.id);
    });

    function handleUserLeave(socketObj, meetingIdParam, options = { removeDbEntry: false }) {
      try {
        const room = meetingRooms.get(meetingIdParam);
        const admitted = admittedParticipants.get(meetingIdParam);
        if (!room) {
          try { socketObj.leave(meetingIdParam); } catch (e) {}
          return;
        }
        const meta = room.get(socketObj.id);
        if (meta) {
          room.delete(socketObj.id);
          if (admitted) admitted.delete(socketObj.id);
          if (meta.status === "admitted") socketObj.to(meetingIdParam).emit("user-left", { socketId: socketObj.id });
        }
        if (room.size === 0) {
          meetingRooms.delete(meetingIdParam);
          admittedParticipants.delete(meetingIdParam);
          console.log(`🗑️ [CLEANUP] Room ${meetingIdParam} deleted`);
        }
        try { socketObj.leave(meetingIdParam); } catch (e) {}
        if (options.removeDbEntry) {
          (async () => {
            try {
              const meeting = await findMeetingSafe(meetingIdParam);
              if (!meeting) return;
              meeting.participants = meeting.participants.filter((p) => p.userId.toString() !== (socketObj.userId || "").toString());
              await meeting.save();
            } catch (err) {
              console.error("❌ [DB-REMOVE] Error removing participant on leave", err);
            }
          })();
        }
      } catch (err) {
        console.error("❌ [HANDLE-LEAVE] Error:", err);
      }
    }
  }); // end io.on('connection')

  process.once("SIGINT", () => {
    clearInterval(cleanupInterval);
    try { io.close(); } catch (e) {}
    process.exit(0);
  });

  console.log("🚀 [SOCKET.IO] Meeting socket server initialized");
  return io;
};
