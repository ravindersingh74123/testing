// const { Server } = require("socket.io");
// const Meeting = require("./models/Meeting");
// const ChatMessage = require("./models/ChatMessage");

// module.exports = (server) => {
//   const io = new Server(server, {
//     cors: {
//       origin: process.env.FRONTEND_URL || "*",
//       methods: ["GET", "POST"],
//     },
//     pingTimeout: 60000,
//     pingInterval: 25000,
//   });

//   // Store meeting rooms in memory for better tracking
//   const meetingRooms = new Map();

//   io.on("connection", (socket) => {
//     console.log("User connected:", socket.id);

//     let currentMeeting = null;
//     let currentUser = null;

//     // Join meeting with approval system
//     socket.on("join-meeting", async ({ meetingId, user }) => {
//       console.log(`User ${user.name} (${socket.id}) joining meeting ${meetingId}`);

//       // Clean up previous meeting if exists
//       if (currentMeeting && currentMeeting !== meetingId) {
//         handleUserLeave(socket, currentMeeting);
//       }

//       try {
//         const meeting = await Meeting.findOne({ meetingId });
//         if (!meeting) {
//           socket.emit("join-error", { message: "Meeting not found" });
//           return;
//         }

//         socket.join(meetingId);
//         socket.user = user;
//         socket.meetingId = meetingId;
//         currentMeeting = meetingId;
//         currentUser = user;

//         // Initialize room if it doesn't exist
//         if (!meetingRooms.has(meetingId)) {
//           meetingRooms.set(meetingId, new Map());
//         }

//         const room = meetingRooms.get(meetingId);

//         // Check if approval is required
//         if (meeting.adminSettings.requireApprovalToJoin) {
//           // Add to waiting room in DB
//           meeting.waitingRoom.push({
//             socketId: socket.id,
//             userId: user._id || user.id,
//             userName: user.name,
//             email: user.email,
//           });

//           await meeting.save();

//           // Add to in-memory waiting room
//           room.set(socket.id, {
//             socketId: socket.id,
//             user,
//             status: "waiting",
//           });

//           // Notify admin
//           io.to(meetingId).emit("user-waiting-approval", {
//             socketId: socket.id,
//             userId: user._id || user.id,
//             userName: user.name,
//             email: user.email,
//           });

//           // Tell user to wait
//           socket.emit("waiting-for-approval", {
//             message: "Waiting for admin approval to join",
//           });
//         } else {
//           // Auto-approve
//           meeting.participants.push({
//             socketId: socket.id,
//             userId: user._id || user.id,
//             userName: user.name,
//             email: user.email,
//             status: "active",
//             permissions: {
//               canUnmute: true,
//               canToggleVideo: true,
//               canScreenShare: false,
//               canChat: true,
//             },
//           });

//           await meeting.save();

//           // Add to in-memory room
//           room.set(socket.id, {
//             socketId: socket.id,
//             user,
//             status: "active",
//           });

//           // Send chat history
//           try {
//             const messages = await ChatMessage.find({ meetingId }).sort({
//               timestamp: 1,
//             });
//             socket.emit("chat-history", messages);
//           } catch (err) {
//             console.error("Error fetching chat messages:", err);
//           }

//           // Get current participants
//           const participants = Array.from(room.values())
//             .filter((p) => p.status === "active" && p.socketId !== socket.id)
//             .map((p) => ({
//               socketId: p.socketId,
//               user: p.user,
//             }));

//           socket.emit("meeting-participants", participants);

//           // Notify others
//           socket.to(meetingId).emit("user-joined", {
//             socketId: socket.id,
//             user: user,
//           });

//           console.log(`Meeting ${meetingId} now has ${room.size} participants`);
//         }
//       } catch (err) {
//         console.error("Error in join-meeting:", err);
//         socket.emit("join-error", { message: "Failed to join meeting" });
//       }
//     });

//     // Admin approves user to join
//     socket.on("admin-approve-user", async ({ meetingId, userId, socketId }) => {
//       console.log(
//         `Admin approving user ${userId} to join ${meetingId}`
//       );

//       try {
//         const meeting = await Meeting.findOne({ meetingId });
//         if (!meeting) return;

//         // Remove from waiting room
//         const waitingUser = meeting.waitingRoom.find(
//           (u) => u.userId.toString() === userId
//         );

//         meeting.waitingRoom = meeting.waitingRoom.filter(
//           (u) => u.userId.toString() !== userId
//         );

//         // Add to participants
//         if (waitingUser) {
//           meeting.participants.push({
//             socketId,
//             userId: waitingUser.userId,
//             userName: waitingUser.userName,
//             email: waitingUser.email,
//             status: "approved",
//             permissions: {
//               canUnmute: true,
//               canToggleVideo: true,
//               canScreenShare: false,
//               canChat: true,
//             },
//           });
//         }

//         await meeting.save();

//         // Update in-memory room
//         const room = meetingRooms.get(meetingId);
//         if (room) {
//           const user = room.get(socketId);
//           if (user) {
//             user.status = "active";
//           }
//         }

//         // Send chat history to newly approved user
//         const messages = await ChatMessage.find({ meetingId }).sort({
//           timestamp: 1,
//         });
//         io.to(socketId).emit("chat-history", messages);

//         // Notify the user
//         io.to(socketId).emit("approval-granted", {
//           message: "You have been approved to join the meeting",
//         });

//         // Get participant list
//         if (room) {
//           const participants = Array.from(room.values())
//             .filter((p) => p.status === "active" && p.socketId !== socketId)
//             .map((p) => ({
//               socketId: p.socketId,
//               user: p.user,
//             }));

//           io.to(socketId).emit("meeting-participants", participants);
//         }

