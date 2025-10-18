// server/src/sockets/meetingSocket.js
/**
 * Robust Socket.IO server for meeting (Google Meet clone style)
 * - Handles join flow (admin vs regular)
 * - Waiting room + admission workflow
 * - Permissions updates, screen-share requests
 * - Chat persistence (uses ChatMessage model)
 * - WebRTC signaling (offer/answer/ice)
 * - Clean room lifecycle management and defensive checks
 *
 * Drop-in replacement for your previous socket handler. Keep your
 * Meeting and ChatMessage Mongoose models with expected shape:
 *   Meeting.findOne({ meetingId }) -> meeting document having:
 *     - meetingId
 *     - settings (requireAdmission, muteMicOnEntry, disableVideoOnEntry, allowScreenShare, ...)
 *     - participants: [{ userId, name, status ('waiting'|'admitted'|'denied'), permissions }]
 *     - isAdmin(userId) -> boolean helper (or adjust below)
 *
 * IMPORTANT: This file focuses on server-side socket logic. Your client should:
 *  - Only create offers when it receives "meeting-participants" (you are the joiner)
 *  - Existing participants should NOT create offers in response to "user-joined"
 *
 * Exported function: module.exports = (server) => io;
 */

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

  // In-memory room state for fast operations. Keys: meetingId -> Map(socketId -> meta)
  // meta: { socketId, user, userId, isAdmin, status: 'waiting'|'admitted'|'pending', permissions }
  const meetingRooms = new Map();

  // Helps track admitted sockets for each meeting quickly: meetingId -> Set(socketId)
  const admittedParticipants = new Map();

  // Optional: mapping userId -> Set(socketId) (handles multi-tabs)
  const userSocketIndex = new Map();

  // Clean up interval id so we can clear if needed
  const CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
  const cleanupInterval = setInterval(() => {
    for (const [meetingId, room] of meetingRooms.entries()) {
      if (!room || room.size === 0) {
        meetingRooms.delete(meetingId);
        admittedParticipants.delete(meetingId);
        console.log(`🧹 [CLEANUP] Removed empty room: ${meetingId}`);
      }
    }
  }, CLEANUP_INTERVAL_MS);

  // Helper: safe emit (checks existence)
  function emitToSocket(socketId, event, payload) {
    const target = io.sockets.sockets.get(socketId);
    if (target) {
      target.emit(event, payload);
    } else {
      console.warn(`⚠️ [EMIT] Target socket ${socketId} not found for event ${event}`);
    }
  }

  // Helper: mark socket -> user index
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

  // Helper: safe DB read for meeting; returns null if not found
  async function findMeetingSafe(meetingId) {
    try {
      return await Meeting.findOne({ meetingId });
    } catch (err) {
      console.error("❌ [DB] Error finding meeting:", err);
      return null;
    }
  }

  // Helper: determine admin - expects meeting.isAdmin(userId) function in model.
  // If not present, fall back to meeting.hostId or similar.
  function isUserAdmin(meeting, userId) {
    try {
      if (!meeting) return false;
      if (typeof meeting.isAdmin === "function") return meeting.isAdmin(userId);
      // fallback: if meeting.hostId exists
      if (meeting.hostId && meeting.hostId.toString() === userId.toString()) return true;
      return false;
    } catch (e) {
      console.warn("⚠️ [isUserAdmin] Error:", e);
      return false;
    }
  }

  io.on("connection", (socket) => {
    console.log("✅ [CONNECTION] User connected:", socket.id);

    // Defensive wrapper: many events depend on meetingId / user object. Validate
    socket.on("join-meeting", async ({ meetingId, user }) => {
      if (!meetingId || !user) {
        console.warn("⚠️ [JOIN] Missing meetingId or user. Rejecting join.");
        return socket.emit("join-error", { message: "Missing meetingId or user" });
      }

      try {
        const meeting = await findMeetingSafe(meetingId);
        if (!meeting) {
          console.log(`❌ [ERROR] Meeting ${meetingId} not found`);
          return socket.emit("join-error", { message: "Meeting not found" });
        }

        // Normalize user id
        const userId = user._id || user.id;
        if (!userId) {
          console.warn("⚠️ [JOIN] User missing id");
          return socket.emit("join-error", { message: "Invalid user object" });
        }

        const isAdmin = isUserAdmin(meeting, userId);
        console.log(`🚀 [JOIN-MEETING] ${user.name} (${userId}) joining ${meetingId} as ${isAdmin ? "ADMIN" : "USER"} (socket ${socket.id})`);

        // Attach socket metadata
        socket.user = user;
        socket.userId = userId;
        socket.meetingId = meetingId;
        socket.isAdmin = isAdmin;

        // Ensure room state exists
        if (!meetingRooms.has(meetingId)) {
          meetingRooms.set(meetingId, new Map());
          admittedParticipants.set(meetingId, new Set());
        }
        const room = meetingRooms.get(meetingId);
        const admitted = admittedParticipants.get(meetingId);

        // Add to in-memory room tracking right away
        room.set(socket.id, {
          socketId: socket.id,
          user,
          userId,
          isAdmin,
          status: "pending",
          permissions: null,
        });

        indexSocketForUser(userId, socket.id);

        // Join socket.io room
        socket.join(meetingId);

        // ADMIN FLOW
        if (isAdmin) {
          console.log(`👑 [ADMIN-JOIN] Admin ${user.name} joined meeting ${meetingId}`);

          // Ensure participant entry in DB exists and marked admitted
          let participant = meeting.participants.find((p) => p.userId.toString() === userId.toString());
          if (!participant) {
            participant = {
              userId,
              name: user.name,
              status: "admitted",
              permissions: {
                canUnmute: true,
                canVideo: true,
                canScreenShare: true,
              },
            };
            meeting.participants.push(participant);
            await meeting.save();
          } else {
            participant.status = "admitted";
            participant.permissions = participant.permissions || {
              canUnmute: true,
              canVideo: true,
              canScreenShare: true,
            };
            await meeting.save();
          }

          // Update room metadata
          const meta = room.get(socket.id);
          meta.status = "admitted";
          meta.permissions = participant.permissions;
          admitted.add(socket.id);

          // Send join success (admin)
          socket.emit("meeting-joined", {
            isAdmin: true,
            permissions: participant.permissions,
            settings: meeting.settings || {},
          });

          // Send chat history
          const messages = await ChatMessage.find({ meetingId }).sort({ timestamp: 1 });
          socket.emit("chat-history", messages || []);

          // Send list of other admitted participants (excluding this admin socket)
          const otherAdmitted = Array.from(room.values()).filter((p) => admitted.has(p.socketId) && p.socketId !== socket.id);
          socket.emit("meeting-participants", otherAdmitted);

          // Send admission requests for waiting users (to admin only)
          const waiting = Array.from(room.values()).filter((p) => p.status === "waiting");
          waiting.forEach((w) => {
            socket.emit("admission-request", {
              userId: w.userId,
              name: w.user.name,
              socketId: w.socketId,
            });
          });

          // Notify others that admin joined (so their UI can show a host)
          socket.to(meetingId).emit("user-joined", {
            socketId: socket.id,
            user,
            permissions: participant.permissions,
            isAdmin: true,
          });

          return;
        } // end admin flow

        // REGULAR USER FLOW
        // Admission required?
        const requireAdmission = meeting.settings?.requireAdmission;
        let participant = meeting.participants.find((p) => p.userId.toString() === userId.toString());

        if (requireAdmission) {
          // Create participant if missing
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

          // If waiting -> waiting room
          if (participant.status === "waiting") {
            console.log(`⏳ [WAITING] ${user.name} placed in waiting room for ${meetingId}`);
            const meta = room.get(socket.id);
            meta.status = "waiting";
            meta.permissions = participant.permissions;

            // Inform this user they are in waiting room
            socket.emit("waiting-room");

            // Broadcast admission-request to admins / all sockets in the meeting room.
            // Admins should listen for "admission-request" and present UI.
            const requestData = { userId, name: user.name, socketId: socket.id };
            // Send to room (admins present will receive it)
            io.to(meetingId).emit("admission-request", requestData);

            return;
          }

          if (participant.status === "denied") {
            console.log(`🚫 [DENIED] ${user.name} (userId ${userId}) denied access to ${meetingId}`);
            socket.emit("admission-denied");
            room.delete(socket.id);
            deindexSocketForUser(userId, socket.id);
            socket.leave(meetingId);
            return;
          }

          // if participant.status === 'admitted', fallthrough to admit below
          participant.status = "admitted";
          await meeting.save();
          const meta = room.get(socket.id);
          meta.status = "admitted";
          meta.permissions = participant.permissions;
          admitted.add(socket.id);
        } else {
          // Auto-admit: add to DB if missing or mark admitted
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

        // At this point the user is admitted
        const roomData = room.get(socket.id);
        console.log(`✅ [ADMIT] ${user.name} admitted to ${meetingId}`);

        // Emit meeting-joined to the newly admitted user (joiner)
        socket.emit("meeting-joined", {
          isAdmin: false,
          permissions: roomData.permissions,
          settings: meeting.settings || {},
        });

        // Send chat history
        const messages = await ChatMessage.find({ meetingId }).sort({ timestamp: 1 });
        socket.emit("chat-history", messages || []);

        // Send list of other admitted participants (for the joiner to create offers to)
        const otherAdmitted = Array.from(room.values()).filter((p) => admitted.has(p.socketId) && p.socketId !== socket.id);
        socket.emit("meeting-participants", otherAdmitted);

        // Notify others that user joined AFTER a small delay so joiner receives participants list first.
        setTimeout(() => {
          socket.to(meetingId).emit("user-joined", {
            socketId: socket.id,
            user,
            permissions: roomData.permissions,
            isAdmin: false,
          });
        }, 300);

        // Done
        console.log(`✅ [JOIN-COMPLETE] ${user.name} join complete for ${meetingId}`);
      } catch (err) {
        console.error("❌ [ERROR] Join error:", err);
        socket.emit("join-error", { message: "Failed to join meeting" });
      }
    }); // end join-meeting

    //
    // Admin actions: admit / deny / update-permissions / remove-participant
    //
    socket.on("admit-user", async ({ meetingId, userId, socketId }) => {
      if (!socket.isAdmin) {
        console.warn("⚠️ [ADMIT] Unauthorized admit attempt by", socket.id);
        return;
      }
      if (!meetingId || !userId || !socketId) return;

      try {
        const meeting = await findMeetingSafe(meetingId);
        if (!meeting) return;

        const participant = meeting.participants.find((p) => p.userId.toString() === userId.toString());
        if (!participant) return;

        if (participant.status === "admitted") {
          console.log("⚠️ [ADMIT] Participant already admitted:", userId);
          return;
        }

        participant.status = "admitted";
        await meeting.save();

        const room = meetingRooms.get(meetingId);
        const admitted = admittedParticipants.get(meetingId);
        if (room && room.has(socketId)) {
          const meta = room.get(socketId);
          meta.status = "admitted";
          meta.permissions = participant.permissions;
          admitted.add(socketId);

          // Notify the admitted socket
          emitToSocket(socketId, "admission-granted", {
            permissions: participant.permissions,
            settings: meeting.settings || {},
          });

          // Send chat history to the user
          const messages = await ChatMessage.find({ meetingId }).sort({ timestamp: 1 });
          emitToSocket(socketId, "chat-history", messages || []);

          // Send list of other admitted participants to the newly admitted user
          const otherAdmitted = Array.from(room.values()).filter((p) => admitted.has(p.socketId) && p.socketId !== socketId);
          emitToSocket(socketId, "meeting-participants", otherAdmitted);

          // Notify all about new admitted user (so clients can display)
          setTimeout(() => {
            socket.to(meetingId).emit("user-joined", {
              socketId,
              user: meta.user,
              permissions: participant.permissions,
              isAdmin: false,
            });
            io.to(meetingId).emit("user-admitted", { userId, socketId });
          }, 300);

          console.log(`✅ [ADMIT] ${userId} admitted (socket ${socketId})`);
        }
      } catch (err) {
        console.error("❌ [ERROR] Admit error:", err);
      }
    });

    socket.on("deny-user", async ({ meetingId, userId, socketId }) => {
      if (!socket.isAdmin) {
        console.warn("⚠️ [DENY] Unauthorized deny attempt by", socket.id);
        return;
      }
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
          // notify target and disconnect them
          emitToSocket(socketId, "admission-denied");
          const target = io.sockets.sockets.get(socketId);
          if (target) {
            target.leave(meetingId);
            try { target.disconnect(true); } catch (e) {}
          }
          room.delete(socketId);
          const admitted = admittedParticipants.get(meetingId);
          if (admitted) admitted.delete(socketId);
        }
      } catch (err) {
        console.error("❌ [ERROR] Deny error:", err);
      }
    });

    socket.on("update-permissions", async ({ meetingId, userId, permissions }) => {
      if (!socket.isAdmin) return;
      if (!meetingId || !userId) return;

      try {
        const meeting = await findMeetingSafe(meetingId);
        if (!meeting) return;

        const participant = meeting.participants.find((p) => p.userId.toString() === userId.toString());
        if (!participant) return;

        participant.permissions = { ...(participant.permissions || {}), ...(permissions || {}) };
        await meeting.save();

        // Push update to all sockets of the user (multi-tab)
        const socketsOfUser = userSocketIndex.get(userId);
        if (socketsOfUser) {
          for (const sid of socketsOfUser) {
            emitToSocket(sid, "permissions-updated", participant.permissions);
            // also update in-room meta if present
            const room = meetingRooms.get(meetingId);
            if (room && room.has(sid)) room.get(sid).permissions = participant.permissions;
          }
        }
        console.log(`🔐 [PERMISSIONS] Updated for userId ${userId}`);
      } catch (err) {
        console.error("❌ [ERROR] Permission update error:", err);
      }
    });

    socket.on("remove-participant", async ({ meetingId, userId }) => {
      // Admin only
      if (!socket.isAdmin) return;
      if (!meetingId || !userId) return;

      try {
        const room = meetingRooms.get(meetingId);
        const admitted = admittedParticipants.get(meetingId);

        if (room) {
          // find matching sockets for that user and remove them
          for (const [sid, data] of Array.from(room.entries())) {
            if (data.userId.toString() === userId.toString()) {
              emitToSocket(sid, "removed-by-admin");

              const participantSocket = io.sockets.sockets.get(sid);
              if (participantSocket) {
                participantSocket.leave(meetingId);
                try { participantSocket.disconnect(true); } catch (e) {}
              }

              room.delete(sid);
              if (admitted) admitted.delete(sid);
              io.to(meetingId).emit("user-left", { socketId: sid });
            }
          }
        }

        // Remove from DB participants array
        const meeting = await findMeetingSafe(meetingId);
        if (meeting) {
          meeting.participants = meeting.participants.filter((p) => p.userId.toString() !== userId.toString());
          await meeting.save();
        }
      } catch (err) {
        console.error("❌ [ERROR] Remove error:", err);
      }
    });

    socket.on("request-screen-share", async ({ meetingId }) => {
      if (!meetingId) return;
      try {
        const meeting = await findMeetingSafe(meetingId);
        const participant = meeting?.participants.find((p) => p.userId.toString() === socket.userId?.toString());
        if (socket.isAdmin || participant?.permissions?.canScreenShare) {
          socket.emit("screen-share-granted");
        } else {
          socket.emit("screen-share-denied");
        }
      } catch (err) {
        console.error("❌ [SCREEN-SHARE-ERROR]", err);
      }
    });

    socket.on("chat-message", async ({ meetingId, message, user }) => {
      if (!meetingId || !message || !user) return;
      try {
        const timestamp = Date.now();
        // Persist chat message but swallow DB errors (don't break flow)
        try {
          await ChatMessage.create({
            meetingId,
            user: { _id: user._id, name: user.name },
            message,
            timestamp,
          });
        } catch (err) {
          console.error("❌ [CHAT-SAVE-ERROR]", err);
        }
        // Broadcast to room
        io.to(meetingId).emit("chat-message", { message, user, timestamp });
      } catch (err) {
        console.error("❌ [ERROR] chat-message handler", err);
      }
    });

    //
    // WebRTC Signaling - these simply relay to target
    //
    socket.on("webrtc-offer", ({ to, sdp, fromUser }) => {
      if (!to || !sdp) return;
      const target = io.sockets.sockets.get(to);
      if (target) {
        target.emit("webrtc-offer", { from: socket.id, sdp, fromUser });
      } else {
        console.warn(`⚠️ [OFFER] Target ${to} not found`);
      }
    });

    socket.on("webrtc-answer", ({ to, sdp }) => {
      if (!to || !sdp) return;
      const target = io.sockets.sockets.get(to);
      if (target) {
        target.emit("webrtc-answer", { from: socket.id, sdp });
      } else {
        console.warn(`⚠️ [ANSWER] Target ${to} not found`);
      }
    });

    socket.on("ice-candidate", ({ to, candidate }) => {
      if (!to || !candidate) return;
      const target = io.sockets.sockets.get(to);
      if (target) {
        target.emit("ice-candidate", { from: socket.id, candidate });
      } else {
        console.warn(`⚠️ [ICE] Target ${to} not found`);
      }
    });

    // Leave meeting explicitly
    socket.on("leave-meeting", ({ meetingId }) => {
      try {
        console.log(`👋 [LEAVE] ${socket.id} leaving ${meetingId}`);
        handleUserLeave(socket, meetingId);
      } catch (e) {
        console.error("❌ [LEAVE-ERROR]", e);
      }
    });

    // Disconnect cleanup
    socket.on("disconnect", (reason) => {
      console.log(`🔌 [DISCONNECT] ${socket.id} reason=${reason}`);
      try {
        // Clean server-side room tracking only (do not remove DB participant records blindly)
        if (socket.meetingId) {
          handleUserLeave(socket, socket.meetingId, { removeDbEntry: false });
        }
      } catch (e) {
        console.error("❌ [DISCONNECT-CLEANUP] Error:", e);
      }
      // Deindex socket from user map
      if (socket.userId) deindexSocketForUser(socket.userId, socket.id);
    });

    //
    // Shared leave handler (used by leave-meeting and disconnect)
    //
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
          // Remove socket from room map
          room.delete(socketObj.id);
          if (admitted) admitted.delete(socketObj.id);

          // If this socket was admitted, notify others
          if (meta.status === "admitted") {
            socketObj.to(meetingIdParam).emit("user-left", { socketId: socketObj.id });
          }
        }

        // If no sockets left in room, clean memory maps
        if (room.size === 0) {
          meetingRooms.delete(meetingIdParam);
          admittedParticipants.delete(meetingIdParam);
          console.log(`🗑️ [CLEANUP] Room ${meetingIdParam} deleted`);
        }

        try {
          socketObj.leave(meetingIdParam);
        } catch (e) {}

        // Optionally remove from meeting.participants in DB (risky - we prefer explicit admin actions)
        if (options.removeDbEntry) {
          // Intentionally left as optional and safe (not called on disconnect by default)
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

  // Clear cleanup interval on process exit
  process.once("SIGINT", () => {
    clearInterval(cleanupInterval);
    try { io.close(); } catch (e) {}
    process.exit(0);
  });

  console.log("🚀 [SOCKET.IO] Meeting socket server initialized");
  return io;
};
