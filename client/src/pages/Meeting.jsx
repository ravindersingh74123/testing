// client/src/pages/Meeting.jsx
import React, { useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { socket } from "../services/socket";
import VideoGrid from "../components/VideoGrid";
import Controls from "../components/Controls";
import ChatPanel from "../components/ChatPanel";
import TopBar from "../components/TopBar";
import AdminPanel from "../components/AdminPanel";
import WaitingRoom, { AccessDenied } from "../components/WaitingRoomModal";

const storedUser = JSON.parse(localStorage.getItem("user")) || null;

if (storedUser && storedUser.id && !storedUser._id) {
  storedUser._id = storedUser.id;
}

const STUN_SERVERS = [{ urls: "stun:stun.l.google.com:19302" }];

export default function Meeting() {
  const { id: meetingId } = useParams();
  const navigate = useNavigate();

  const localVideoRef = useRef(null);

  const [hasJoined, setHasJoined] = useState(false);
  const [localStream, setLocalStream] = useState(null);
  const [peers, setPeers] = useState({});
  const pcsRef = useRef({}); // RTCPeerConnection objects mapped by remote socketId
  const [participants, setParticipants] = useState([]);
  const [chatMessages, setChatMessages] = useState([]);
  const [muted, setMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [sidebarContent, setSidebarContent] = useState("admin");

  const [isAdmin, setIsAdmin] = useState(false);
  const [userPermissions, setUserPermissions] = useState({
    canUnmute: true,
    canVideo: true,
    canScreenShare: true,
  });
  const [waitingRoom, setWaitingRoom] = useState([]);
  const [meetingSettings, setMeetingSettings] = useState({});

  const [inWaitingRoom, setInWaitingRoom] = useState(false);
  const [accessDenied, setAccessDenied] = useState(false);

  // Refs for logic and queues
  const pendingOffersRef = useRef([]); // [{ socketId, user }]
  const socketConnectedRef = useRef(false);
  const isJoiningRef = useRef(false);

  console.log("🎬 [MEETING-RENDER] Meeting component rendered");

  // Sync sidebar when admin toggles
  useEffect(() => {
    if (isAdmin && sidebarContent === "chat") {
      setSidebarContent("admin");
    } else if (!isAdmin && sidebarContent === "admin") {
      setSidebarContent("chat");
    }
  }, [isAdmin, sidebarContent]);

  // GET LOCAL MEDIA
  useEffect(() => {
    console.log("📹 [MEDIA] Setting up local media");
    let mounted = true;
    async function startLocal() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: true,
        });
        if (!mounted) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        console.log(
          "✅ [MEDIA] Got local stream with tracks:",
          stream.getTracks().map((t) => t.kind)
        );

        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
        }
        setLocalStream(stream);
        console.log("✅ [MEDIA] Local stream set");
      } catch (err) {
        console.error("❌ [MEDIA-ERROR] Camera/Mic error:", err);
        alert("Please allow camera and microphone access.");
      }
    }
    startLocal();
    return () => {
      mounted = false;
      if (localStream) {
        localStream.getTracks().forEach((t) => t.stop());
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // only on mount

  // KEEP hasJoined in a small effect so it can be set after meeting-joined
  useEffect(() => {
    if (hasJoined && socketConnectedRef.current) {
      console.log("⚠️ [SKIP] Already joined this session");
      return;
    }
  }, [hasJoined]);

  //
  // SOCKET CONNECTION & EVENTS (Complete robust setup)
  //
  useEffect(() => {
    if (!meetingId || !storedUser) {
      console.log("⚠️ [SOCKET] Missing meetingId or user, skipping socket setup");
      return;
    }

    if (isJoiningRef.current) {
      console.log("⚠️ [SOCKET] Already joining, skipping duplicate setup");
      return;
    }
    isJoiningRef.current = true;
    console.log("\n🔌 [SOCKET] Setting up socket connection for meeting", meetingId);

    // Ensure socket connected (singleton)
    if (!socket.connected) {
      console.log("🔌 [SOCKET] Connecting socket");
      socket.connect();
    }

    // Connect handler
    const handleConnect = () => {
      console.log("✅ [SOCKET-CONNECT] Socket connected, emitting join-meeting");
      socket.emit("join-meeting", { meetingId, user: storedUser });
      socketConnectedRef.current = true;
    };

    if (socket.connected) {
      handleConnect();
    } else {
      socket.on("connect", handleConnect);
    }

    // ---------- Handlers ----------
    const handleMeetingJoined = ({ isAdmin: adminStatus, permissions, settings }) => {
      console.log("🎉 [MEETING-JOINED] Received meeting-joined event");
      console.log("   Admin:", adminStatus);
      console.log("   Permissions:", permissions);
      console.log("   Settings:", settings);

      setIsAdmin(adminStatus);
      setUserPermissions(permissions || userPermissions);
      setMeetingSettings(settings || {});
      setInWaitingRoom(false);
      setHasJoined(true);

      // Apply initial settings
      if (settings?.muteMicOnEntry && !adminStatus) {
        console.log("🔇 [SETTINGS] Applying muteMicOnEntry");
        setMuted(true);
        if (localStream) {
          localStream.getAudioTracks().forEach((t) => (t.enabled = false));
        }
      }
      if (settings?.disableVideoOnEntry && !adminStatus) {
        console.log("📹 [SETTINGS] Applying disableVideoOnEntry");
        setCameraOff(true);
        if (localStream) {
          localStream.getVideoTracks().forEach((t) => (t.enabled = false));
        }
      }

      // Process pending offers now (if any)
      if (pendingOffersRef.current.length > 0) {
        const pending = pendingOffersRef.current.splice(0);
        console.log(`🔗 [PENDING-OFFERS] Creating ${pending.length} pending offers`);
        pending.forEach(({ socketId, user }) => {
          // Slight delay to allow localStream to stabilize
          setTimeout(() => createOfferTo(socketId, user), 250);
        });
      }
    };
    socket.on("meeting-joined", handleMeetingJoined);

    const handleWaitingRoom = () => {
      console.log("⏳ [WAITING-ROOM] Placed in waiting room");
      setInWaitingRoom(true);
    };
    socket.on("waiting-room", handleWaitingRoom);

    const handleAdmissionGranted = ({ permissions, settings }) => {
      console.log("✅ [ADMISSION-GRANTED] Admission granted");
      setInWaitingRoom(false);
      setUserPermissions(permissions || userPermissions);
      setMeetingSettings(settings || meetingSettings);
    };
    socket.on("admission-granted", handleAdmissionGranted);

    const handleAdmissionDenied = () => {
      console.log("🚫 [ADMISSION-DENIED] Access denied");
      setInWaitingRoom(false);
      setAccessDenied(true);
    };
    socket.on("admission-denied", handleAdmissionDenied);

    const handleJoinError = ({ message }) => {
      console.error("❌ [JOIN-ERROR]", message);
      alert(message);
      navigate("/");
    };
    socket.on("join-error", handleJoinError);

    const handleAdmissionRequest = (requestData) => {
      console.log("📨 [ADMISSION-REQUEST] Received admission request:", requestData);
      setWaitingRoom((prev) => {
        if (prev.some((u) => u.socketId === requestData.socketId)) {
          return prev;
        }
        return [...prev, requestData];
      });
    };
    socket.on("admission-request", handleAdmissionRequest);

    const handleUserAdmitted = ({ userId, socketId }) => {
      console.log("✅ [USER-ADMITTED] User was admitted:", userId);
      setWaitingRoom((prev) => prev.filter((u) => u.socketId !== socketId));
    };
    socket.on("user-admitted", handleUserAdmitted);

    const handlePermissionsUpdated = (permissions) => {
      console.log("🔐 [PERMISSIONS-UPDATED] Permissions updated:", permissions);
      setUserPermissions(permissions);

      // Enforce permissions client-side
      if (!permissions.canUnmute && localStream) {
        console.log("🔇 [ENFORCE] Disabling audio tracks");
        localStream.getAudioTracks().forEach((t) => (t.enabled = false));
        setMuted(true);
      }
      if (!permissions.canVideo && localStream) {
        console.log("📹 [ENFORCE] Disabling video tracks");
        localStream.getVideoTracks().forEach((t) => (t.enabled = false));
        setCameraOff(true);
      }
    };
    socket.on("permissions-updated", handlePermissionsUpdated);

    const handleRemovedByAdmin = () => {
      console.log("🚫 [REMOVED] Removed from meeting by admin");
      alert("You have been removed from the meeting by the host.");
      navigate("/");
    };
    socket.on("removed-by-admin", handleRemovedByAdmin);

    const handleScreenShareGranted = () => {
      console.log("✅ [SCREEN-SHARE] Permission granted");
      startScreenShare();
    };
    socket.on("screen-share-granted", handleScreenShareGranted);

    const handleScreenShareDenied = () => {
      console.log("🚫 [SCREEN-SHARE] Permission denied");
      alert("Screen share permission denied. Please ask the host for permission.");
    };
    socket.on("screen-share-denied", handleScreenShareDenied);

    const handleScreenShareRequest = ({ userId, name, socketId }) => {
      console.log("📨 [SCREEN-SHARE-REQUEST] Request from:", name);
    };
    socket.on("screen-share-request", handleScreenShareRequest);

    const handleChatHistory = (messages) => {
      console.log(`💬 [CHAT-HISTORY] Received ${messages.length} messages`);
      setChatMessages(messages || []);
    };
    socket.on("chat-history", handleChatHistory);

    const handleChatMessage = ({ message, user, timestamp }) => {
      console.log(`💬 [CHAT-MESSAGE] New message from ${user?.name}`);
      setChatMessages((prev) => {
        const lastMsg = prev[prev.length - 1];
        if (lastMsg && lastMsg.message === message && lastMsg.user._id === user._id) {
          console.log("   Duplicate message, ignoring");
          return prev;
        }
        return [...prev, { message, user, timestamp }];
      });
    };
    socket.on("chat-message", handleChatMessage);

    // meeting-participants: this event is sent to the joiner and contains current participants
    const handleParticipants = (list) => {
      console.log(`👥 [MEETING-PARTICIPANTS] Received ${list.length} participants`);
      list.forEach((p) => {
        console.log(`   - ${p.user?.name || "Unknown"} (${p.socketId})`);
      });

      setParticipants(list || []);

      // If localStream ready, create offers to all other participants.
      // Only the *joiner* should create offers — existing participants won't create offers on 'user-joined'
      if (localStream && localStream.active && localStream.getTracks().length > 0) {
        console.log("🔗 [OFFERS] Creating offers to current participants (joiner)");
        list.forEach((p) => {
          if (p.socketId === socket.id) return; // skip self
          if (!pcsRef.current[p.socketId]) {
            // slight stagger to avoid flooding
            setTimeout(() => createOfferTo(p.socketId, p.user), 200);
          }
        });
      } else {
        console.log("⏳ [PENDING-OFFERS] No local stream yet, queuing offers");
        list.forEach((p) => {
          if (p.socketId === socket.id) return;
          pendingOffersRef.current.push({ socketId: p.socketId, user: p.user });
        });
      }
    };
    socket.on("meeting-participants", handleParticipants);

    // user-joined: notify participants a new user arrived - existing participants SHOULD NOT create offers (avoid glare)
    const handleUserJoined = ({ socketId, user, permissions, isAdmin: userIsAdmin }) => {
      console.log(`\n👋 [USER-JOINED] ${user?.name} joined (${socketId})`);

      // Add to participants state
      setParticipants((prev) => {
        if (prev.some((x) => x.socketId === socketId)) return prev;
        return [...prev, { socketId, user, permissions, isAdmin: userIsAdmin }];
      });

      // IMPORTANT: Do NOT create offer here (existing participants). The joiner will create offers via meeting-participants.
      // However, if you want fallback behavior (rare), you could queue a pendingOffer to be processed by the joiner.
    };
    socket.on("user-joined", handleUserJoined);

    // user-left
    const handleUserLeft = ({ socketId }) => {
      console.log(`👋 [USER-LEFT] User left: ${socketId}`);
      setParticipants((prev) => prev.filter((p) => p.socketId !== socketId));
      setWaitingRoom((prev) => prev.filter((u) => u.socketId !== socketId));

      if (pcsRef.current[socketId]) {
        console.log("🧹 [CLEANUP] Closing peer connection for", socketId);
        try {
          pcsRef.current[socketId].close();
        } catch (e) {
          /* ignore */
        }
        delete pcsRef.current[socketId];
      }

      setPeers((prev) => {
        const newPeers = { ...prev };
        delete newPeers[socketId];
        return newPeers;
      });
    };
    socket.on("user-left", handleUserLeft);

    // --------------------
    // WebRTC signaling handlers
    // --------------------

    // OFFER -> we are answering
    const handleWebrtcOffer = async ({ from, sdp, fromUser }) => {
      console.log(`\n📨 [WEBRTC-OFFER] Received offer from ${from}`);
      try {
        // Close stale PC if any
        if (pcsRef.current[from]) {
          console.log("🔄 [OFFER] Closing existing connection (stale) for", from);
          try { pcsRef.current[from].close(); } catch (e) {}
          delete pcsRef.current[from];
        }
        const pc = createPeerConnection(from, fromUser);
        pcsRef.current[from] = pc;

        await pc.setRemoteDescription(new RTCSessionDescription(sdp));
        console.log("✅ [OFFER] Remote description set for", from);

        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        console.log("✅ [ANSWER] Created and set local description for", from);

        socket.emit("webrtc-answer", { to: from, sdp: pc.localDescription });
        console.log("📤 [ANSWER] Sent answer to", from);
      } catch (err) {
        console.error("❌ [OFFER-ERROR]", err);
      }
    };
    socket.on("webrtc-offer", handleWebrtcOffer);

    // ANSWER -> we initiated offer earlier
    const handleWebrtcAnswer = async ({ from, sdp }) => {
      console.log(`📨 [WEBRTC-ANSWER] Received answer from ${from}`);
      const pc = pcsRef.current[from];
      if (!pc) {
        console.log("⚠️ [WEBRTC] No PC found for answer from", from);
        return;
      }
      try {
        await pc.setRemoteDescription(new RTCSessionDescription(sdp));
        console.log("🔗 [WEBRTC] Remote description set (answer) for", from);
      } catch (err) {
        console.error("❌ [WEBRTC-ANSWER-ERROR]", err);
      }
    };
    socket.on("webrtc-answer", handleWebrtcAnswer);

    // ICE candidates
    const handleIceCandidate = async ({ from, candidate }) => {
      const pc = pcsRef.current[from];
      if (!pc) {
        console.log("⚠️ [ICE] No PC found for candidate from", from);
        return;
      }
      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
        // console.log("🧊 [ICE] Candidate added for", from);
      } catch (e) {
        console.error("❌ [ICE-ERROR]", e);
      }
    };
    socket.on("ice-candidate", handleIceCandidate);

    // --------------------
    // End of handlers
    // --------------------

    // CLEANUP: remove listeners and close PCs on unmount or meetingId change
    return () => {
      console.log("\n🧹 [SOCKET-CLEANUP] Cleaning up socket listeners");
      try {
        socket.off("connect", handleConnect);
        socket.off("meeting-joined", handleMeetingJoined);
        socket.off("waiting-room", handleWaitingRoom);
        socket.off("admission-granted", handleAdmissionGranted);
        socket.off("admission-denied", handleAdmissionDenied);
        socket.off("join-error", handleJoinError);
        socket.off("admission-request", handleAdmissionRequest);
        socket.off("user-admitted", handleUserAdmitted);
        socket.off("permissions-updated", handlePermissionsUpdated);
        socket.off("removed-by-admin", handleRemovedByAdmin);
        socket.off("screen-share-granted", handleScreenShareGranted);
        socket.off("screen-share-denied", handleScreenShareDenied);
        socket.off("screen-share-request", handleScreenShareRequest);
        socket.off("chat-history", handleChatHistory);
        socket.off("chat-message", handleChatMessage);
        socket.off("meeting-participants", handleParticipants);
        socket.off("user-joined", handleUserJoined);
        socket.off("user-left", handleUserLeft);
        socket.off("webrtc-offer", handleWebrtcOffer);
        socket.off("webrtc-answer", handleWebrtcAnswer);
        socket.off("ice-candidate", handleIceCandidate);
      } catch (e) {
        console.warn("⚠️ [SOCKET-CLEANUP] Error removing listeners", e);
      }

      // Close all peer connections
      console.log("🧹 [CLEANUP] Closing all peer connections");
      Object.values(pcsRef.current).forEach((pc) => {
        try {
          pc.close();
        } catch (e) {}
      });
      pcsRef.current = {};
      pendingOffersRef.current = [];
      socketConnectedRef.current = false;
      isJoiningRef.current = false;

      // If you want to fully disconnect the socket when leaving meeting, you can do:
      try {
        socket.disconnect();
      } catch (e) {
        /* ignore */
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meetingId, localStream, navigate]);

  //
  // Process pending offers once local stream becomes available/stable
  //
  useEffect(() => {
    if (!localStream || !localStream.active || localStream.getTracks().length === 0) {
      return;
    }

    const pending = pendingOffersRef.current.splice(0);
    if (pending.length > 0) {
      console.log(`🔗 [PENDING-OFFERS] Processing ${pending.length} pending offers`);
      pending.forEach(({ socketId, user }, i) => {
        setTimeout(() => createOfferTo(socketId, user), i * 200);
      });
    }
  }, [localStream]);

  //
  // CREATE PEER CONNECTION
  //
  function createPeerConnection(remoteSocketId, remoteUser = null) {
    console.log(`🔗 [CREATE-PC] Creating peer connection for ${remoteSocketId}`);

    const pc = new RTCPeerConnection({ iceServers: STUN_SERVERS });

    // Create a remote MediaStream and attach tracks as they arrive
    const remoteStream = new MediaStream();

    // If local stream exists, add local tracks to the pc
    if (localStream && localStream.active) {
      const tracks = localStream.getTracks();
      console.log(`📤 [PC] Adding ${tracks.length} local tracks to PC for ${remoteSocketId}`);
      tracks.forEach((t) => {
        try {
          pc.addTrack(t, localStream);
        } catch (e) {
          console.warn("⚠️ [PC-ADD-TRACK] Could not add track", e);
        }
      });
    }

    // ontrack: add remote track to remoteStream immediately (no onunmute wait)
    pc.ontrack = (ev) => {
      console.log(`📥 [PC-TRACK] Received ${ev.track.kind} track from ${remoteSocketId}`);
      if (!remoteStream.getTrackById(ev.track.id)) {
        remoteStream.addTrack(ev.track);
        console.log(`✅ [STREAM] Added ${ev.track.kind} track to remote stream for ${remoteSocketId}`);

        // Update peers state to include stream & user
        setPeers((prev) => ({
          ...prev,
          [remoteSocketId]: {
            pc,
            stream: remoteStream,
            user: remoteUser || prev[remoteSocketId]?.user || { name: "Unknown" },
          },
        }));
      }
    };

    // ICE candidate: send to remote peer
    pc.onicecandidate = (e) => {
      if (e.candidate) {
        socket.emit("ice-candidate", { to: remoteSocketId, candidate: e.candidate });
      }
    };

    pc.onconnectionstatechange = () => {
      console.log(`🔌 [PC-STATE] ${remoteSocketId}: ${pc.connectionState}`);
      if (pc.connectionState === "connected") {
        console.log(`✅ [CONNECTED] ${remoteSocketId} connected`);
      }
      if (["failed", "disconnected", "closed"].includes(pc.connectionState)) {
        console.log(`🧹 [PC-CLEANUP] Connection state ${pc.connectionState} for ${remoteSocketId}`);
        // cleanup
        setPeers((prev) => {
          const updated = { ...prev };
          delete updated[remoteSocketId];
          return updated;
        });
        if (pcsRef.current[remoteSocketId]) {
          try { pcsRef.current[remoteSocketId].close(); } catch (e) {}
          delete pcsRef.current[remoteSocketId];
        }
      }
    };

    pc.oniceconnectionstatechange = () => {
      console.log(`🧊 [ICE-STATE] ${remoteSocketId}: ${pc.iceConnectionState}`);
    };

    // Initialize peer entry immediately so UI can render placeholder
    setPeers((prev) => ({
      ...prev,
      [remoteSocketId]: {
        pc,
        stream: remoteStream,
        user: remoteUser || prev[remoteSocketId]?.user || { name: "Unknown" },
      },
    }));

    return pc;
  }

  //
  // CREATE OFFER (used by joiner when receiving meeting-participants)
  //
  async function createOfferTo(remoteSocketId, remoteUser = null) {
    console.log(`📞 [OFFER] Creating offer to ${remoteSocketId}`);

    // If we already have a PC, assume connection is in progress or connected — skip creating another offer
    if (pcsRef.current[remoteSocketId]) {
      const existing = pcsRef.current[remoteSocketId];
      if (existing.connectionState === "connected" || existing.connectionState === "connecting") {
        console.log("✅ [OFFER] Connection already exists/connecting, skipping", remoteSocketId);
        return;
      } else {
        console.log("🔄 [OFFER] Closing stale existing PC for", remoteSocketId);
        try { existing.close(); } catch (e) {}
        delete pcsRef.current[remoteSocketId];
      }
    }

    // Ensure local stream is ready
    if (!localStream || !localStream.active || localStream.getTracks().length === 0) {
      console.error("❌ [OFFER] Local stream not ready, queueing offer for", remoteSocketId);
      pendingOffersRef.current.push({ socketId: remoteSocketId, user: remoteUser });
      return;
    }

    const pc = createPeerConnection(remoteSocketId, remoteUser);
    pcsRef.current[remoteSocketId] = pc;

    try {
      // Create offer
      const offer = await pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: true });
      await pc.setLocalDescription(offer);

      console.log("📤 [OFFER] Sending offer to", remoteSocketId);
      socket.emit("webrtc-offer", {
        to: remoteSocketId,
        sdp: pc.localDescription,
        fromUser: storedUser,
      });
    } catch (err) {
      console.error("❌ [OFFER-ERROR]", err);
      if (pcsRef.current[remoteSocketId]) {
        try { pcsRef.current[remoteSocketId].close(); } catch (e) {}
        delete pcsRef.current[remoteSocketId];
      }
      setPeers((prev) => {
        const newPeers = { ...prev };
        delete newPeers[remoteSocketId];
        return newPeers;
      });
    }
  }

  //
  // Controls & Utilities
  //
  function toggleMute() {
    if (!localStream) return;
    if (!userPermissions.canUnmute && muted) {
      alert("You don't have permission to unmute. Please ask the host.");
      return;
    }

    const tracks = localStream.getAudioTracks();
    tracks.forEach((t) => (t.enabled = !t.enabled));
    const newMuted = tracks.length ? !tracks[0].enabled : false;
    console.log(`🎤 [CONTROLS] Mic ${newMuted ? "muted" : "unmuted"}`);
    setMuted(newMuted);
  }

  function toggleCamera() {
    if (!localStream) return;
    if (!userPermissions.canVideo && cameraOff) {
      alert("You don't have permission to enable video. Please ask the host.");
      return;
    }

    const tracks = localStream.getVideoTracks();
    tracks.forEach((t) => (t.enabled = !t.enabled));
    const newCameraOff = tracks.length ? !tracks[0].enabled : false;
    console.log(`📹 [CONTROLS] Camera ${newCameraOff ? "off" : "on"}`);
    setCameraOff(newCameraOff);
  }

  async function handleScreenShare() {
    if (!userPermissions.canScreenShare && !isAdmin) {
      console.log("📨 [SCREEN-SHARE] Requesting permission");
      socket.emit("request-screen-share", { meetingId });
      alert("Screen share request sent to the host.");
      return;
    }
    startScreenShare();
  }

  async function startScreenShare() {
    console.log("🖥️ [SCREEN-SHARE] Starting screen share");
    if (!navigator.mediaDevices.getDisplayMedia)
      return alert("Screen sharing not supported.");

    try {
      const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
      const screenTrack = screenStream.getVideoTracks()[0];

      console.log("🔄 [SCREEN-SHARE] Replacing video tracks in all peer connections");
      Object.values(pcsRef.current).forEach((pc) => {
        const sender = pc.getSenders().find((s) => s.track?.kind === "video");
        if (sender) {
          sender.replaceTrack(screenTrack).catch((e) => console.warn("⚠️ [REPLACE-TRACK] ", e));
        }
      });

      screenTrack.onended = () => {
        console.log("🛑 [SCREEN-SHARE] Screen share ended, restoring camera");
        if (!localStream) return;
        const camTrack = localStream.getVideoTracks()[0];
        Object.values(pcsRef.current).forEach((pc) => {
          const sender = pc.getSenders().find((s) => s.track?.kind === "video");
          if (sender && camTrack) {
            sender.replaceTrack(camTrack).catch((e) => console.warn("⚠️ [REPLACE-BACK] ", e));
          }
        });
      };
    } catch (err) {
      console.error("❌ [SCREEN-SHARE-ERROR]", err);
    }
  }

  // SEND CHAT
  async function sendChat(message) {
    if (!message?.trim()) return;
    const user = storedUser;
    if (!user) return alert("User not logged in");

    const userId = user._id || user.id;
    if (!userId) {
      console.error("❌ [CHAT] User object is missing id:", user);
      alert("Error: User ID is missing. Please log in again.");
      return;
    }

    console.log(`💬 [CHAT-SEND] Sending message: "${message}"`);
    socket.emit("chat-message", {
      meetingId,
      message,
      user: {
        name: user.name,
        _id: userId,
      },
    });
  }

  // ADMIN FUNCTIONS
  function handleAdmitUser(userId, socketId) {
    console.log(`👮 [ADMIN-ADMIT] Admitting user ${userId} (${socketId})`);
    socket.emit("admit-user", { meetingId, userId, socketId });
    setWaitingRoom((prev) => prev.filter((u) => u.socketId !== socketId));
  }

  function handleDenyUser(userId, socketId) {
    console.log(`👮 [ADMIN-DENY] Denying user ${userId} (${socketId})`);
    socket.emit("deny-user", { meetingId, userId, socketId });
    setWaitingRoom((prev) => prev.filter((u) => u.socketId !== socketId));
  }

  function handleUpdatePermissions(userId, permissions) {
    console.log(`👮 [ADMIN-PERMISSIONS] Updating permissions for ${userId}`, permissions);
    socket.emit("update-permissions", { meetingId, userId, permissions });

    setParticipants((prev) =>
      prev.map((p) => {
        const pUserId = p.user._id || p.user.id;
        if (pUserId === userId) {
          return { ...p, permissions };
        }
        return p;
      })
    );
  }

  function handleRemoveParticipant(userId) {
    if (window.confirm("Are you sure you want to remove this participant?")) {
      console.log(`👮 [ADMIN-REMOVE] Removing participant ${userId}`);
      socket.emit("remove-participant", { meetingId, userId });
    }
  }

  async function handleUpdateSettings(settings) {
    console.log(`👮 [ADMIN-SETTINGS] Updating settings`, settings);
    try {
      const token = localStorage.getItem("token");
      const response = await fetch(`/api/admin/${meetingId}/settings`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ settings }),
      });

      if (response.ok) {
        setMeetingSettings(settings);
        console.log("✅ [ADMIN-SETTINGS] Settings updated successfully");
        alert("Settings updated successfully!");
      } else {
        console.error("❌ [ADMIN-SETTINGS] Failed to update settings");
        alert("Failed to update settings");
      }
    } catch (err) {
      console.error("❌ [ADMIN-SETTINGS-ERROR]", err);
      alert("Failed to update settings");
    }
  }

  function handleLeave() {
    console.log("👋 [LEAVE] Leaving meeting");
    try {
      socket.emit("leave-meeting", { meetingId });
    } catch (e) {}
    // Close local media
    try {
      if (localStream) localStream.getTracks().forEach((t) => t.stop());
    } catch (e) {}

    // Close peer connections
    Object.values(pcsRef.current).forEach((pc) => {
      try { pc.close(); } catch (e) {}
    });
    pcsRef.current = {};
    setPeers({});
    navigate("/");
  }

  // RENDER WAITING ROOM
  if (inWaitingRoom) {
    return <WaitingRoom userName={storedUser?.name} onCancel={() => navigate("/")} />;
  }

  // RENDER ACCESS DENIED
  if (accessDenied) {
    return <AccessDenied onGoBack={() => navigate("/")} />;
  }

  // RENDER MAIN MEETING (UI preserved from original)
  return (
    <div className="h-screen flex flex-col bg-gradient-to-br from-slate-900 via-gray-900 to-slate-800 text-white overflow-hidden">
      <div className="flex-shrink-0 border-b border-gray-700/50 backdrop-blur-sm bg-gray-900/80">
        <TopBar />
      </div>

      <div className="flex-1 flex overflow-hidden relative">
        <div
          className={`flex-1 transition-all duration-500 ease-in-out ${sidebarOpen ? "lg:mr-96" : "mr-0"}`}
        >
          <div className="h-full w-full p-3 lg:p-4">
            <VideoGrid
              localVideoRef={localVideoRef}
              localStream={localStream}
              user={storedUser}
              peers={peers}
              participants={participants}
              muted={muted}
              cameraOff={cameraOff}
            />
          </div>
        </div>

        <div
          className={`fixed lg:absolute top-16 lg:top-0 right-0 h-[calc(100%-16rem)] lg:h-full w-full lg:w-96 bg-gradient-to-b from-gray-800 to-gray-900 border-l border-gray-700/50 shadow-2xl transform transition-transform duration-500 ease-in-out z-40 ${sidebarOpen ? "translate-x-0" : "translate-x-full"}`}
        >
          <div className="h-full flex flex-col">
            {isAdmin && (
              <div key="admin-tabs" className="flex-shrink-0 flex border-b border-gray-700">
                <button
                  onClick={() => setSidebarContent("chat")}
                  className={`flex-1 py-3 px-4 font-medium transition-colors ${sidebarContent === "chat" ? "bg-gray-700 text-white border-b-2 border-blue-500" : "text-gray-400 hover:bg-gray-800"}`}
                >
                  Chat
                </button>
                <button
                  onClick={() => setSidebarContent("admin")}
                  className={`flex-1 py-3 px-4 font-medium transition-colors relative ${sidebarContent === "admin" ? "bg-gray-700 text-white border-b-2 border-blue-500" : "text-gray-400 hover:bg-gray-800"}`}
                >
                  Admin
                  {waitingRoom.length > 0 && (
                    <span className="absolute top-2 right-2 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                      {waitingRoom.length}
                    </span>
                  )}
                </button>
              </div>
            )}

            <div className="flex-1 overflow-hidden">
              {sidebarContent === "chat" ? (
                <ChatPanel
                  messages={chatMessages}
                  onSend={sendChat}
                  user={storedUser}
                  onClose={() => setSidebarOpen(false)}
                />
              ) : (
                <AdminPanel
                  participants={participants}
                  waitingRoom={waitingRoom}
                  isAdmin={isAdmin}
                  onAdmitUser={handleAdmitUser}
                  onDenyUser={handleDenyUser}
                  onUpdatePermissions={handleUpdatePermissions}
                  onRemoveParticipant={handleRemoveParticipant}
                  onUpdateSettings={handleUpdateSettings}
                  currentSettings={meetingSettings}
                />
              )}
            </div>

            <div className="flex-shrink-0 p-4 border-t border-gray-700/50 bg-gray-800/30">
              <button
                className="w-full py-3 bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 rounded-xl font-medium shadow-lg hover:shadow-red-500/25 transition-all duration-200 transform hover:scale-[1.02] active:scale-[0.98]"
                onClick={handleLeave}
              >
                Leave Meeting
              </button>
            </div>
          </div>
        </div>

        {sidebarOpen && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-30 lg:hidden" onClick={() => setSidebarOpen(false)} />
        )}
      </div>

      <div className="flex-shrink-0 bg-gradient-to-t from-gray-900 via-gray-800 to-gray-800/95 border-t border-gray-700/50 shadow-2xl backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between gap-4">
            <div className="hidden md:flex items-center gap-3 text-sm text-gray-400">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                <span className="font-medium">Connected</span>
              </div>
              {isAdmin && (
                <span className="px-2 py-1 bg-yellow-600/20 text-yellow-500 rounded text-xs font-semibold">
                  HOST
                </span>
              )}
            </div>

            <div className="flex-1 flex justify-center">
              <Controls
                muted={muted}
                cameraOff={cameraOff}
                isChatOpen={sidebarOpen}
                onToggleMute={toggleMute}
                onToggleCamera={toggleCamera}
                onScreenShare={handleScreenShare}
                onLeave={handleLeave}
                onToggleChat={() => setSidebarOpen(!sidebarOpen)}
                permissions={userPermissions}
              />
            </div>

            <div className="flex items-center gap-2">
              <button
                className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 rounded-xl font-medium shadow-lg hover:shadow-blue-500/25 transition-all duration-200 transform hover:scale-[1.02] active:scale-[0.98]"
                onClick={() => {
                  const newState = !sidebarOpen;
                  setSidebarOpen(newState);
                  if (newState && isAdmin && sidebarContent !== "admin") {
                    // Do nothing forcing change — leave existing selection
                  }
                }}
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
                <span className="hidden sm:inline">
                  {sidebarOpen ? "Hide" : "Show"}{" "}
                  {isAdmin && sidebarOpen ? sidebarContent.charAt(0).toUpperCase() + sidebarContent.slice(1) : "Chat"}
                </span>
                {isAdmin && waitingRoom.length > 0 && !sidebarOpen && (
                  <span className="bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                    {waitingRoom.length}
                  </span>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