//         // Update admin/others about new participant
//         io.to(meetingId).emit("participant-approved", {
//           socketId,
//           user: waitingUser ? { name: waitingUser.userName, _id: waitingUser.userId } : {},
//         });
//       } catch (err) {
//         console.error("Error in admin-approve-user:", err);
//       }
//     });

//     // Admin rejects user
//     socket.on("admin-reject-user", async ({ meetingId, userId, socketId }) => {
//       console.log(`Admin rejecting user ${userId}`);

//       try {
//         const meeting = await Meeting.findOne({ meetingId });
//         if (!meeting) return;

//         meeting.waitingRoom = meeting.waitingRoom.filter(
//           (u) => u.userId.toString() !== userId
//         );
//         await meeting.save();

//         // Notify the user
//         io.to(socketId).emit("approval-rejected", {
//           message: "You have been rejected from this meeting",
//         });

//         // Update in-memory
//         const room = meetingRooms.get(meetingId);
//         if (room) {
//           room.delete(socketId);
//         }
//       } catch (err) {
//         console.error("Error in admin-reject-user:", err);
//       }
//     });

//     // Admin updates user permissions
//     socket.on("admin-update-permissions", async ({ meetingId, userId, permissions }) => {
//       console.log(`Admin updating permissions for user ${userId}`);

//       try {
//         const meeting = await Meeting.findOne({ meetingId });
//         if (!meeting) return;

//         const participant = meeting.participants.find(
//           (p) => p.userId.toString() === userId
//         );

//         if (participant) {
//           participant.permissions = {
//             ...participant.permissions,
//             ...permissions,
//           };
//           await meeting.save();

//           // Notify the user about permission changes
//           const participantSocketId = participant.socketId;
//           io.to(participantSocketId).emit("permissions-updated", {
//             permissions: participant.permissions,
//           });

//           // Update admin view
//           io.to(meetingId).emit("participant-permissions-changed", {
//             userId,
//             permissions: participant.permissions,
//           });
//         }
//       } catch (err) {
//         console.error("Error in admin-update-permissions:", err);
//       }
//     });

//     // Admin removes user from meeting
//     socket.on("admin-remove-user", async ({ meetingId, userId }) => {
//       console.log(`Admin removing user ${userId} from meeting`);

//       try {
//         const meeting = await Meeting.findOne({ meetingId });
//         if (!meeting) return;

//         const participant = meeting.participants.find(
//           (p) => p.userId.toString() === userId
//         );

//         if (participant) {
//           const userSocketId = participant.socketId;

//           meeting.participants = meeting.participants.filter(
//             (p) => p.userId.toString() !== userId
//           );

//           await meeting.save();

//           // Notify the removed user
//           io.to(userSocketId).emit("removed-from-meeting", {
//             message: "You have been removed from the meeting by admin",
//           });

//           // Update other participants
//           io.to(meetingId).emit("user-removed", {
//             userId,
//             socketId: userSocketId,
//           });

//           // Update in-memory
//           const room = meetingRooms.get(meetingId);
//           if (room) {
//             room.delete(userSocketId);
//           }
//         }
//       } catch (err) {
//         console.error("Error in admin-remove-user:", err);
//       }
//     });

//     // Get meeting state (for admin panel)
//     socket.on("get-meeting-state", async ({ meetingId }) => {
//       try {
//         const meeting = await Meeting.findOne({ meetingId });

//         if (!meeting) return;

//         socket.emit("meeting-state", {
//           participants: meeting.participants,
//           waitingRoom: meeting.waitingRoom,
//           adminSettings: meeting.adminSettings,
//         });
//       } catch (err) {
//         console.error("Error in get-meeting-state:", err);
//       }
//     });

//     // Chat message
//     socket.on("chat-message", async ({ meetingId, message, user }) => {
//       console.log("Received chat-message:", { meetingId, message, user });

//       if (!meetingId) {
//         console.error("No meetingId provided in chat-message event");
//         return;
//       }

//       if (!user || !user._id) {
//         console.error("User or user._id is missing:", user);
//         return;
//       }

//       const timestamp = Date.now();

//       // Save message to DB
//       try {
//         const chatMsg = new ChatMessage({
//           meetingId: meetingId,
//           user: {
//             _id: user._id,
//             name: user.name,
//           },
//           message: message,
//           timestamp: timestamp,
//         });
//         await chatMsg.save();
//         console.log("Chat message saved to DB successfully!");
//       } catch (err) {
//         console.error("Error saving chat message:", err);
//       }

//       // Emit message to all participants in the meeting
//       io.to(meetingId).emit("chat-message", { message, user, timestamp });
//     });

//     // WebRTC signaling events
//     socket.on("webrtc-offer", ({ to, sdp, fromUser }) => {
//       console.log(`Relaying WebRTC offer from ${socket.id} to ${to}`);
//       io.to(to).emit("webrtc-offer", {
//         from: socket.id,
//         sdp,
//         fromUser,
//       });
//     });

//     socket.on("webrtc-answer", ({ to, sdp }) => {
//       console.log(`Relaying WebRTC answer from ${socket.id} to ${to}`);
//       io.to(to).emit("webrtc-answer", {
//         from: socket.id,
//         sdp,
//       });
//     });

//     socket.on("ice-candidate", ({ to, candidate }) => {
//       io.to(to).emit("ice-candidate", {
//         from: socket.id,
//         candidate,
//       });
//     });

//     // Handle disconnection
//     socket.on("disconnect", () => {
//       console.log("User disconnected:", socket.id);

//       if (currentMeeting) {
//         handleUserLeave(socket, currentMeeting);
//       }
//     });

