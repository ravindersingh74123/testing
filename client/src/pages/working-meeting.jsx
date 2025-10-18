// src/pages/Meeting.jsx
import React, { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { socket } from "../services/socket";
import VideoGrid from "../components/VideoGrid";
import Controls from "../components/Controls";
import ChatPanel from "../components/ChatPanel";
import TopBar from "../components/TopBar";

const storedUser = JSON.parse(localStorage.getItem("user"));

// Normalize user object to always use _id
if (storedUser && storedUser.id && !storedUser._id) {
  storedUser._id = storedUser.id;
}

const STUN_SERVERS = [{ urls: "stun:stun.l.google.com:19302" }];

export default function Meeting() {
  const { id: meetingId } = useParams();
  const localVideoRef = useRef(null);
  const [localStream, setLocalStream] = useState(null);
  const [peers, setPeers] = useState({});
  const pcsRef = useRef({});
  const [participants, setParticipants] = useState([]);
  const [chatMessages, setChatMessages] = useState([]);
  const [muted, setMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const pendingOffersRef = useRef([]);
  const socketConnectedRef = useRef(false);

  // --- GET LOCAL MEDIA ---
  useEffect(() => {
    let mounted = true;
    async function startLocal() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: true,
        });
        if (!mounted) return;
        setLocalStream(stream);
        if (localVideoRef.current) localVideoRef.current.srcObject = stream;
      } catch (err) {
        console.error("Camera/Mic error", err);
        alert("Please allow camera and microphone access.");
      }
    }
    startLocal();
    return () => {
      mounted = false;
    };
  }, []);

  // --- SOCKET CONNECTION & EVENTS ---
  useEffect(() => {
    if (!meetingId || !storedUser) return;

    // Force fresh connection on mount
    if (socket.connected) {
      socket.disconnect();
    }
    
    socket.connect();
    socketConnectedRef.current = true;

    // Wait for connection before joining
    const handleConnect = () => {
      console.log("Socket connected, joining meeting");
      socket.emit("join-meeting", { meetingId, user: storedUser });
    };

    if (socket.connected) {
      handleConnect();
    } else {
      socket.on("connect", handleConnect);
    }

    // Load chat history
    const handleChatHistory = (messages) => {
      setChatMessages(messages);
    };
    socket.on("chat-history", handleChatHistory);

    // Handle new chat messages
    const handleChatMessage = ({ message, user, timestamp }) => {
      setChatMessages((prev) => {
        const lastMsg = prev[prev.length - 1];
        if (
          lastMsg &&
          lastMsg.message === message &&
          lastMsg.user._id === user._id
        )
          return prev;
        return [...prev, { message, user, timestamp }];
      });
    };
    socket.on("chat-message", handleChatMessage);

    // Handle meeting participants
    socket.on("meeting-participants", (list) => {
      console.log("Received meeting-participants:", list);
      const others = list.filter((p) => p.socketId !== socket.id);
      setParticipants(others);
      others.forEach((p) => {
        if (localStream) {
          createOfferTo(p.socketId, p.user);
        } else {
          pendingOffersRef.current.push({ socketId: p.socketId, user: p.user });
        }
      });
    });

    // When a new user joins
    socket.on("user-joined", ({ socketId, user }) => {
      console.log("User joined:", socketId, user);
      setParticipants((prev) => {
        if (prev.some((x) => x.socketId === socketId)) return prev;
        return [...prev, { socketId, user }];
      });
      if (localStream) createOfferTo(socketId, user);
      else pendingOffersRef.current.push({ socketId, user });
    });

    // When a user leaves
    socket.on("user-left", ({ socketId }) => {
      console.log("User left:", socketId);
      setParticipants((prev) => prev.filter((p) => p.socketId !== socketId));
      if (pcsRef.current[socketId]) {
        pcsRef.current[socketId].close();
        delete pcsRef.current[socketId];
      }
      setPeers((prev) => {
        const updated = { ...prev };
        delete updated[socketId];
        return updated;
      });
    });

    socket.on("webrtc-offer", async ({ from, sdp, fromUser }) => {
      console.log("Received offer from:", from, fromUser);
      if (pcsRef.current[from]) {
        console.log("PC already exists for:", from);
        return;
      }
      const pc = createPeerConnection(from, fromUser);
      pcsRef.current[from] = pc;
      await pc.setRemoteDescription(new RTCSessionDescription(sdp));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      socket.emit("webrtc-answer", { to: from, sdp: pc.localDescription });
    });

    socket.on("webrtc-answer", async ({ from, sdp }) => {
      console.log("Received answer from:", from);
      const pc = pcsRef.current[from];
      if (!pc) {
        console.log("No PC found for answer from:", from);
        return;
      }
      await pc.setRemoteDescription(new RTCSessionDescription(sdp));
    });

    socket.on("ice-candidate", async ({ from, candidate }) => {
      const pc = pcsRef.current[from];
      if (!pc) {
        console.log("No PC found for ICE candidate from:", from);
        return;
      }
      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (e) {
        console.error("Error adding ICE candidate", e);
      }
    });

    return () => {
      socket.off("chat-history", handleChatHistory);
      socket.off("chat-message", handleChatMessage);
      socket.off("meeting-participants");
      socket.off("user-joined");
      socket.off("webrtc-offer");
      socket.off("webrtc-answer");
      socket.off("ice-candidate");
      socket.off("user-left");
      socket.disconnect();
      socketConnectedRef.current = false;
      Object.values(pcsRef.current).forEach((pc) => pc.close());
      pcsRef.current = {};
      setPeers({});
    };
  }, [meetingId, localStream]);

  useEffect(() => {
    if (!localStream) return;
    const pending = pendingOffersRef.current.splice(
      0,
      pendingOffersRef.current.length
    );
    pending.forEach(({ socketId, user }) => {
      createOfferTo(socketId, user);
    });
  }, [localStream]);

  // --- CREATE PEER CONNECTION ---
  function createPeerConnection(remoteSocketId, remoteUser = null) {
    console.log("Creating peer connection for:", remoteSocketId, remoteUser);
    const pc = new RTCPeerConnection({ iceServers: STUN_SERVERS });

    if (localStream) {
      localStream.getTracks().forEach((t) => {
        console.log("Adding local track to PC:", t.kind);
        pc.addTrack(t, localStream);
      });
    }

    const remoteStream = new MediaStream();
    pc.ontrack = (ev) => {
      console.log("Received remote track:", ev.track.kind, "from:", remoteSocketId);
      ev.streams?.[0]?.getTracks().forEach((t) => {
        console.log("Adding track to remote stream:", t.kind);
        remoteStream.addTrack(t);
      });
      setPeers((prev) => ({
        ...prev,
        [remoteSocketId]: {
          pc,
          stream: remoteStream,
          user: remoteUser || prev?.[remoteSocketId]?.user || null,
        },
      }));
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
      console.log("Connection state changed:", pc.connectionState, "for:", remoteSocketId);
      if (["failed", "disconnected", "closed"].includes(pc.connectionState)) {
        setPeers((prev) => {
          const copy = { ...prev };
          delete copy[remoteSocketId];
          return copy;
        });
        if (pcsRef.current[remoteSocketId]) {
          pcsRef.current[remoteSocketId].close();
        }
        delete pcsRef.current[remoteSocketId];
      }
    };

    // Initialize peer state immediately
    setPeers((prev) => ({
      ...prev,
      [remoteSocketId]: {
        pc,
        stream: remoteStream,
        user: remoteUser || prev?.[remoteSocketId]?.user || null,
      },
    }));

    return pc;
  }

  // --- CREATE OFFER ---
  async function createOfferTo(remoteSocketId, remoteUser = null) {
    console.log("Creating offer to:", remoteSocketId, remoteUser);
    if (pcsRef.current[remoteSocketId]) {
      console.log("PC already exists, skipping offer creation");
      return;
    }

    const pc = createPeerConnection(remoteSocketId, remoteUser);
    pcsRef.current[remoteSocketId] = pc;

    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      socket.emit("webrtc-offer", {
        to: remoteSocketId,
        sdp: pc.localDescription,
        fromUser: storedUser,
      });
      console.log("Offer sent to:", remoteSocketId);
    } catch (err) {
      console.error("Error creating offer to", remoteSocketId, err);
    }
  }

  // --- CONTROLS ---
  function toggleMute() {
    if (!localStream) return;
    const tracks = localStream.getAudioTracks();
    tracks.forEach((t) => (t.enabled = !t.enabled));
    setMuted(tracks.length ? !tracks[0].enabled : false);
  }

  function toggleCamera() {
    if (!localStream) return;
    const tracks = localStream.getVideoTracks();
    tracks.forEach((t) => (t.enabled = !t.enabled));
    setCameraOff(tracks.length ? !tracks[0].enabled : false);
  }

  async function startScreenShare() {
    if (!navigator.mediaDevices.getDisplayMedia)
      return alert("Screen sharing not supported.");
    try {
      const screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
      });
      const screenTrack = screenStream.getVideoTracks()[0];
      Object.values(pcsRef.current).forEach((pc) => {
        const sender = pc.getSenders().find((s) => s.track.kind === "video");
        if (sender) sender.replaceTrack(screenTrack);
      });
      screenTrack.onended = () => {
        if (!localStream) return;
        const camTrack = localStream.getVideoTracks()[0];
        Object.values(pcsRef.current).forEach((pc) => {
          const sender = pc.getSenders().find((s) => s.track.kind === "video");
          if (sender) sender.replaceTrack(camTrack);
        });
      };
    } catch (err) {
      console.error("Screen share failed", err);
    }
  }

  // --- SEND CHAT ---
  async function sendChat(message) {
    if (!message?.trim()) return;
    const user = storedUser;
    if (!user) return alert("User not logged in");

    const userId = user._id || user.id;
    if (!userId) {
      console.error("User object is missing id:", user);
      alert("Error: User ID is missing. Please log in again.");
      return;
    }

    socket.emit("chat-message", {
      meetingId,
      message,
      user: {
        name: user.name,
        _id: userId,
      },
    });
  }

  // --- RENDER ---
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
          className={`fixed lg:absolute top-0 right-0 h-full w-full lg:w-96 bg-gradient-to-b from-gray-800 to-gray-900 border-l border-gray-700/50 shadow-2xl transform transition-transform duration-500 ease-in-out z-40 ${
            sidebarOpen ? "translate-x-0" : "translate-x-full"
          }`}
        >
          <div className="h-full flex flex-col">
            <div className="flex-shrink-0 px-6 py-4 border-b border-gray-700/50 bg-gray-800/50 backdrop-blur-sm">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-gray-100">
                  Meeting Chat
                </h2>
                <button
                  onClick={() => setSidebarOpen(false)}
                  className="lg:hidden p-2 hover:bg-gray-700/50 rounded-lg transition-colors duration-200"
                  aria-label="Close chat"
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
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </button>
              </div>
              <p className="text-xs text-gray-400 mt-1">
                {participants.length + 1} participant
                {participants.length !== 0 ? "s" : ""}
              </p>
            </div>

            <div className="flex-1 overflow-hidden">
              <ChatPanel messages={chatMessages} onSend={sendChat} />
            </div>

            <div className="flex-shrink-0 p-4 border-t border-gray-700/50 bg-gray-800/30">
              <button
                className="w-full py-3 bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 rounded-xl font-medium shadow-lg hover:shadow-red-500/25 transition-all duration-200 transform hover:scale-[1.02] active:scale-[0.98]"
                onClick={() =>
                  alert("Leave meeting functionality can be implemented here")
                }
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
            </div>

            <div className="flex-1 flex justify-center">
              <Controls
                muted={muted}
                cameraOff={cameraOff}
                onToggleMute={toggleMute}
                onToggleCamera={toggleCamera}
                onScreenShare={startScreenShare}
              />
            </div>

            <div className="flex items-center gap-2">
              <button
                className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 rounded-xl font-medium shadow-lg hover:shadow-blue-500/25 transition-all duration-200 transform hover:scale-[1.02] active:scale-[0.98]"
                onClick={() => setSidebarOpen(!sidebarOpen)}
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
                  {sidebarOpen ? "Hide" : "Show"} Chat
                </span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}