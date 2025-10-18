// client/src/pages/Meeting.jsx
/**
 * Meeting.jsx
 *
 * Robust meeting component with:
 *  - Local media management
 *  - Socket connection lifecycle and event handlers
 *  - Waiting room + admission handling (no refresh required)
 *  - Glare-avoiding offer strategy: only the joiner creates offers after 'meeting-participants'
 *  - Pending-offer queue for streams not yet ready
 *  - Peer connection management with proper cleanup
 *  - Screen sharing, controls, admin functions
 *  - Chat panel with optimistic local send + deduplication of echoed messages
 *
 * Replace your existing file with this content.
 */

import React, { useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { socket } from "../services/socket";
import VideoGrid from "../components/VideoGrid";
import Controls from "../components/Controls";
import ChatPanel from "../components/ChatPanel";
import TopBar from "../components/TopBar";
import AdminPanel from "../components/AdminPanel";
import WaitingRoom, { AccessDenied } from "../components/WaitingRoomModal";

const storedUser = (() => {
  try {
    const raw = localStorage.getItem("user");
    const parsed = raw ? JSON.parse(raw) : null;
    if (parsed && parsed.id && !parsed._id) parsed._id = parsed.id;
    return parsed;
  } catch (e) {
    console.warn("⚠️ [STORED-USER] Failed to parse localStorage user", e);
    return null;
  }
})();

const STUN_SERVERS = [{ urls: "stun:stun.l.google.com:19302" }];

function nowTs() {
  return Date.now();
}

function makeChatKey({ message, user, timestamp }) {
  const uid = user?._id || user?.id || "unknown";
  return `${uid}::${message}::${Math.round((timestamp || 0) / 1000)}`;
}

export default function Meeting() {
  const { id: meetingId } = useParams();
  const navigate = useNavigate();

  // refs & state
  const localVideoRef = useRef(null);
  const pcsRef = useRef({}); // RTCPeerConnection objects keyed by remote socket id
  const pendingOffersRef = useRef([]); // [{ socketId, user }]
  const socketConnectedRef = useRef(false);
  const isJoiningRef = useRef(false);

  const [localStream, setLocalStream] = useState(null);
  const [peers, setPeers] = useState({}); // { [socketId]: { pc, stream, user } }
  const [participants, setParticipants] = useState([]);
  const [chatMessages, setChatMessages] = useState([]);
  const chatKeyIndexRef = useRef(new Set());

  const [hasJoined, setHasJoined] = useState(false);
  const [muted, setMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(false);

  const [sidebarOpen, setSidebarOpen] = useState(true);
  // Admins can toggle chat/admin. Non-admins always see chat.
  const [sidebarContent, setSidebarContent] = useState("chat");

  const [isAdmin, setIsAdmin] = useState(false);
  const [userPermissions, setUserPermissions] = useState({
    canUnmute: true,
    canVideo: true,
    canScreenShare: true,
  });

  const [waitingRoom, setWaitingRoom] = useState([]); // admin only
  const [meetingSettings, setMeetingSettings] = useState({});

  const [inWaitingRoom, setInWaitingRoom] = useState(false);
  const [accessDenied, setAccessDenied] = useState(false);

  const LOG = {
    d: (...args) => console.debug("🟦 [MEETING]", ...args),
    i: (...args) => console.info("🟩 [MEETING]", ...args),
    w: (...args) => console.warn("🟨 [MEETING]", ...args),
    e: (...args) => console.error("🟥 [MEETING]", ...args),
  };

  LOG.d("render", { meetingId, user: storedUser?.name });

  // ---------------------------
  // Get local media once
  // ---------------------------
  useEffect(() => {
    LOG.i("📹 [MEDIA] requesting local media");
    let mounted = true;

    async function startLocal() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
        if (!mounted) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        setLocalStream(stream);
        if (localVideoRef.current) localVideoRef.current.srcObject = stream;
        LOG.i("✅ [MEDIA] local stream ready", stream.getTracks().map((t) => t.kind));
      } catch (err) {
        LOG.e("❌ [MEDIA-ERROR]", err);
        alert("Please allow camera and microphone access.");
      }
    }

    startLocal();

    return () => {
      mounted = false;
      try {
        if (localStream) localStream.getTracks().forEach((t) => t.stop());
      } catch (e) {}
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------------------------
  // Socket setup & event handlers
  // ---------------------------
  useEffect(() => {
    if (!meetingId || !storedUser) {
      LOG.w("⚠️ [SOCKET] missing meetingId or user, skipping socket setup");
      return;
    }
    if (isJoiningRef.current) {
      LOG.w("⚠️ [SOCKET] join already in progress, skipping duplicate");
      return;
    }
    isJoiningRef.current = true;
    LOG.i("🔌 [SOCKET] setting up socket for ", meetingId);

    const handleConnect = () => {
      LOG.i("✅ [SOCKET-CONNECT] connected -> join-meeting");
      try {
        socket.emit("join-meeting", { meetingId, user: storedUser });
        socketConnectedRef.current = true;
      } catch (err) {
        LOG.e("❌ [SOCKET] emit join-meeting failed", err);
      }
    };

    if (!socket.connected) {
      socket.connect();
      socket.on("connect", handleConnect);
    } else {
      handleConnect();
    }

    // meeting-joined
    const handleMeetingJoined = ({ isAdmin: adminStatus, permissions, settings }) => {
      LOG.i("🎉 [MEETING-JOINED]", { adminStatus, permissions, settings });
      setIsAdmin(Boolean(adminStatus));
      if (permissions) setUserPermissions(permissions);
      if (settings) setMeetingSettings(settings);
      setInWaitingRoom(false);
      setHasJoined(true);

      // Apply entry settings
      if (settings?.muteMicOnEntry && !adminStatus) {
        setMuted(true);
        if (localStream) localStream.getAudioTracks().forEach((t) => (t.enabled = false));
      }
      if (settings?.disableVideoOnEntry && !adminStatus) {
        setCameraOff(true);
        if (localStream) localStream.getVideoTracks().forEach((t) => (t.enabled = false));
      }

      // If server didn't send participants, process pending offers defensively
      if (pendingOffersRef.current.length > 0 && localStream && localStream.active) {
        const pending = pendingOffersRef.current.splice(0);
        LOG.i("🔗 [PENDING-OFFERS] processing after meeting-joined", pending.length);
        pending.forEach(({ socketId, user }, i) => setTimeout(() => createOfferTo(socketId, user), i * 200));
      }
    };
    socket.on("meeting-joined", handleMeetingJoined);

    // waiting room
    const handleWaitingRoom = () => {
      LOG.i("⏳ [WAITING-ROOM] placed in waiting room");
      setInWaitingRoom(true);
    };
    socket.on("waiting-room", handleWaitingRoom);

    // admission-granted (admin admitted user)
    const handleAdmissionGranted = ({ permissions, settings }) => {
      LOG.i("✅ [ADMISSION-GRANTED] received", { permissions, settings });
      setInWaitingRoom(false);
      if (permissions) setUserPermissions(permissions);
      if (settings) setMeetingSettings(settings);

      setHasJoined(true);
      try {
        socket.emit("request-participants", { meetingId });
      } catch (e) {
        LOG.w("⚠️ [ADMISSION] request-participants emit failed", e);
      }

      if (pendingOffersRef.current.length > 0 && localStream && localStream.active) {
        const pending = pendingOffersRef.current.splice(0);
        pending.forEach(({ socketId, user }, i) => setTimeout(() => createOfferTo(socketId, user), i * 200));
      }
    };
    socket.on("admission-granted", handleAdmissionGranted);

    // admission-denied
    const handleAdmissionDenied = () => {
      LOG.i("🚫 [ADMISSION-DENIED] access denied");
      setInWaitingRoom(false);
      setAccessDenied(true);
    };
    socket.on("admission-denied", handleAdmissionDenied);

    const handleJoinError = ({ message }) => {
      LOG.e("❌ [JOIN-ERROR]", message);
      alert(message || "Failed to join meeting");
      navigate("/");
    };
    socket.on("join-error", handleJoinError);

    // admission-request (for admins)
    const handleAdmissionRequest = (requestData) => {
      LOG.i("📨 [ADMISSION-REQUEST]", requestData);
      setWaitingRoom((prev) => {
        if (prev.some((u) => u.socketId === requestData.socketId)) {
          LOG.d("duplicate admission-request ignored");
          return prev;
        }
        return [...prev, requestData];
      });
    };
    socket.on("admission-request", handleAdmissionRequest);

    // user-admitted (remove waiting room entry)
    const handleUserAdmitted = ({ userId, socketId }) => {
      LOG.i("✅ [USER-ADMITTED] remove from waiting", socketId);
      setWaitingRoom((prev) => prev.filter((u) => u.socketId !== socketId));
    };
    socket.on("user-admitted", handleUserAdmitted);

    const handlePermissionsUpdated = (permissions) => {
      LOG.i("🔐 [PERMISSIONS-UPDATED]", permissions);
      setUserPermissions((prev) => ({ ...prev, ...(permissions || {}) }));

      if (!permissions?.canUnmute && localStream) {
        localStream.getAudioTracks().forEach((t) => (t.enabled = false));
        setMuted(true);
      }
      if (!permissions?.canVideo && localStream) {
        localStream.getVideoTracks().forEach((t) => (t.enabled = false));
        setCameraOff(true);
      }
    };
    socket.on("permissions-updated", handlePermissionsUpdated);

    const handleRemovedByAdmin = () => {
      LOG.i("🚫 [REMOVED] removed by admin");
      alert("You have been removed from the meeting by the host.");
      navigate("/");
    };
    socket.on("removed-by-admin", handleRemovedByAdmin);

    // screenshare events
    const handleScreenShareGranted = () => {
      LOG.i("✅ [SCREEN-SHARE-GRANTED] starting");
      startScreenShare();
    };
    socket.on("screen-share-granted", handleScreenShareGranted);

    const handleScreenShareDenied = () => {
      LOG.i("🚫 [SCREEN-SHARE-DENIED] denied");
      alert("Screen share permission denied. Please ask the host for permission.");
    };
    socket.on("screen-share-denied", handleScreenShareDenied);

    // chat history & messages
    const handleChatHistory = (messages) => {
      LOG.i("💬 [CHAT-HISTORY] count", messages?.length || 0);
      const idx = new Set();
      const sanitized = (messages || []).map((m) => {
        const item = { message: m.message, user: m.user, timestamp: m.timestamp || nowTs() };
        idx.add(makeChatKey(item));
        return item;
      });
      chatKeyIndexRef.current = idx;
      setChatMessages(sanitized);
    };
    socket.on("chat-history", handleChatHistory);

    const handleChatMessage = ({ message, user, timestamp }) => {
      const item = { message, user, timestamp: timestamp || nowTs() };
      const key = makeChatKey(item);
      if (chatKeyIndexRef.current.has(key)) {
        LOG.d("💬 duplicate chat ignored", key);
        return;
      }
      chatKeyIndexRef.current.add(key);
      setChatMessages((prev) => [...prev, item]);
    };
    socket.on("chat-message", handleChatMessage);

    // meeting participants list (joiner receives this and will create offers)
    const handleMeetingParticipants = (list) => {
      const arr = list || [];
      LOG.i("👥 [MEETING-PARTICIPANTS] received", arr.length);
      setParticipants(arr);

      if (localStream && localStream.active && localStream.getTracks().length > 0) {
        arr.forEach((p, i) => {
          if (p.socketId === socket.id) return;
          setTimeout(() => {
            if (!pcsRef.current[p.socketId]) createOfferTo(p.socketId, p.user);
          }, i * 200);
        });
      } else {
        arr.forEach((p) => {
          if (p.socketId === socket.id) return;
          pendingOffersRef.current.push({ socketId: p.socketId, user: p.user });
        });
      }
    };
    socket.on("meeting-participants", handleMeetingParticipants);

    // user joined - update participants list, DO NOT create offers (joiner does)
    const handleUserJoined = ({ socketId, user, permissions, isAdmin: userIsAdmin }) => {
      LOG.i("👋 [USER-JOINED]", user?.name, socketId);
      setParticipants((prev) => (prev.some((x) => x.socketId === socketId) ? prev : [...prev, { socketId, user, permissions, isAdmin: userIsAdmin }]));
    };
    socket.on("user-joined", handleUserJoined);

    // user left
    const handleUserLeft = ({ socketId }) => {
      LOG.i("👋 [USER-LEFT]", socketId);
      setParticipants((prev) => prev.filter((p) => p.socketId !== socketId));
      setWaitingRoom((prev) => prev.filter((u) => u.socketId !== socketId));
      if (pcsRef.current[socketId]) {
        try { pcsRef.current[socketId].close(); } catch (e) {}
        delete pcsRef.current[socketId];
      }
      setPeers((prev) => {
        const copy = { ...prev }; delete copy[socketId]; return copy;
      });
    };
    socket.on("user-left", handleUserLeft);

    // WebRTC offer (we answer)
    const handleWebrtcOffer = async ({ from, sdp, fromUser }) => {
      LOG.i("📨 [WEBRTC-OFFER] from", from);
      if (pcsRef.current[from]) {
        try { pcsRef.current[from].close(); } catch (e) {}
        delete pcsRef.current[from];
      }
      try {
        const pc = createPeerConnection(from, fromUser);
        pcsRef.current[from] = pc;
        await pc.setRemoteDescription(new RTCSessionDescription(sdp));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit("webrtc-answer", { to: from, sdp: pc.localDescription });
        LOG.d("📤 [ANSWER] sent to", from);
      } catch (err) {
        LOG.e("❌ [OFFER-ERROR]", err);
      }
    };
    socket.on("webrtc-offer", handleWebrtcOffer);

    // WebRTC answer (we initiated offer earlier)
    const handleWebrtcAnswer = async ({ from, sdp }) => {
      LOG.i("📨 [WEBRTC-ANSWER] from", from);
      const pc = pcsRef.current[from];
      if (!pc) return LOG.w("⚠️ [WEBRTC-ANSWER] no pc for", from);
      try {
        await pc.setRemoteDescription(new RTCSessionDescription(sdp));
        LOG.d("🔗 [WEBRTC] set remote for", from);
      } catch (err) {
        LOG.e("❌ [WEBRTC-ANSWER-ERROR]", err);
      }
    };
    socket.on("webrtc-answer", handleWebrtcAnswer);

    // ICE candidates
    const handleIceCandidate = async ({ from, candidate }) => {
      const pc = pcsRef.current[from];
      if (!pc) return LOG.w("⚠️ [ICE] no pc for candidate from", from);
      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (err) {
        LOG.e("❌ [ICE-ERROR]", err);
      }
    };
    socket.on("ice-candidate", handleIceCandidate);

    // cleanup on unmount / meeting change
    return () => {
      LOG.i("🧹 [SOCKET-CLEANUP] removing handlers & closing pcs");
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
        socket.off("meeting-participants", handleMeetingParticipants);
        socket.off("user-joined", handleUserJoined);
        socket.off("user-left", handleUserLeft);
        socket.off("webrtc-offer", handleWebrtcOffer);
        socket.off("webrtc-answer", handleWebrtcAnswer);
        socket.off("ice-candidate", handleIceCandidate);
      } catch (e) {
        LOG.w("⚠️ [SOCKET-CLEANUP] error removing handlers", e);
      }

      Object.values(pcsRef.current).forEach((pc) => {
        try { pc.close(); } catch (e) {}
      });
      pcsRef.current = {};
      pendingOffersRef.current = [];
      socketConnectedRef.current = false;
      isJoiningRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meetingId, localStream, navigate]);

  console.log(storedUser.name)
  // ---------------------------
  // Process pending offers when localStream ready
  // ---------------------------
  useEffect(() => {
    if (!localStream || !localStream.active || localStream.getTracks().length === 0) return;
    const pending = pendingOffersRef.current.splice(0);
    if (pending.length > 0) {
      LOG.i("🔗 [PENDING-OFFERS] flushing", pending.length);
      pending.forEach(({ socketId, user }, i) => setTimeout(() => createOfferTo(socketId, user), i * 200));
    }
  }, [localStream]);

  // ---------------------------
  // createPeerConnection
  // ---------------------------
  function createPeerConnection(remoteSocketId, remoteUser = null) {
    LOG.d("🔗 [CREATE-PC]", remoteSocketId);
    const pc = new RTCPeerConnection({ iceServers: STUN_SERVERS });
    const remoteStream = new MediaStream();

    // Add local tracks if present
    if (localStream && localStream.active) {
      localStream.getTracks().forEach((t) => {
        try {
          pc.addTrack(t, localStream);
        } catch (e) {
          LOG.w("⚠️ [PC-ADD-TRACK] failed", e);
        }
      });
    }

    pc.ontrack = (ev) => {
      LOG.d(`📥 [PC-TRACK] from ${remoteSocketId}: ${ev.track.kind}`);
      if (!remoteStream.getTrackById(ev.track.id)) {
        remoteStream.addTrack(ev.track);
        LOG.d("✅ [STREAM] added track", ev.track.kind, remoteSocketId);
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

    pc.onicecandidate = (e) => {
      if (e.candidate) {
        try {
          socket.emit("ice-candidate", { to: remoteSocketId, candidate: e.candidate });
        } catch (err) {
          LOG.w("⚠️ [ICE] emit failed", err);
        }
      }
    };

    pc.onconnectionstatechange = () => {
      LOG.d("🔌 [PC-STATE]", remoteSocketId, pc.connectionState);
      if (pc.connectionState === "connected") LOG.i("✅ [CONNECTED]", remoteSocketId);
      if (["failed", "disconnected", "closed"].includes(pc.connectionState)) {
        LOG.i("🧹 [PC-CLEANUP] removing", remoteSocketId);
        setPeers((prev) => {
          const copy = { ...prev }; delete copy[remoteSocketId]; return copy;
        });
        if (pcsRef.current[remoteSocketId]) {
          try { pcsRef.current[remoteSocketId].close(); } catch (e) {}
          delete pcsRef.current[remoteSocketId];
        }
      }
    };

    pc.oniceconnectionstatechange = () => {
      LOG.d("🧊 [ICE-STATE]", remoteSocketId, pc.iceConnectionState);
    };

    // Initialize peers entry for placeholder UI
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

  // ---------------------------
  // createOfferTo
  // ---------------------------
  async function createOfferTo(remoteSocketId, remoteUser = null) {
    LOG.i("📞 [OFFER] createOfferTo", remoteSocketId);

    // If there is an existing pc and it's active, skip offer
    if (pcsRef.current[remoteSocketId]) {
      const existing = pcsRef.current[remoteSocketId];
      if (existing.connectionState === "connected" || existing.connectionState === "connecting") {
        LOG.d("✅ [OFFER] pc already active - skipping", remoteSocketId);
        return;
      } else {
        LOG.d("🔄 [OFFER] closing stale pc", remoteSocketId);
        try { existing.close(); } catch (e) {}
        delete pcsRef.current[remoteSocketId];
      }
    }

    // If local stream not ready, queue
    if (!localStream || !localStream.active || localStream.getTracks().length === 0) {
      LOG.w("⏳ [OFFER] local stream not ready - queuing offer", remoteSocketId);
      pendingOffersRef.current.push({ socketId: remoteSocketId, user: remoteUser });
      return;
    }

    const pc = createPeerConnection(remoteSocketId, remoteUser);
    pcsRef.current[remoteSocketId] = pc;

    try {
      const offer = await pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: true });
      await pc.setLocalDescription(offer);
      LOG.d("📤 [OFFER] sending to", remoteSocketId);
      socket.emit("webrtc-offer", { to: remoteSocketId, sdp: pc.localDescription, fromUser: storedUser });
    } catch (err) {
      LOG.e("❌ [OFFER-ERROR]", err);
      if (pcsRef.current[remoteSocketId]) {
        try { pcsRef.current[remoteSocketId].close(); } catch (e) {}
        delete pcsRef.current[remoteSocketId];
      }
      setPeers((prev) => {
        const copy = { ...prev }; delete copy[remoteSocketId]; return copy;
      });
    }
  }

  // ---------------------------
  // Controls: mute/camera, screen share
  // ---------------------------
  function toggleMute() {
    if (!localStream) return;
    if (!userPermissions.canUnmute && muted) {
      alert("You don't have permission to unmute. Please ask the host.");
      return;
    }
    const audios = localStream.getAudioTracks();
    if (audios.length === 0) return;
    const newEnabled = !audios[0].enabled;
    audios.forEach((t) => (t.enabled = newEnabled));
    setMuted(!newEnabled);
    LOG.i("🎤 [CONTROLS] mic", newEnabled ? "on" : "off");
  }

  function toggleCamera() {
    if (!localStream) return;
    if (!userPermissions.canVideo && cameraOff) {
      alert("You don't have permission to enable video. Please ask the host.");
      return;
    }
    const vids = localStream.getVideoTracks();
    if (vids.length === 0) return;
    const newEnabled = !vids[0].enabled;
    vids.forEach((t) => (t.enabled = newEnabled));
    setCameraOff(!newEnabled);
    LOG.i("📹 [CONTROLS] camera", newEnabled ? "on" : "off");
  }

  async function startScreenShare() {
    LOG.i("🖥️ [SCREEN-SHARE] start");
    if (!navigator.mediaDevices?.getDisplayMedia) {
      alert("Screen sharing not supported.");
      return;
    }
    try {
      const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
      const screenTrack = screenStream.getVideoTracks()[0];
      Object.values(pcsRef.current).forEach((pc) => {
        const sender = pc.getSenders().find((s) => s.track?.kind === "video");
        if (sender) {
          try {
            sender.replaceTrack(screenTrack);
          } catch (e) {
            LOG.w("⚠️ [SCREEN-SHARE] replaceTrack failed", e);
          }
        }
      });
      screenTrack.onended = () => {
        LOG.i("🛑 [SCREEN] ended - restoring camera");
        if (!localStream) return;
        const camTrack = localStream.getVideoTracks()[0];
        Object.values(pcsRef.current).forEach((pc) => {
          const sender = pc.getSenders().find((s) => s.track?.kind === "video");
          if (sender && camTrack) {
            try {
              sender.replaceTrack(camTrack);
            } catch (e) {
              LOG.w("⚠️ [SCREEN] replace back failed", e);
            }
          }
        });
      };
    } catch (err) {
      LOG.e("❌ [SCREEN-SHARE-ERROR]", err);
    }
  }

  async function handleScreenShare() {
    if (!userPermissions.canScreenShare && !isAdmin) {
      LOG.i("📨 [SCREEN] requesting permission");
      socket.emit("request-screen-share", { meetingId });
      alert("Screen share request sent to the host.");
      return;
    }
    startScreenShare();
  }

  // ---------------------------
  // Chat: optimistic send + dedupe
  // ---------------------------
  async function sendChat(message) {
    if (!message?.trim()) return;
    if (!storedUser) return alert("User not logged in");
    const userId = storedUser._id || storedUser.id;
    if (!userId) return alert("Error: User ID missing");

    const timestamp = nowTs();
    const msgObj = { message: message.trim(), user: { _id: userId, name: storedUser.name }, timestamp };
    const key = makeChatKey(msgObj);

    if (!chatKeyIndexRef.current.has(key)) {
      chatKeyIndexRef.current.add(key);
      setChatMessages((prev) => [...prev, msgObj]);
    }

    try {
      socket.emit("chat-message", { meetingId, message: msgObj.message, user: msgObj.user });
    } catch (err) {
      LOG.e("❌ [CHAT] emit failed", err);
      alert("Failed to send message (network error).");
    }
  }

  // ---------------------------
  // Admin actions
  // ---------------------------
  function handleAdmitUser(userId, socketId) {
    LOG.i("👮 [ADMIT]", userId, socketId);
    socket.emit("admit-user", { meetingId, userId, socketId });
    setWaitingRoom((prev) => prev.filter((u) => u.socketId !== socketId));
  }

  function handleDenyUser(userId, socketId) {
    LOG.i("👮 [DENY]", userId, socketId);
    socket.emit("deny-user", { meetingId, userId, socketId });
    setWaitingRoom((prev) => prev.filter((u) => u.socketId !== socketId));
  }

  function handleUpdatePermissions(userId, permissions) {
    LOG.i("👮 [UPDATE-PERM]", userId, permissions);
    socket.emit("update-permissions", { meetingId, userId, permissions });
    setParticipants((prev) => prev.map((p) => {
      const pUserId = p.user._id || p.user.id;
      if (pUserId === userId) return { ...p, permissions };
      return p;
    }));
  }

  function handleRemoveParticipant(userId) {
    if (!window.confirm("Are you sure you want to remove this participant?")) return;
    LOG.i("👮 [REMOVE]", userId);
    socket.emit("remove-participant", { meetingId, userId });
  }

  async function handleUpdateSettings(settings) {
    LOG.i("👮 [SETTINGS] update", settings);
    try {
      const token = localStorage.getItem("token");
      const response = await fetch(`/api/admin/${meetingId}/settings`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ settings }),
      });
      if (response.ok) {
        setMeetingSettings(settings);
        alert("Settings updated successfully!");
      } else {
        alert("Failed to update settings");
      }
    } catch (err) {
      LOG.e("❌ [SETTINGS-ERROR]", err);
      alert("Failed to update settings");
    }
  }

  // ---------------------------
  // Leave meeting
  // ---------------------------
  function handleLeave() {
    LOG.i("👋 [LEAVE] leaving meeting");
    try { socket.emit("leave-meeting", { meetingId }); } catch (e) { LOG.w("⚠️ [LEAVE] emit failed", e); }

    try { if (localStream) localStream.getTracks().forEach((t) => t.stop()); } catch (e) {}

    Object.values(pcsRef.current).forEach((pc) => { try { pc.close(); } catch (e) {} });
    pcsRef.current = {};
    setPeers({});
    navigate("/");
  }

  // ---------------------------
  // Render
  // Non-admins always see ChatPanel; admins can toggle chat/admin
  // ---------------------------
  if (inWaitingRoom) {
    return <WaitingRoom userName={storedUser?.name} onCancel={() => navigate("/")} />;
  }
  if (accessDenied) {
    return <AccessDenied onGoBack={() => navigate("/")} />;
  }

return (
  <div className="h-screen flex flex-col bg-gradient-to-br from-slate-900 via-gray-900 to-slate-800 text-white overflow-hidden">
    {/* Top bar */}
    <div className="flex-shrink-0 border-b border-gray-700/50 backdrop-blur-sm bg-gray-900/80">
      <TopBar />
    </div>

    {/* Main area */}
    <div className="flex-1 flex overflow-hidden relative">
      <div className={`flex-1 transition-all duration-500 ease-in-out ${sidebarOpen ? "lg:mr-96" : "mr-0"}`}>
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

      {/* Sidebar */}
      <div className={`fixed lg:absolute top-16 lg:top-0 right-0 h-[calc(100%-16rem)] lg:h-full w-full lg:w-96 bg-gradient-to-b from-gray-800 to-gray-900 border-l border-gray-700/50 shadow-2xl transform transition-transform duration-500 ease-in-out z-40 ${sidebarOpen ? "translate-x-0" : "translate-x-full"}`}>
        <div className="h-full flex flex-col">
          {/* Admin tabs header (only for admins) - keeps UI consistent */}
          {isAdmin && (
            <div key="admin-tabs" className="flex-shrink-0 flex border-b border-gray-700">
              <button
                onClick={() => setSidebarContent("chat")}
                className={`flex-1 py-3 px-4 font-medium transition-colors ${sidebarContent === "chat" ? "bg-gray-700 text-white border-b-2 border-blue-500" : "text-gray-400 hover:bg-gray-800"}`}
              >
                Chat
              </button>

              {/* This toggles admin collapsed / expanded */}
              <button
                onClick={() => setSidebarContent((s) => (s === "admin" ? "chat" : "admin"))}
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

          {/* Content area: Chat always visible; Admin panel shown below chat for admins */}
          <div className="flex-1 overflow-hidden flex flex-col">
            {/* Chat always present and takes remaining space */}
            <div className="flex-1 overflow-auto">
              <ChatPanel
                messages={chatMessages}
                onSend={sendChat}
                user={storedUser}
                onClose={() => setSidebarOpen(false)}
              />
            </div>

            {/* Admin panel: visible for admins. Collapses to a short bar when sidebarContent !== 'admin' */}
            {isAdmin && (
              <div
                className={`border-t border-gray-700/50 bg-gray-800/20 transition-all ease-in-out overflow-auto`}
                style={
                  sidebarContent === "admin"
                    ? { minHeight: 220, maxHeight: 420 }
                    : { minHeight: 48, maxHeight: 48 }
                }
              >
                {sidebarContent === "admin" ? (
                  <div className="p-3 h-full overflow-auto">
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
                  </div>
                ) : (
                  <div className="flex items-center justify-between p-3 text-sm text-gray-300">
                    <div>Admin panel (collapsed)</div>
                    <button
                      onClick={() => setSidebarContent("admin")}
                      className="py-1 px-2 bg-blue-600/80 rounded text-white text-xs"
                    >
                      Open
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Leave button */}
          <div className="flex-shrink-0 p-4 border-t border-gray-700/50 bg-gray-800/30">
            <button className="w-full py-3 bg-gradient-to-r from-red-600 to-red-700 rounded-xl font-medium shadow-lg" onClick={handleLeave}>
              Leave Meeting
            </button>
          </div>
        </div>
      </div>

      {/* Mobile overlay behind sidebar */}
      {sidebarOpen && <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-30 lg:hidden" onClick={() => setSidebarOpen(false)} />}
    </div>

    {/* Bottom bar with controls */}
    <div className="flex-shrink-0 bg-gradient-to-t from-gray-900 via-gray-800 to-gray-800/95 border-t border-gray-700/50 shadow-2xl backdrop-blur-md">
      <div className="max-w-7xl mx-auto px-4 py-4">
        <div className="flex items-center justify-between gap-4">
          <div className="hidden md:flex items-center gap-3 text-sm text-gray-400">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
              <span className="font-medium">Connected</span>
            </div>
            {isAdmin && <span className="px-2 py-1 bg-yellow-600/20 text-yellow-500 rounded text-xs font-semibold">HOST</span>}
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
            <button className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-blue-600 to-blue-700 rounded-xl font-medium" onClick={() => setSidebarOpen((s) => !s)}>
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
              <span className="hidden sm:inline">{sidebarOpen ? "Hide" : "Show"} {isAdmin && sidebarOpen ? sidebarContent.charAt(0).toUpperCase() + sidebarContent.slice(1) : "Chat"}</span>
              {isAdmin && waitingRoom.length > 0 && !sidebarOpen && <span className="bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">{waitingRoom.length}</span>}
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
);

}
