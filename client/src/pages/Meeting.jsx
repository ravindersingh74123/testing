
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

const storedUser = JSON.parse(localStorage.getItem("user"));

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
  const [peers, setPeers] = useState({}); // Change from ref to state!
  const pcsRef = useRef({});
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

  const pendingOffersRef = useRef([]);
  const socketConnectedRef = useRef(false);
  const isJoiningRef = useRef(false);

  // Prevent re-running if already joined

  console.log("🎬 [MEETING-RENDER] Meeting component rendered");

 useEffect(() => {
    if (isAdmin && sidebarContent === "chat") {
      setSidebarContent("admin");
    } else if (!isAdmin && sidebarContent === "admin") {
      setSidebarContent("chat");
    }
  }, [isAdmin, sidebarContent]); // ✅ Include sidebarContent but check prevents loop
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
          console.log("⚠️ [MEDIA] Component unmounted, stopping tracks");
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        console.log(
          "✅ [MEDIA] Got local stream with tracks:",
          stream.getTracks().map((t) => t.kind)
        );

        // CRITICAL FIX: Attach to video element FIRST
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
          console.log("📺 [MEDIA] Attached stream to video element");

          // Wait for video to be ready before setting state
          await localVideoRef.current.play().catch(() => {});
        }

        // Small delay to ensure stream is fully initialized
        await new Promise((resolve) => setTimeout(resolve, 300));

        // NOW set the stream state - this triggers peer connections
        setLocalStream(stream);
        console.log("✅ [MEDIA] Local stream fully ready");
      } catch (err) {
        console.error("❌ [MEDIA-ERROR] Camera/Mic error:", err);
        alert("Please allow camera and microphone access.");
      }
    }
    startLocal();
    return () => {
      console.log("🧹 [MEDIA-CLEANUP] Cleaning up media");
      mounted = false;
    };
  }, []);


  useEffect(() => {
  if (hasJoined && socketConnectedRef.current) {
    console.log("⚠️ [SKIP] Already joined this session");
    return;
  }
  
  // ... rest of socket setup
  
  // ✅ After successful join, set the flag in meeting-joined handler:
  socket.on("meeting-joined", ({ isAdmin: adminStatus, permissions, settings }) => {
    console.log("🎉 [MEETING-JOINED] Received meeting-joined event");
    setHasJoined(true); // ✅ Mark as joined
    // ... rest of existing code
  });
  
}, [meetingId, navigate, hasJoined]); // ✅ Add hasJoined to deps
  // SOCKET CONNECTION & EVENTS
  useEffect(() => {
    if (socketConnectedRef.current && socket.connected) {
      console.log(
        "🔌 [SOCKET] Already connected to this meeting, skipping setup"
      );
      return;
    }

    if (!meetingId || !storedUser) {
      console.log(
        "⚠️ [SOCKET] Missing meetingId or user, skipping socket setup"
      );
      return;
    }

    if (isJoiningRef.current) {
      console.log("⚠️ [SOCKET] Already joining, skipping duplicate setup");
      return;
    }

    isJoiningRef.current = true;
    console.log(
      "\n🔌 [SOCKET] Setting up socket connection for meeting",
      meetingId
    );

    // Only connect if not already connected
    if (!socket.connected) {
      console.log("🔌 [SOCKET] Connecting socket");
      socket.connect();
    } else {
      console.log("🔌 [SOCKET] Socket already connected");
    }
    socketConnectedRef.current = true;

    const handleConnect = () => {
      console.log(
        "✅ [SOCKET-CONNECT] Socket connected, emitting join-meeting"
      );
      socket.emit("join-meeting", { meetingId, user: storedUser });
    };

    if (socket.connected) {
      handleConnect();
    } else {
      socket.on("connect", handleConnect);
    }

    // Meeting joined successfully
    // Meeting joined successfully
    socket.on(
      "meeting-joined",
      ({ isAdmin: adminStatus, permissions, settings }) => {
        console.log("🎉 [MEETING-JOINED] Received meeting-joined event");
        console.log("   Admin:", adminStatus);
        console.log("   Permissions:", permissions);
        console.log("   Settings:", settings);

        setIsAdmin(adminStatus);
        setUserPermissions(permissions);
        setMeetingSettings(settings);
        setInWaitingRoom(false);

        // Apply initial settings
        if (settings.muteMicOnEntry && !adminStatus) {
          console.log("🔇 [SETTINGS] Applying muteMicOnEntry");
          setMuted(true);
          if (localStream) {
            localStream.getAudioTracks().forEach((t) => (t.enabled = false));
          }
        }
        if (settings.disableVideoOnEntry && !adminStatus) {
          console.log("📹 [SETTINGS] Applying disableVideoOnEntry");
          setCameraOff(true);
          if (localStream) {
            localStream.getVideoTracks().forEach((t) => (t.enabled = false));
          }
        }

        // CRITICAL FIX: Signal that we're ready to receive offers
        console.log("📢 [SIGNAL-READY] Notifying peers we're ready");
        setTimeout(() => {
          socket.emit("i-am-ready", { meetingId, user: storedUser });
        }, 500); // Give time for everything to settle
      }
    );

    // Waiting room
    socket.on("waiting-room", () => {
      console.log("⏳ [WAITING-ROOM] Placed in waiting room");
      setInWaitingRoom(true);
    });

    // Admission granted
    // In client/src/pages/Meeting.jsx
    // Replace the existing admission-granted handler with this:

    // Admission granted
    socket.on("admission-granted", ({ permissions, settings }) => {
      console.log("✅ [ADMISSION-GRANTED] Admission granted");
      setInWaitingRoom(false);
      setUserPermissions(permissions);
      setMeetingSettings(settings);

      // DON'T re-join, just signal we're ready
      console.log(
        "📢 [SIGNAL-READY] Notifying peers we're ready after admission"
      );

      // Small delay to ensure state updates
      setTimeout(() => {
        socket.emit("i-am-ready", { meetingId, user: storedUser });
      }, 500);
    });

    // Admission denied
    socket.on("admission-denied", () => {
      console.log("🚫 [ADMISSION-DENIED] Access denied");
      setInWaitingRoom(false);
      setAccessDenied(true);
    });

    // Join error
    socket.on("join-error", ({ message }) => {
      console.error("❌ [JOIN-ERROR]", message);
      alert(message);
      navigate("/");
    });

    // Admission request (for admin)
    socket.on("admission-request", (requestData) => {
      console.log(
        "📨 [ADMISSION-REQUEST] Received admission request:",
        requestData
      );
      setWaitingRoom((prev) => {
        // Avoid duplicates
        if (prev.some((u) => u.socketId === requestData.socketId)) {
          console.log("   Already in waiting room");
          return prev;
        }
        console.log("   Adding to waiting room");
        return [...prev, requestData];
      });
    });

    // User admitted (notify all participants)
    socket.on("user-admitted", ({ userId, socketId }) => {
      console.log("✅ [USER-ADMITTED] User was admitted:", userId);
      setWaitingRoom((prev) => prev.filter((u) => u.socketId !== socketId));
    });

    // Permissions updated
    socket.on("permissions-updated", (permissions) => {
      console.log("🔐 [PERMISSIONS-UPDATED] Permissions updated:", permissions);
      setUserPermissions(permissions);

      // Enforce permissions
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
    });

    // Removed by admin
    socket.on("removed-by-admin", () => {
      console.log("🚫 [REMOVED] Removed from meeting by admin");
      alert("You have been removed from the meeting by the host.");
      navigate("/");
    });

    // Screen share response
    socket.on("screen-share-granted", () => {
      console.log("✅ [SCREEN-SHARE] Permission granted");
      startScreenShare();
    });

    socket.on("screen-share-denied", () => {
      console.log("🚫 [SCREEN-SHARE] Permission denied");
      alert(
        "Screen share permission denied. Please ask the host for permission."
      );
    });

    socket.on("screen-share-request", ({ userId, name, socketId }) => {
      console.log("📨 [SCREEN-SHARE-REQUEST] Request from:", name);
    });

    // Chat history
    socket.on("chat-history", (messages) => {
      console.log(`💬 [CHAT-HISTORY] Received ${messages.length} messages`);
      setChatMessages(messages);
    });

    // Chat message
    socket.on("chat-message", ({ message, user, timestamp }) => {
      console.log(`💬 [CHAT-MESSAGE] New message from ${user.name}`);
      setChatMessages((prev) => {
        const lastMsg = prev[prev.length - 1];
        if (
          lastMsg &&
          lastMsg.message === message &&
          lastMsg.user._id === user._id
        ) {
          console.log("   Duplicate message, ignoring");
          return prev;
        }
        return [...prev, { message, user, timestamp }];
      });
    });

    // Meeting participants
    socket.on("meeting-participants", (list) => {
      console.log(
        `👥 [MEETING-PARTICIPANTS] Received ${list.length} participants`
      );
      list.forEach((p) => {
        console.log(`   - ${p.user.name} (${p.socketId})`);
      });

      setParticipants(list);

      // Create offers to all participants
      if (localStream) {
        console.log("🔗 [OFFERS] Creating offers to all participants");
        list.forEach((p) => {
          createOfferTo(p.socketId, p.user);
        });
      } else {
        console.log("⏳ [PENDING-OFFERS] No local stream yet, queuing offers");
        list.forEach((p) => {
          pendingOffersRef.current.push({ socketId: p.socketId, user: p.user });
        });
      }
    });

    // User joined
    // User joined
    socket.on(
      "user-joined",
      ({ socketId, user, permissions, isAdmin: userIsAdmin }) => {
        console.log(`\n👋 [USER-JOINED] ${user.name} joined (${socketId})`);

        // Check if we already have this peer
        if (pcsRef.current[socketId]) {
          console.log("   ⚠️ Already have peer connection, skipping");
          return;
        }

        // Add to participants
        setParticipants((prev) => {
          if (prev.some((x) => x.socketId === socketId)) {
            return prev;
          }
          return [
            ...prev,
            { socketId, user, permissions, isAdmin: userIsAdmin },
          ];
        });

        // Wait a bit for the new user to be ready, then create offer
        setTimeout(() => {
          if (
            localStream &&
            localStream.active &&
            localStream.getTracks().length > 0
          ) {
            console.log("🔗 [OFFER] Creating offer to", socketId);
            createOfferTo(socketId, user);
          }
        }, 1000); // Wait 1 second for peer to be ready
      }
    );
    // NEW: Handle when a peer signals they're ready to receive offers
    socket.on("peer-ready", ({ socketId, user }) => {
      console.log(
        `✅ [PEER-READY] ${user.name} (${socketId}) is ready for offer`
      );

      // Now it's safe to create the offer
      if (
        localStream &&
        localStream.getTracks().length > 0 &&
        localStream.active
      ) {
        console.log("🔗 [OFFER] Creating offer to ready peer");
        // Small delay to ensure everything is settled
        setTimeout(() => {
          createOfferTo(socketId, user);
        }, 200);
      } else {
        console.log("⏳ [PENDING] Queuing offer, local stream not ready");
        pendingOffersRef.current.push({ socketId, user });
      }
    });
    // User left
    socket.on("user-left", ({ socketId }) => {
      console.log(`👋 [USER-LEFT] User left: ${socketId}`);

      setParticipants((prev) => prev.filter((p) => p.socketId !== socketId));
      setWaitingRoom((prev) => prev.filter((u) => u.socketId !== socketId));

      if (pcsRef.current[socketId]) {
        console.log("🧹 [CLEANUP] Closing peer connection for", socketId);
        pcsRef.current[socketId].close();
        delete pcsRef.current[socketId];
      }

      // CRITICAL: Remove from peers state
      setPeers((prev) => {
        const newPeers = { ...prev };
        delete newPeers[socketId];
        return newPeers;
      });
    });
    // WebRTC signaling
    socket.on("webrtc-offer", async ({ from, sdp, fromUser }) => {
      console.log(`\n📨 [WEBRTC-OFFER] Received from ${from}`);

      // Close existing connection if any
      if (pcsRef.current[from]) {
        console.log("🔄 [OFFER] Closing existing connection");
        pcsRef.current[from].close();
        delete pcsRef.current[from];
      }

      try {
        const pc = createPeerConnection(from, fromUser);
        pcsRef.current[from] = pc;

        await pc.setRemoteDescription(new RTCSessionDescription(sdp));
        console.log("✅ [OFFER] Remote description set");

        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        console.log("✅ [ANSWER] Created and set local description");

        socket.emit("webrtc-answer", { to: from, sdp: pc.localDescription });
        console.log("📤 [ANSWER] Sent answer to", from);
      } catch (err) {
        console.error("❌ [OFFER-ERROR]", err);
      }
    });

    socket.on("webrtc-answer", async ({ from, sdp }) => {
      console.log(`📨 [WEBRTC-ANSWER] Received answer from ${from}`);
      const pc = pcsRef.current[from];
      if (!pc) {
        console.log("⚠️ [WEBRTC] No PC found for answer from", from);
        return;
      }
      try {
        console.log("🔗 [WEBRTC] Setting remote description");
        await pc.setRemoteDescription(new RTCSessionDescription(sdp));
      } catch (err) {
        console.error("❌ [WEBRTC-ANSWER-ERROR]", err);
      }
    });

    socket.on("ice-candidate", async ({ from, candidate }) => {
      console.log(`🧊 [ICE-CANDIDATE] From ${from}`);
      const pc = pcsRef.current[from];
      if (!pc) {
        console.log("⚠️ [ICE] No PC found for candidate from", from);
        return;
      }
      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (e) {
        console.error("❌ [ICE-ERROR]", e);
      }
    });

    return () => {
      if (!meetingId) {
        console.log("\n🧹 [SOCKET-CLEANUP] Cleaning up socket listeners");
        socket.off("connect", handleConnect);
        socket.off("meeting-joined");
        socket.off("waiting-room");
        socket.off("admission-granted");
        socket.off("admission-denied");
        socket.off("join-error");
        socket.off("admission-request");
        socket.off("user-admitted");
        socket.off("permissions-updated");
        socket.off("removed-by-admin");
        socket.off("screen-share-granted");
        socket.off("screen-share-denied");
        socket.off("screen-share-request");
        socket.off("chat-history");
        socket.off("chat-message");
        socket.off("meeting-participants");
        socket.off("user-joined");
        socket.off("webrtc-offer");
        socket.off("webrtc-answer");
        socket.off("ice-candidate");
        socket.off("user-left");
        socket.disconnect();
        socketConnectedRef.current = false;
        isJoiningRef.current = false;

        console.log("🧹 [CLEANUP] Closing all peer connections");
        Object.values(pcsRef.current).forEach((pc) => pc.close());
        pcsRef.current = {};
        peersRef.current = {};
        setPeersVersion(0);
      }
    };
  }, [meetingId, navigate]);

  // Process pending offers when local stream becomes available
  // Fix for the useEffect that processes pending offers
  // Replace the existing "Process pending offers when local stream becomes available" useEffect

  // FIXED: Process pending offers AFTER stream is fully ready with tracks
  useEffect(() => {
    if (!localStream || !localStream.active) return;

    // Make sure we have tracks and they're live
    const audioTracks = localStream.getAudioTracks();
    const videoTracks = localStream.getVideoTracks();
    const liveAudioTracks = audioTracks.filter((t) => t.readyState === "live");
    const liveVideoTracks = videoTracks.filter((t) => t.readyState === "live");

    if (liveAudioTracks.length === 0 || liveVideoTracks.length === 0) {
      console.log("⏳ [PENDING-OFFERS] Waiting for all tracks to be live");
      return;
    }

    const pending = pendingOffersRef.current.splice(
      0,
      pendingOffersRef.current.length
    );

    if (pending.length > 0) {
      console.log(
        `🔗 [PENDING-OFFERS] Processing ${pending.length} pending offers with ready stream`
      );

      // Process pending offers with staggered timing
      pending.forEach(({ socketId, user }, index) => {
        setTimeout(() => {
          console.log(`📞 [OFFER] Creating delayed offer to ${socketId}`);
          createOfferTo(socketId, user);
        }, index * 300); // Stagger by 300ms each
      });
    }
  }, [localStream?.active, localStream?.getTracks?.().length]);

  // CREATE PEER CONNECTION
  function createPeerConnection(remoteSocketId, remoteUser = null) {
    console.log(
      `🔗 [CREATE-PC] Creating peer connection for ${remoteSocketId}`
    );

    const pc = new RTCPeerConnection({ iceServers: STUN_SERVERS });

    // Add local tracks if available
    if (localStream && localStream.active) {
      const tracks = localStream.getTracks();
      console.log(`📤 [PC] Adding ${tracks.length} local tracks to PC`);
      tracks.forEach((t) => {
        if (t.readyState === "live") {
          console.log(`   - Adding ${t.kind} track`);
          pc.addTrack(t, localStream);
        }
      });
    }

    const remoteStream = new MediaStream();

    pc.ontrack = (ev) => {
      console.log(
        `📥 [PC-TRACK] Received ${ev.track.kind} track from ${remoteSocketId}`
      );

      ev.track.onunmute = () => {
        console.log(
          `🔊 [TRACK-UNMUTE] ${ev.track.kind} unmuted from ${remoteSocketId}`
        );

        if (!remoteStream.getTrackById(ev.track.id)) {
          remoteStream.addTrack(ev.track);
          console.log(
            `✅ [STREAM] Added ${ev.track.kind} track to remote stream`
          );

          // CRITICAL: Update state immediately when track is added
          setPeers((prev) => ({
            ...prev,
            [remoteSocketId]: {
              pc,
              stream: remoteStream,
              user: remoteUser ||
                prev[remoteSocketId]?.user || { name: "Unknown" },
            },
          }));
        }
      };

      // Also handle if track is already unmuted
      if (ev.track.muted === false) {
        if (!remoteStream.getTrackById(ev.track.id)) {
          remoteStream.addTrack(ev.track);
          console.log(`✅ [STREAM] Added unmuted ${ev.track.kind} track`);

          setPeers((prev) => ({
            ...prev,
            [remoteSocketId]: {
              pc,
              stream: remoteStream,
              user: remoteUser ||
                prev[remoteSocketId]?.user || { name: "Unknown" },
            },
          }));
        }
      }
    };

    pc.onicecandidate = (e) => {
      if (e.candidate) {
        socket.emit("ice-candidate", {
          to: remoteSocketId,
          candidate: e.candidate,
        });
      }
    };

    pc.onconnectionstatechange = () => {
      console.log(`🔌 [PC-STATE] ${remoteSocketId}: ${pc.connectionState}`);

      if (pc.connectionState === "connected") {
        console.log(
          `✅ [CONNECTED] Successfully connected to ${remoteSocketId}`
        );
      }

      if (["failed", "disconnected", "closed"].includes(pc.connectionState)) {
        console.log(`🧹 [CLEANUP] Removing peer ${remoteSocketId}`);

        setPeers((prev) => {
          const newPeers = { ...prev };
          delete newPeers[remoteSocketId];
          return newPeers;
        });

        if (pcsRef.current[remoteSocketId]) {
          pcsRef.current[remoteSocketId].close();
          delete pcsRef.current[remoteSocketId];
        }
      }
    };

    pc.oniceconnectionstatechange = () => {
      console.log(`🧊 [ICE-STATE] ${remoteSocketId}: ${pc.iceConnectionState}`);
    };

    // Initialize peer state immediately
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

  // CREATE OFFER
  async function createOfferTo(remoteSocketId, remoteUser = null) {
    console.log(
      `📞 [OFFER] Creating offer to ${remoteSocketId} (${remoteUser?.name})`
    );

    // CRITICAL FIX: Check for existing connection
    if (pcsRef.current[remoteSocketId]) {
      console.log("⚠️ [OFFER] PC already exists for", remoteSocketId);
      const existingPc = pcsRef.current[remoteSocketId];

      // Only skip if connection is good
      if (
        existingPc.connectionState === "connected" ||
        existingPc.connectionState === "connecting"
      ) {
        console.log("✅ [OFFER] Connection already active, skipping offer");
        return;
      } else {
        console.log("🔄 [OFFER] Closing stale connection");
        existingPc.close();
        delete pcsRef.current[remoteSocketId];
        delete peersRef.current[remoteSocketId];
      }
    }

    // Verify local stream is ready
    if (
      !localStream ||
      !localStream.active ||
      localStream.getTracks().length === 0
    ) {
      console.error("❌ [OFFER] Local stream not ready!");
      pendingOffersRef.current.push({
        socketId: remoteSocketId,
        user: remoteUser,
      });
      return;
    }

    const pc = createPeerConnection(remoteSocketId, remoteUser);
    pcsRef.current[remoteSocketId] = pc;

    try {
      console.log("🔗 [OFFER] Creating offer");
      const offer = await pc.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: true,
      });
      await pc.setLocalDescription(offer);

      console.log("📤 [OFFER] Sending offer to", remoteSocketId);
      socket.emit("webrtc-offer", {
        to: remoteSocketId,
        sdp: pc.localDescription,
        fromUser: storedUser,
      });
    } catch (err) {
      console.error(
        "❌ [OFFER-ERROR] Error creating offer to",
        remoteSocketId,
        err
      );
      // Clean up on error
      if (pcsRef.current[remoteSocketId]) {
        pcsRef.current[remoteSocketId].close();
        delete pcsRef.current[remoteSocketId];
        delete peersRef.current[remoteSocketId];
      }
    }
  }

  // CONTROLS
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
      const screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
      });
      const screenTrack = screenStream.getVideoTracks()[0];

      console.log(
        "🔄 [SCREEN-SHARE] Replacing video tracks in all peer connections"
      );
      Object.values(pcsRef.current).forEach((pc) => {
        const sender = pc.getSenders().find((s) => s.track?.kind === "video");
        if (sender) {
          sender.replaceTrack(screenTrack);
        }
      });

      screenTrack.onended = () => {
        console.log("🛑 [SCREEN-SHARE] Screen share ended, restoring camera");
        if (!localStream) return;
        const camTrack = localStream.getVideoTracks()[0];
        Object.values(pcsRef.current).forEach((pc) => {
          const sender = pc.getSenders().find((s) => s.track?.kind === "video");
          if (sender) sender.replaceTrack(camTrack);
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
    console.log(
      `👮 [ADMIN-PERMISSIONS] Updating permissions for ${userId}`,
      permissions
    );
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
    socket.emit("leave-meeting", { meetingId });
    navigate("/");
  }

  // RENDER WAITING ROOM
  if (inWaitingRoom) {
    return (
      <WaitingRoom userName={storedUser?.name} onCancel={() => navigate("/")} />
    );
  }

  // RENDER ACCESS DENIED
  if (accessDenied) {
    return <AccessDenied onGoBack={() => navigate("/")} />;
  }

  // RENDER MAIN MEETING
  return (
    <div className="h-screen flex flex-col bg-gradient-to-br from-slate-900 via-gray-900 to-slate-800 text-white overflow-hidden">
      <div className="flex-shrink-0 border-b border-gray-700/50 backdrop-blur-sm bg-gray-900/80">
        <TopBar />
      </div>

      <div className="flex-1 flex overflow-hidden relative">
        <div
          className={`flex-1 transition-all duration-500 ease-in-out ${
            sidebarOpen ? "lg:mr-96" : "mr-0"
          }`}
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
          className={`fixed lg:absolute top-16 lg:top-0 right-0 h-[calc(100%-16rem)] lg:h-full w-full lg:w-96 bg-gradient-to-b from-gray-800 to-gray-900 border-l border-gray-700/50 shadow-2xl transform transition-transform duration-500 ease-in-out z-40 ${
            sidebarOpen ? "translate-x-0" : "translate-x-full"
          }`}
        >
          <div className="h-full flex flex-col">
            {isAdmin && (
              <div
                key="admin-tabs"
                className="flex-shrink-0 flex border-b border-gray-700"
              >
                <button
                  onClick={() => setSidebarContent("chat")}
                  className={`flex-1 py-3 px-4 font-medium transition-colors ${
                    sidebarContent === "chat"
                      ? "bg-gray-700 text-white border-b-2 border-blue-500"
                      : "text-gray-400 hover:bg-gray-800"
                  }`}
                >
                  Chat
                </button>
                <button
                  onClick={() => setSidebarContent("admin")}
                  className={`flex-1 py-3 px-4 font-medium transition-colors relative ${
                    sidebarContent === "admin"
                      ? "bg-gray-700 text-white border-b-2 border-blue-500"
                      : "text-gray-400 hover:bg-gray-800"
                  }`}
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
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-30 lg:hidden"
            onClick={() => setSidebarOpen(false)}
          />
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
                  // FIXED: Only change content when OPENING sidebar, not closing
                  if (newState && isAdmin && sidebarContent !== "admin") {
                    // Don't force change if admin panel is already shown
                  }
                }}
              >
                <svg
                  className="w-5 h-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                  />
                </svg>
                <span className="hidden sm:inline">
                  {sidebarOpen ? "Hide" : "Show"}{" "}
                  {isAdmin && sidebarOpen
                    ? sidebarContent.charAt(0).toUpperCase() +
                      sidebarContent.slice(1)
                    : "Chat"}
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