//     // Helper function to handle user leaving
//     function handleUserLeave(socket, meetingId) {
//       const room = meetingRooms.get(meetingId);

//       if (room) {
//         const hadUser = room.has(socket.id);
//         room.delete(socket.id);

//         if (hadUser) {
//           console.log(`User ${socket.id} left meeting ${meetingId}`);

//           // Notify others about user leaving
//           socket.to(meetingId).emit("user-left", {
//             socketId: socket.id,
//           });

//           // Clean up empty rooms
//           if (room.size === 0) {
//             meetingRooms.delete(meetingId);
//             console.log(`Meeting ${meetingId} is now empty and removed from memory`);
//           } else {
//             console.log(`Meeting ${meetingId} now has ${room.size} participants`);
//           }
//         }
//       }

//       // Leave the socket.io room
//       socket.leave(meetingId);

//       // Clear current meeting tracking
//       if (currentMeeting === meetingId) {
//         currentMeeting = null;
//         currentUser = null;
//       }
//     }
//   });

//   // Optional: Clean up stale meetings periodically
//   setInterval(() => {
//     for (const [meetingId, room] of meetingRooms.entries()) {
//       if (room.size === 0) {
//         meetingRooms.delete(meetingId);
//         console.log(`Cleaned up empty meeting: ${meetingId}`);
//       }
//     }
//   }, 60000); // Every minute

//   return io;
// };

// const { Server } = require("socket.io");
// const Meeting = require("./models/Meeting");
// const ChatMessage = require("./models/ChatMessage");

// // This new structure will hold the state for all participants,
// // including their permissions and who is in the lobby.
// const meetingRooms = new Map();
// // {
// //   meetingId: {
// //     adminSocketId: "socketId",
// //     participants: Map<socketId, { user, permissions }>,
// //     waitingRoom: Map<socketId, { user }>
// //   }
// // }

// module.exports = (server) => {
//   const io = new Server(server, {
//     cors: {
//       origin: process.env.FRONTEND_URL || "*",
//       methods: ["GET", "POST"],
//     },
//     pingTimeout: 60000,
//     pingInterval: 25000,
//   });

//   io.on("connection", (socket) => {
//     console.log("User connected:", socket.id);

//     // Helper to get admin socket ID from our map
//     const getAdminSocketId = (meetingId) => {
//       return meetingRooms.get(meetingId)?.adminSocketId;
//     };

//     // Helper function to get all participants for a room
//     const getRoomParticipants = (meetingId) => {
//       if (!meetingRooms.has(meetingId)) {
//         return [];
//       }
//       return Array.from(meetingRooms.get(meetingId).participants.values());
//     };

//     // Helper function to admit a user
//     const admitUser = (meetingId, socketId, user) => {
//       const room = meetingRooms.get(meetingId);
//       if (!room || !room.waitingRoom.has(socketId)) {
//         console.warn(`Could not admit user ${socketId}: Not found in waiting room.`);
//         return;
//       }

//       // 1. Move user from waiting to participants
//       room.waitingRoom.delete(socketId);
//       const participantData = {
//         socketId: socketId,
//         user: user,
//         permissions: { // Default permissions for a new user
//           canUnmute: false,
//           canShareVideo: false,
//           canShareScreen: false
//         }
//       };
//       room.participants.set(socketId, participantData);

//       // 2. Notify the newly admitted user
//       const targetSocket = io.sockets.sockets.get(socketId);
//       if (targetSocket) {
//         targetSocket.emit("joined-meeting", {
//           permissions: participantData.permissions,
//           isAdmin: false // They are being admitted, so they are not admin
//         });

//         // 3. Send them the list of *other* participants
//         const otherParticipants = getRoomParticipants(meetingId).filter(p => p.socketId !== socketId);
//         targetSocket.emit("meeting-participants", otherParticipants);

//         // 4. Notify everyone else (including admin) that this user has joined
//         targetSocket.to(meetingId).emit("user-joined", participantData);
//         console.log(`User ${user.name} (${socketId}) admitted to meeting ${meetingId}`);
//       }
//     };

//     // --- Main Join Meeting Event ---
//     socket.on("join-meeting", async ({ meetingId, user }) => {
//       if (!user || !user._id) {
//         console.error("Join attempt failed: User object is invalid", user);
//         socket.emit("error", { message: "Invalid user data." });
//         return;
//       }

//       console.log(`User ${user.name} (${socket.id}) attempting to join meeting ${meetingId}`);
//       socket.join(meetingId);

//       // Store user data on socket for easier access
//       socket.user = user;
//       socket.meetingId = meetingId;

//       // --- Check if user is the admin (creator) ---
//       let meeting;
//       try {
//         meeting = await Meeting.findOne({ meetingId });
//         if (!meeting) {
//           console.warn(`Meeting ${meetingId} not found in database.`);
//           socket.emit("error", { message: "Meeting not found." });
//           socket.leave(meetingId);
//           return;
//         }
//       } catch (err) {
//         console.error("Error fetching meeting:", err);
//         socket.emit("error", { message: "Database error." });
//         socket.leave(meetingId);
//         return;
//       }

//       const isAdmin = meeting.createdBy.toString() === user._id;

//       // --- Initialize room in memory if it doesn't exist ---
//       if (!meetingRooms.has(meetingId)) {
//         meetingRooms.set(meetingId, {
//           adminSocketId: null,
//           participants: new Map(),
//           waitingRoom: new Map()
//         });
//       }
//       const room = meetingRooms.get(meetingId);

//       // --- Handle Admin Join ---
//       if (isAdmin) {
//         console.log(`Admin ${user.name} (${socket.id}) joined meeting ${meetingId}`);
//         room.adminSocketId = socket.id;
//         const participantData = {
//           socketId: socket.id,
//           user: user,
//           permissions: { // Admins have all permissions
//             canUnmute: true,
//             canShareVideo: true,
//             canShareScreen: true
//           }
//         };
//         room.participants.set(socket.id, participantData);

