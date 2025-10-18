

// src/pages/Meeting.jsx
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
  const [localStream, setLocalStream] = useState(null);
  const [peers, setPeers] = useState({});
  const pcsRef = useRef({});
  const [participants, setParticipants] = useState([]);
  const [chatMessages, setChatMessages] = useState([]);
  const [muted, setMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [sidebarContent, setSidebarContent] = useState('chat'); // 'chat' or 'admin'

  // Admin states
  const [isAdmin, setIsAdmin] = useState(false);
  const [userPermissions, setUserPermissions] = useState({
    canUnmute: true,
    canVideo: true,
    canScreenShare: true,
  });
  const [waitingRoom, setWaitingRoom] = useState([]);
  const [meetingSettings, setMeetingSettings] = useState({});
  
  // Waiting/Denied states
  const [inWaitingRoom, setInWaitingRoom] = useState(false);
  const [accessDenied, setAccessDenied] = useState(false);

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

    if (socket.connected) {
      socket.disconnect();
    }
    
    socket.connect();
    socketConnectedRef.current = true;

    const handleConnect = () => {
      console.log("Socket connected, joining meeting");
      socket.emit("join-meeting", { meetingId, user: storedUser });
    };

    if (socket.connected) {
      handleConnect();
    } else {
      socket.on("connect", handleConnect);
    }

    // Meeting joined successfully
    socket.on("meeting-joined", ({ isAdmin: adminStatus, permissions, settings }) => {
      console.log("Meeting joined:", { adminStatus, permissions, settings });
      setIsAdmin(adminStatus);
      setUserPermissions(permissions);
      setMeetingSettings(settings);
      setInWaitingRoom(false);
      
      // Apply initial settings
      if (settings.muteMicOnEntry && !adminStatus) {
        setMuted(true);
        if (localStream) {
          localStream.getAudioTracks().forEach(t => t.enabled = false);
        }
      }
      if (settings.disableVideoOnEntry && !adminStatus) {
        setCameraOff(true);
        if (localStream) {
          localStream.getVideoTracks().forEach(t => t.enabled = false);
        }
      }
    });

    // Waiting room
    socket.on("waiting-room", () => {
      console.log("Placed in waiting room");
      setInWaitingRoom(true);
    });

    // Admission granted
    socket.on("admission-granted", ({ permissions, settings }) => {
      console.log("Admission granted");
      setInWaitingRoom(false);
      setUserPermissions(permissions);
      setMeetingSettings(settings);
      socket.emit("join-meeting", { meetingId, user: storedUser });
    });

    // Admission denied
    socket.on("admission-denied", () => {
      console.log("Admission denied");
      setInWaitingRoom(false);
      setAccessDenied(true);
    });

    // Join error
    socket.on("join-error", ({ message }) => {
      alert(message);
      navigate("/");
    });

    // Admission request (for admin)
    socket.on("admission-request", (user) => {
      console.log("Admission request:", user);
      setWaitingRoom(prev => {
        // Avoid duplicates
        if (prev.some(u => u.socketId === user.socketId)) return prev;
        return [...prev, user];
      });
    });

    // Permissions updated
    socket.on("permissions-updated", (permissions) => {
      console.log("Permissions updated:", permissions);
      setUserPermissions(permissions);
      
      // Enforce permissions
      if (!permissions.canUnmute && localStream) {
        localStream.getAudioTracks().forEach(t => t.enabled = false);
        setMuted(true);
      }
      if (!permissions.canVideo && localStream) {
        localStream.getVideoTracks().forEach(t => t.enabled = false);
        setCameraOff(true);
      }
    });

    // Removed by admin
    socket.on("removed-by-admin", () => {
      alert("You have been removed from the meeting by the host.");
      navigate("/");
    });

    // Screen share response
    socket.on("screen-share-granted", () => {
      startScreenShare();
    });

    socket.on("screen-share-denied", () => {
      alert("Screen share permission denied. Please ask the host for permission.");
    });

    socket.on("screen-share-request", ({ userId, name, socketId }) => {
      // Notify admin of screen share request
      console.log("Screen share request from:", name);
    });

    // Chat history
    socket.on("chat-history", (messages) => {
      setChatMessages(messages);
    });

    // Chat message
    socket.on("chat-message", ({ message, user, timestamp }) => {
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
    });

    // Meeting participants
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

    // User joined
    socket.on("user-joined", ({ socketId, user, permissions }) => {
      console.log("User joined:", socketId, user);
      setParticipants((prev) => {
        if (prev.some((x) => x.socketId === socketId)) return prev;
        return [...prev, { socketId, user, permissions }];
      });
      if (localStream) createOfferTo(socketId, user);
      else pendingOffersRef.current.push({ socketId, user });
    });

    // User left
    socket.on("user-left", ({ socketId }) => {
      console.log("User left:", socketId);
      setParticipants((prev) => prev.filter((p) => p.socketId !== socketId));
      setWaitingRoom(prev => prev.filter(u => u.socketId !== socketId));
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

    // WebRTC signaling
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
      socket.off("connect", handleConnect);
      socket.off("meeting-joined");
      socket.off("waiting-room");
      socket.off("admission-granted");
      socket.off("admission-denied");
      socket.off("join-error");
      socket.off("admission-request");
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
      Object.values(pcsRef.current).forEach((pc) => pc.close());
      pcsRef.current = {};
      setPeers({});
    };
  }, [meetingId, localStream, navigate]);

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
    
    // Check permission
    if (!userPermissions.canUnmute && muted) {
      alert("You don't have permission to unmute. Please ask the host.");
      return;
    }
    
    const tracks = localStream.getAudioTracks();
    tracks.forEach((t) => (t.enabled = !t.enabled));
    setMuted(tracks.length ? !tracks[0].enabled : false);
  }

  function toggleCamera() {
    if (!localStream) return;
    
    // Check permission
    if (!userPermissions.canVideo && cameraOff) {
      alert("You don't have permission to enable video. Please ask the host.");
      return;
    }
    
    const tracks = localStream.getVideoTracks();
    tracks.forEach((t) => (t.enabled = !t.enabled));
    setCameraOff(tracks.length ? !tracks[0].enabled : false);
  }

  async function handleScreenShare() {
    // Check permission
    if (!userPermissions.canScreenShare && !isAdmin) {
      socket.emit("request-screen-share", { meetingId });
      alert("Screen share request sent to the host.");
      return;
    }
    
    startScreenShare();
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
        const sender = pc.getSenders().find((s) => s.track?.kind === "video");
        if (sender) sender.replaceTrack(screenTrack);
      });
      screenTrack.onended = () => {
        if (!localStream) return;
        const camTrack = localStream.getVideoTracks()[0];
        Object.values(pcsRef.current).forEach((pc) => {
          const sender = pc.getSenders().find((s) => s.track?.kind === "video");
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

  // --- ADMIN FUNCTIONS ---
  function handleAdmitUser(userId, socketId) {
    socket.emit("admit-user", { meetingId, userId, socketId });
    setWaitingRoom(prev => prev.filter(u => u.socketId !== socketId));
  }

  function handleDenyUser(userId, socketId) {
    socket.emit("deny-user", { meetingId, userId, socketId });
    setWaitingRoom(prev => prev.filter(u => u.socketId !== socketId));
  }

  function handleUpdatePermissions(userId, permissions) {
    socket.emit("update-permissions", { meetingId, userId, permissions });
    
    // Update local participant list
    setParticipants(prev => 
      prev.map(p => {
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
      socket.emit("remove-participant", { meetingId, userId });
    }
  }

  async function handleUpdateSettings(settings) {
    try {
      const token = localStorage.getItem("token");
      const response = await fetch(`/api/admin/${meetingId}/settings`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({ settings })
      });

      if (response.ok) {
        setMeetingSettings(settings);
        alert("Settings updated successfully!");
      } else {
        alert("Failed to update settings");
      }
    } catch (err) {
      console.error("Error updating settings:", err);
      alert("Failed to update settings");
    }
  }

  function handleLeave() {
    socket.emit("leave-meeting", { meetingId });
    navigate("/");
  }

  // --- RENDER WAITING ROOM ---
  if (inWaitingRoom) {
    return (
      <WaitingRoom 
        userName={storedUser?.name}
        onCancel={() => navigate("/")}
      />
    );
  }

  // --- RENDER ACCESS DENIED ---
  if (accessDenied) {
    return <AccessDenied onGoBack={() => navigate("/")} />;
  }

  // --- RENDER MAIN MEETING ---
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
            {/* Sidebar Tabs */}
            {isAdmin && (
              <div className="flex-shrink-0 flex border-b border-gray-700">
                <button
                  onClick={() => setSidebarContent('chat')}
                  className={`flex-1 py-3 px-4 font-medium transition-colors ${
                    sidebarContent === 'chat'
                      ? 'bg-gray-700 text-white border-b-2 border-blue-500'
                      : 'text-gray-400 hover:bg-gray-800'
                  }`}
                >
                  Chat
                </button>
                <button
                  onClick={() => setSidebarContent('admin')}
                  className={`flex-1 py-3 px-4 font-medium transition-colors relative ${
                    sidebarContent === 'admin'
                      ? 'bg-gray-700 text-white border-b-2 border-blue-500'
                      : 'text-gray-400 hover:bg-gray-800'
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
              {sidebarContent === 'chat' ? (
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
                  setSidebarOpen(!sidebarOpen);
                  if (!sidebarOpen && isAdmin) {
                    setSidebarContent('chat');
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
                  {sidebarOpen ? "Hide" : "Show"} {isAdmin && sidebarOpen ? sidebarContent.charAt(0).toUpperCase() + sidebarContent.slice(1) : "Chat"}
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