//         // Notify admin they have joined
//         socket.emit("joined-meeting", {
//           permissions: participantData.permissions,
//           isAdmin: true
//         });

//         // Send admin the list of existing participants and waiting users
//         const participants = Array.from(room.participants.values()).filter(p => p.socketId !== socket.id);
//         socket.emit("meeting-participants", participants);

//         const waiting = Array.from(room.waitingRoom.entries()).map(([socketId, data]) => ({ socketId, user: data.user }));
//         socket.emit("waiting-room-list", waiting); // Send current lobby list

//         // Notify other participants that admin joined
//         socket.to(meetingId).emit("user-joined", participantData);

//       // --- Handle Participant Join (Lobby) ---
//       } else {
//         console.log(`Participant ${user.name} (${socket.id}) added to waiting room for ${meetingId}`);
//         room.waitingRoom.set(socket.id, { user });

//         // Notify the admin (if they are connected)
//         const adminSocketId = getAdminSocketId(meetingId);
//         if (adminSocketId) {
//           io.to(adminSocketId).emit("user-requested-join", { socketId: socket.id, user });
//         }

//         // Note: The user is NOT fully "joined" yet, so we don't send them participant lists
//         // They will wait on the client-side until they receive a "joined-meeting" event.
//       }

//       // --- Send Chat History (do this for everyone) ---
//       try {
//         const messages = await ChatMessage.find({ meetingId }).sort({ timestamp: 1 }).populate("user", "name _id");
//         console.log(`Sending ${messages.length} chat messages to ${user.name}`);
//         socket.emit("chat-history", messages);
//       } catch (err) {
//         console.error("Error fetching chat messages:", err);
//       }
//     });

//     // --- Admin Action: Admit User ---
//     socket.on("admin-admit-user", ({ meetingId, targetSocketId }) => {
//       const room = meetingRooms.get(meetingId);
//       // Security check: Only admin can perform this
//       if (!room || room.adminSocketId !== socket.id) {
//         console.warn(`Security: Non-admin ${socket.id} tried to admit user.`);
//         return;
//       }

//       const waitingUser = room.waitingRoom.get(targetSocketId);
//       if (waitingUser) {
//         admitUser(meetingId, targetSocketId, waitingUser.user);
//       } else {
//         console.warn(`Admin tried to admit user ${targetSocketId} who is not in waiting room.`);
//       }
//     });

//     // --- Admin Action: Deny User ---
//     socket.on("admin-deny-user", ({ meetingId, targetSocketId }) => {
//       const room = meetingRooms.get(meetingId);
//       if (!room || room.adminSocketId !== socket.id) {
//         console.warn(`Security: Non-admin ${socket.id} tried to deny user.`);
//         return;
//       }

//       if (room.waitingRoom.has(targetSocketId)) {
//         room.waitingRoom.delete(targetSocketId);
//         // Notify the user they were denied
//         io.to(targetSocketId).emit("join-denied", { message: "The host denied your request to join." });
//         // Force disconnect the denied user
//         io.sockets.sockets.get(targetSocketId)?.disconnect();
//         console.log(`Admin denied and disconnected user ${targetSocketId}`);
//       }
//     });

//     // --- Admin Action: Grant Permission ---
//     socket.on("admin-grant-permission", ({ meetingId, targetSocketId, permission, status }) => {
//       const room = meetingRooms.get(meetingId);
//       // Security check: Only admin can perform this
//       if (!room || room.adminSocketId !== socket.id) {
//         console.warn(`Security: Non-admin ${socket.id} tried to grant permissions.`);
//         return;
//       }

//       const participant = room.participants.get(targetSocketId);
//       if (participant && participant.permissions.hasOwnProperty(permission)) {
//         participant.permissions[permission] = status;
//         console.log(`Admin set ${permission}=${status} for ${participant.user.name}`);

//         // Notify the target user of their new permissions
//         io.to(targetSocketId).emit("permission-updated", {
//           permission,
//           status,
//           allPermissions: participant.permissions
//         });

//         // Notify everyone (for UI updates in AdminPanel)
//         io.to(meetingId).emit("participant-permissions-changed", {
//             socketId: targetSocketId,
//             permissions: participant.permissions
//         });
//       }
//     });

//     // --- Existing Chat Message Handler ---
//     socket.on("chat-message", async ({ meetingId, message, user }) => {
//       if (!meetingId || !user || !user._id) {
//         console.error("Invalid chat message payload:", { meetingId, message, user });
//         return;
//       }
//       const timestamp = new Date();
//       // Emit to room first for speed
//       io.to(meetingId).emit("chat-message", { message, user, timestamp });

//       // Save to DB
//       try {
//         const chatMsg = new ChatMessage({
//           meetingId: meetingId,
//           user: user._id, // Only store the ID reference
//           message: message,
//           timestamp: timestamp,
//         });
//         await chatMsg.save();
//       } catch (err) {
//         console.error("Error saving chat message:", err);
//       }
//     });

//     // --- Existing WebRTC Signaling Handlers ---
//     socket.on("webrtc-offer", ({ to, sdp }) => {
//       // console.log(`Relaying WebRTC offer from ${socket.id} to ${to}`);
//       io.to(to).emit("webrtc-offer", { from: socket.id, sdp });
//     });

//     socket.on("webrtc-answer", ({ to, sdp }) => {
//       // console.log(`Relaying WebRTC answer from ${socket.id} to ${to}`);
//       io.to(to).emit("webrtc-answer", { from: socket.id, sdp });
//     });

//     socket.on("ice-candidate", ({ to, candidate }) => {
//       // console.log(`Relaying ICE candidate from ${socket.id} to ${to}`);
//       io.to(to).emit("ice-candidate", { from: socket.id, candidate });
//     });

//     // --- Disconnect Handler (Updated) ---
//     socket.on("disconnect", () => {
//       console.log(`User disconnected: ${socket.id}`);
//       const meetingId = socket.meetingId; // Get meetingId stored on socket
//       if (meetingId && meetingRooms.has(meetingId)) {
//         handleUserLeave(socket, meetingId);
//       }
//     });

//     // --- Explicit Leave Handler ---
//     socket.on("leave-meeting", () => {
//         const meetingId = socket.meetingId;
//         console.log(`User ${socket.id} explicitly leaving meeting ${meetingId}`);
//         if (meetingId && meetingRooms.has(meetingId)) {
//              handleUserLeave(socket, meetingId);
//         }
//     });

//     // --- Centralized Leave/Cleanup Logic ---
//     function handleUserLeave(socket, meetingId) {
//       const room = meetingRooms.get(meetingId);
//       if (!room) return;

//       const user = socket.user || {};
//       console.log(`Handling leave for ${user.name || 'unknown user'} (${socket.id}) from ${meetingId}`);

//       let wasInWaitingRoom = false;
//       let wasInParticipants = false;

//       // Remove from waiting room
//       if (room.waitingRoom.has(socket.id)) {
//         room.waitingRoom.delete(socket.id);
//         wasInWaitingRoom = true;
//       }

//       // Remove from participants
//       if (room.participants.has(socket.id)) {
//         room.participants.delete(socket.id);
//         wasInParticipants = true;
//       }

//       // If user was an admin, clear the adminSocketId
//       if (room.adminSocketId === socket.id) {
//         console.log(`Admin ${socket.id} left meeting ${meetingId}`);
//         room.adminSocketId = null;
//         // Future logic: implement admin promotion here
//       }

//       // Notify relevant parties
//       if (wasInWaitingRoom) {
//         // Notify admin that a waiting user left
//         const adminSocketId = getAdminSocketId(meetingId);
//         if (adminSocketId) {
//           io.to(adminSocketId).emit("waiting-user-left", { socketId: socket.id });
//         }
//       }

//       if (wasInParticipants) {
//         // Notify all remaining participants in the room
//         socket.to(meetingId).emit("user-left", { socketId: socket.id });
//       }

//       // Leave the socket.io room
//       socket.leave(meetingId);

//       // Clean up empty rooms
//       if (room.participants.size === 0 && room.waitingRoom.size === 0) {
//         meetingRooms.delete(meetingId);
//         console.log(`Meeting ${meetingId} is now empty and removed from memory.`);
//       } else {
//         console.log(`Meeting ${meetingId} now has ${room.participants.size} participants and ${room.waitingRoom.size} waiting.`);
//       }
//     }
//   });

//   console.log("Socket.io server initialized.");
//   return io;
// };

// const { Server } = require("socket.io");
// const Meeting = require("./models/Meeting");
// const ChatMessage = require("./models/ChatMessage");

// module.exports = (server) => {
//   const io = new Server(server, {
//     cors: {
//       origin: process.env.FRONTEND_URL || "*",
//       methods: ["GET", "POST"],
//     },
//     pingTimeout: 60000,
//     pingInterval: 25000,
//   });

//   // Store meeting rooms in memory for better tracking
//   const meetingRooms = new Map();

//   io.on("connection", (socket) => {
//     console.log("User connected:", socket.id);

//     let currentMeeting = null;
//     let currentUser = null;

//     // Join meeting
//     socket.on("join-meeting", async ({ meetingId, user }) => {
//       console.log(`User ${user.name} (${socket.id}) joining meeting ${meetingId}`);

//       // Clean up previous meeting if exists
//       if (currentMeeting && currentMeeting !== meetingId) {
//         handleUserLeave(socket, currentMeeting);
//       }

//       // Check if user is allowed to join
//       const meeting = await Meeting.findOne({ meetingId });
//       if (!meeting) {
//         socket.emit("join-denied", { message: "Meeting not found" });
//         return;
//       }
//       if (meeting.allowedUsers.length && !meeting.allowedUsers.includes(user._id) && user._id !== meeting.createdBy.toString()) {
//         socket.emit("join-denied", { message: "You are not allowed to join this meeting." });
//         return;
//       }

//       socket.join(meetingId);
//       socket.user = user;
//       socket.meetingId = meetingId;
//       currentMeeting = meetingId;
//       currentUser = user;

//       // Initialize room if it doesn't exist
//       if (!meetingRooms.has(meetingId)) {
//         meetingRooms.set(meetingId, new Map());
//       }

//       const room = meetingRooms.get(meetingId);

//       // Add/update user in room
//       room.set(socket.id, { socketId: socket.id, user });

//       // Send previous chat messages to this user
//       try {
//         const messages = await ChatMessage.find({ meetingId }).sort({ timestamp: 1 });
//         socket.emit("chat-history", messages);
//       } catch (err) {
//         console.error("Error fetching chat messages:", err);
//       }

//       // Get current participants from our Map
//       const participants = Array.from(room.values());

//       // Send list of OTHER participants to the new user
//       const otherParticipants = participants.filter(p => p.socketId !== socket.id);
//       socket.emit("meeting-participants", otherParticipants);

//       // Notify existing participants about the new user
//       socket.to(meetingId).emit("user-joined", { socketId: socket.id, user });

//       console.log(`Meeting ${meetingId} now has ${room.size} participants`);
//     });

//     // Explicit leave meeting
//     socket.on("leave-meeting", ({ meetingId }) => {
//       handleUserLeave(socket, meetingId);
//     });

//     // Chat message
//     socket.on("chat-message", async ({ meetingId, message, user }) => {
//       if (!meetingId || !user?._id) return;

//       const timestamp = Date.now();
//       try {
//         const chatMsg = new ChatMessage({ meetingId, user: { _id: user._id, name: user.name }, message, timestamp });
//         await chatMsg.save();
//       } catch (err) {
//         console.error("Error saving chat message:", err);
//       }

//       io.to(meetingId).emit("chat-message", { message, user, timestamp });
//     });

//     // WebRTC signaling events
//     socket.on("webrtc-offer", ({ to, sdp, fromUser }) => {
//       io.to(to).emit("webrtc-offer", { from: socket.id, sdp, fromUser });
//     });

//     socket.on("webrtc-answer", ({ to, sdp }) => {
//       io.to(to).emit("webrtc-answer", { from: socket.id, sdp });
//     });

//     socket.on("ice-candidate", ({ to, candidate }) => {
//       io.to(to).emit("ice-candidate", { from: socket.id, candidate });
//     });

//     // Admin controls: screen share request
//     socket.on("request-screen-share", async () => {
//       const meeting = await Meeting.findOne({ meetingId: socket.meetingId });
//       if (!meeting) return;

//       if (meeting.screenShareUsers.includes(socket.user._id) || meeting.createdBy.toString() === socket.user._id) {
//         io.to(socket.id).emit("screen-share-allowed");
//       } else {
//         io.to(socket.id).emit("screen-share-denied");
//       }
//     });

//     // Admin controls: remote mute/unmute or video toggle
//     socket.on("admin-toggle-media", ({ targetId, action }) => {
//       // action: "mute", "unmute", "video-off", "video-on"
//       const meeting = meetingRooms.get(socket.meetingId);
//       if (!meeting) return;

//       const adminId = Array.from(meeting.values()).find(p => p.user._id === meeting.createdBy.toString());
//       if (socket.user._id !== meeting.createdBy.toString()) return; // only admin

//       io.to(targetId).emit("admin-toggle-media", { action });
//     });

//     // Handle disconnection
//     socket.on("disconnect", () => {
//       if (currentMeeting) handleUserLeave(socket, currentMeeting);
//     });

//     // Helper function to handle user leaving
//     function handleUserLeave(socket, meetingId) {
//       const room = meetingRooms.get(meetingId);
//       if (room) {
//         const hadUser = room.has(socket.id);
//         room.delete(socket.id);

//         if (hadUser) {
//           socket.to(meetingId).emit("user-left", { socketId: socket.id });
//           if (room.size === 0) meetingRooms.delete(meetingId);
//         }
//       }
//       socket.leave(meetingId);
//       if (currentMeeting === meetingId) {
//         currentMeeting = null;
//         currentUser = null;
//       }
//     }
//   });

//   // Clean up empty meetings every minute
//   setInterval(() => {
//     for (const [meetingId, room] of meetingRooms.entries()) {
//       if (room.size === 0) {
//         meetingRooms.delete(meetingId);
//       }
//     }
//   }, 60000);

//   return io;
// };

// socket.js
// const { Server } = require("socket.io");
// const Meeting = require("./models/Meeting");
// const ChatMessage = require("./models/ChatMessage");

// module.exports = (server) => {
//   const io = new Server(server, {
//     cors: {
//       origin: process.env.FRONTEND_URL || "*",
//       methods: ["GET", "POST"],
//     },
//     pingTimeout: 60000,
//     pingInterval: 25000,
//   });

//   // Store meeting rooms in memory for better tracking
//   // Structure: Map<meetingId, Map<socketId, { socketId, user, permissions: { canJoin, canUnmute, canVideo, canScreenShare } }>>
//   const meetingRooms = new Map();
//   const pendingJoinRequests = new Map(); // Map<meetingId, Map<socketId, user>>
//   io.on("connection", (socket) => {
//     console.log("User connected:", socket.id);

//     let currentMeeting = null;
//     let currentUser = null;

//     socket.on("request-join", ({ meetingId, user }) => {
//       console.log(
//         `[Join Request] ${user.name} (${socket.id}) requests to join meeting ${meetingId}`
//       );

//       // If no meeting room yet, create it
//       if (!meetingRooms.has(meetingId)) {
//         meetingRooms.set(meetingId, new Map());
//       }

//       const room = meetingRooms.get(meetingId);

//       // If there is no admin yet, make the first user admin (auto approve)
//       if (room.size === 0) {
//         console.log(`[Auto Approve] No admin yet. ${user.name} becomes admin.`);
//         socket.emit("join-approved", { meetingId });
//         return;
//       }

//       // Get the admin (first user in the room)
//       const [adminSocketId] = room.keys();
//       console.log(
//         `[Request Sent] Forwarding join request of ${user.name} to admin ${adminSocketId}`
//       );

//       // Inside request-join handler
//       if (!pendingJoinRequests.has(meetingId)) {
//         pendingJoinRequests.set(meetingId, new Map());
//       }
//       const pending = pendingJoinRequests.get(meetingId);
//       pending.set(socket.id, user);

//       io.to(adminSocketId).emit("join-request", {
//         meetingId,
//         user,
//         requesterId: socket.id,
//       });
//     });
//     // ---------------- JOIN MEETING ----------------
//     socket.on("join-meeting", async ({ meetingId, user }) => {
//       // Initialize room if it doesn't exist
//       if (!meetingRooms.has(meetingId)) {
//         meetingRooms.set(meetingId, new Map());
//       }

//       const room = meetingRooms.get(meetingId);

//       // Admin logic: first user in room is creator/admin
//       if (room.size === 0) {
//         socket.isAdmin = true; // mark this socket as admin
//         console.log(`[Admin Set] ${user.name} is admin for ${meetingId}`);
//       } else {
//         socket.isAdmin = false;
//       }
//       // Default permissions
//       const permissions = {
//         canJoin: true,
//         canUnmute: socket.isAdmin, // use the socket.isAdmin value
//         canVideo: socket.isAdmin,
//         canScreenShare: socket.isAdmin,
//       };

//       room.set(socket.id, { socketId: socket.id, user, permissions });

//       // Check if user is allowed to join
//       if (!permissions.canJoin) {
//         socket.emit("join-denied", {
//           message: "You are not allowed to join this meeting.",
//         });
//         return;
//       }
//       if (room.size > 0) {
//         const adminId = Array.from(room.keys())[0];
//         if (!room.get(adminId)?.permissions.canJoin && socket.id !== adminId) {
//           socket.emit("join-denied", { message: "Admin approval required." });
//           return;
//         }
//       }
//       socket.join(meetingId);
//       socket.user = user;
//       socket.meetingId = meetingId;
//       currentMeeting = meetingId;
//       currentUser = user;

//       // Send previous chat messages to this user
//       try {
//         const messages = await ChatMessage.find({ meetingId }).sort({
//           timestamp: 1,
//         });
//         socket.emit("chat-history", messages);
//       } catch (err) {
//         console.error("Error fetching chat messages:", err);
//       }

//       // Send current participants to this user
//       const participants = Array.from(room.values());
//       const otherParticipants = participants
//         .filter((p) => p.socketId !== socket.id)
//         .map((p, index) => ({
//           ...p,
//           isAdmin: index === 0, // first participant is admin
//         }));

//       socket.emit("meeting-participants", otherParticipants);

//       // Notify existing participants about the new user
//       socket.to(meetingId).emit("user-joined", { socketId: socket.id, user });

//       console.log(`Meeting ${meetingId} now has ${room.size} participants`);
//     });

//     // ---------------- LEAVE MEETING ----------------
//     socket.on("leave-meeting", ({ meetingId }) => {
//       handleUserLeave(socket, meetingId);
//     });

//     // ---------------- CHAT MESSAGE ----------------
//     socket.on("chat-message", async ({ meetingId, message, user }) => {
//       if (!meetingId || !user || !user._id) return;

//       const timestamp = Date.now();

//       try {
//         const chatMsg = new ChatMessage({
//           meetingId,
//           user: { _id: user._id, name: user.name },
//           message,
//           timestamp,
//         });
//         await chatMsg.save();
//       } catch (err) {
//         console.error("Error saving chat message:", err);
//       }

//       io.to(meetingId).emit("chat-message", { message, user, timestamp });
//     });

//     // ---------------- WEBRTC SIGNALING ----------------
//     socket.on("webrtc-offer", ({ to, sdp, fromUser }) => {
//       io.to(to).emit("webrtc-offer", { from: socket.id, sdp, fromUser });
//     });

//     socket.on("webrtc-answer", ({ to, sdp }) => {
//       io.to(to).emit("webrtc-answer", { from: socket.id, sdp });
//     });

//     socket.on("ice-candidate", ({ to, candidate }) => {
//       io.to(to).emit("ice-candidate", { from: socket.id, candidate });
//     });

//     // ---------------- ADMIN CONTROL ----------------
//     // Admin grants/revokes permissions for a participant
//     socket.on("admin-toggle-media", ({ targetId, action }) => {
//       const room = meetingRooms.get(socket.meetingId);
//       if (!room) return;
//       const admin = room.get(socket.id);
//       if (!isUserAdmin(socket)) return; // Only admin can use this

//       const target = room.get(targetId);
//       if (!target) return;

//       switch (action) {
//         case "mute":
//           target.permissions.canUnmute = false;
//           io.to(targetId).emit("admin-toggle-media", {
//             action: "mute",
//             canUnmute: false,
//           });
//           break;
//         case "unmute":
//           target.permissions.canUnmute = true;
//           io.to(targetId).emit("admin-toggle-media", {
//             action: "unmute",
//             canUnmute: true,
//           });
//           break;
//         case "video-off":
//           if (!isUserAdmin(socket)) target.permissions.canVideo = false;
//           io.to(targetId).emit("admin-toggle-media", {
//             action: "video-off",
//             canVideo: isUserAdmin(socket) ? true : false,
//           });
//           break;

//         case "video-on":
//           if (!isUserAdmin(socket)) target.permissions.canVideo = true;
//           io.to(targetId).emit("admin-toggle-media", {
//             action: "video-on",
//             canVideo: true,
//           });
//           break;

//         case "allow-screen":
//           target.permissions.canScreenShare = true;
//           io.to(targetId).emit("screen-share-permission", { allowed: true });
//           break;
//         case "deny-screen":
//           target.permissions.canScreenShare = false;
//           io.to(targetId).emit("screen-share-permission", { allowed: false });
//           break;
//         case "allow-join":
//           target.permissions.canJoin = true;
//           break;
//         case "deny-join":
//           target.permissions.canJoin = false;
//           io.to(targetId).emit("join-denied", {
//             message: "Admin denied your entry.",
//           });
//           const targetSocket = io.sockets.sockets.get(targetId);
//           if (targetSocket) {
//             targetSocket.leave(currentMeeting);
//           }
//           room.delete(targetId);
//           io.to(currentMeeting).emit("user-left", { socketId: targetId });
//           break;
//       }
//     });

//     socket.on("approve-join", ({ meetingId, requesterId }) => {
//       const room = meetingRooms.get(meetingId);
//       const pending = pendingJoinRequests.get(meetingId);
//       if (!pending || !pending.has(requesterId)) return;

//       const user = pending.get(requesterId);

//       // Add user to the room
//       const permissions = {
//         canJoin: true,
//         canUnmute: false,
//         canVideo: false,
//         canScreenShare: false,
//       };
//       const targetSocket = io.sockets.sockets.get(requesterId);
//       if (targetSocket) {
//         targetSocket.join(meetingId); // Add to Socket.IO room
//         targetSocket.emit("join-approved", { meetingId });
//       }

//       room.set(requesterId, {
//         socketId: requesterId,
//         user,
//         permissions: {
//           canJoin: true,
//           canUnmute: false,
//           canVideo: false,
//           canScreenShare: false,
//         },
//       });

//       // Remove from pending
//       pending.delete(requesterId);
//     });

//     socket.on("deny-join", ({ meetingId, requesterId }) => {
//       const pending = pendingJoinRequests.get(meetingId);
//       if (!pending || !pending.has(requesterId)) return;

//       io.to(requesterId).emit("join-denied", {
//         reason: "Admin denied your request.",
//       });

//       // Remove from pending
//       pending.delete(requesterId);
//     });

//     // ---------------- SCREEN SHARE REQUEST ----------------
//     socket.on("request-screen-share", () => {
//       const room = meetingRooms.get(currentMeeting);
//       const userData = room.get(socket.id);
//       if (!userData) return socket.emit("screen-share-denied");
//       if (userData.permissions.canScreenShare) {
//         io.to(currentMeeting).emit("screen-share-started", {
//           socketId: socket.id,
//         });
//       } else {
//         socket.emit("screen-share-denied");
//       }
//     });

//     // ---------------- DISCONNECT ----------------
//     socket.on("disconnect", () => {
//       handleUserLeave(socket, currentMeeting);
//     });

//     // ---------------- HELPER FUNCTIONS ----------------
//     function handleUserLeave(socket, meetingId) {
//       if (!meetingId) return;
//       const room = meetingRooms.get(meetingId);
//       if (!room) return;

//       const hadUser = room.has(socket.id);
//       room.delete(socket.id);

//       if (hadUser) {
//         socket.to(meetingId).emit("user-left", { socketId: socket.id });

//         if (room.size === 0) {
//           meetingRooms.delete(meetingId);
//           console.log(`Meeting ${meetingId} is empty and removed`);
//         } else {
//           console.log(`Meeting ${meetingId} now has ${room.size} participants`);
//         }
//       }

//       socket.leave(meetingId);
//     }

//     function isUserAdmin(socket) {
//       const room = meetingRooms.get(socket.meetingId);
//       if (!room) return false;
//       const firstUserId = Array.from(room.keys())[0];
//       return firstUserId === socket.id; // check the actual socket id
//     }
//   });

//   // ---------------- CLEANUP STALE MEETINGS ----------------
//   setInterval(() => {
//     for (const [meetingId, room] of meetingRooms.entries()) {
//       if (room.size === 0) {
//         meetingRooms.delete(meetingId);
//         pendingJoinRequests.delete(meetingId);
//         console.log(`Cleaned up empty meeting: ${meetingId}`);
//       }
//     }
//   }, 60000);

//   return io;
// };



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
  // Track admitted participants separately for WebRTC coordination
  const admittedParticipants = new Map(); // meetingId -> Set of socketIds

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
          status: 'pending' // Will be updated to 'admitted' or 'waiting'
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

          // Get current waiting room users
          const waiting = Array.from(room.values()).filter(p => p.status === 'waiting');
          console.log(`⏳ [ADMIN] Current waiting room: ${waiting.length} users`);
          waiting.forEach(w => {
            socket.emit("admission-request", {
              userId: w.userId,
              name: w.user.name,
              socketId: w.socketId
            });
          });

          // Notify other admitted participants
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

            // Notify ALL admin sockets
            console.log(`📢 [NOTIFY] Notifying admins of join request`);
            let notified = 0;
            for (const [sid, data] of room.entries()) {
              if (data.isAdmin) {
                console.log(`   -> Notifying admin socket ${sid}`);
                io.to(sid).emit("admission-request", {
                  userId: userId,
                  name: user.name,
                  socketId: socket.id
                });
                notified++;
              }
            }
            console.log(`📢 [NOTIFY-COMPLETE] Notified ${notified} admin(s)\n`);
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

        // Notify others
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
          }

          console.log(`✅ [ADMIT] User admitted, notifying socket ${socketId}`);
          io.to(socketId).emit("admission-granted", {
            permissions: participant.permissions,
            settings: meeting.settings
          });
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
          if (room) room.delete(socketId);
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
              if (participantSocket) participantSocket.disconnect(true);
              room.delete(sid);
              admitted.delete(sid);
              break;
            }
          }
        }

        const meeting = await Meeting.findOne({ meetingId });
        meeting.participants = meeting.participants.filter(
          p => p.userId.toString() !== userId.toString()
        );
        await meeting.save();
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
        await ChatMessage.create({ meetingId, user: { _id: user._id, name: user.name }, message, timestamp });
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
        room.delete(socket.id);
        if (admitted) admitted.delete(socket.id);
        
        socket.to(meetingId).emit("user-left", { socketId: socket.id });

        if (room.size === 0) {
          meetingRooms.delete(meetingId);
          admittedParticipants.delete(meetingId);
          console.log(`🗑️ [CLEANUP] Room ${meetingId} deleted`);
        }
      }

      socket.leave(meetingId);
    }
  });

  console.log("🚀 [SOCKET.IO] Server initialized");
  return io;
};