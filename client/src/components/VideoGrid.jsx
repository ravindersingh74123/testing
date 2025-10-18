import React, { useEffect, useRef } from "react";

export default function VideoGrid({
  localVideoRef,
  peers,
  participants,
  user,
  muted,
  cameraOff,
}) {
  console.log("🎨 [VIDEOGRID] Rendering with", Object.keys(peers).length, "peers");

  const peerEntries = Object.entries(peers).filter(
    ([socketId, p]) => p.stream && p.stream.getTracks().length > 0
  );

  const totalParticipants = 1 + peerEntries.length;

  const getGridClass = (count) => {
    if (count === 1) return "grid-cols-1";
    if (count === 2) return "grid-cols-1 md:grid-cols-2";
    if (count <= 4) return "grid-cols-2";
    if (count <= 9) return "grid-cols-3";
    return "grid-cols-4";
  };

  return (
    <div className="flex-1 overflow-auto bg-[#1E1E1E] rounded-xl p-4">
      <div
        className={`grid ${getGridClass(
          totalParticipants
        )} gap-4 place-items-center`}
      >
        {/* Local Video */}
        <div className="bg-black rounded-lg relative overflow-hidden w-full aspect-video">
          <video
            ref={localVideoRef}
            autoPlay
            muted
            playsInline
            className="w-full h-full object-cover scale-x-[-1]"
          />
          <div className="absolute bottom-2 left-2 bg-black/60 text-white text-sm px-2 py-1 rounded-md flex items-center gap-1">
            {user?.name || "You"} (You)
            {muted && <span className="text-red-500 font-bold">●</span>}
          </div>
        </div>

        {/* Remote Peers */}
        {peerEntries.map(([socketId, peerData]) => (
          <PeerTile
            key={socketId}
            socketId={socketId}
            stream={peerData.stream}
            name={peerData.user?.name || "Participant"}
          />
        ))}
      </div>
    </div>
  );
}

function PeerTile({ socketId, stream, name }) {
  const videoRef = useRef(null);

  useEffect(() => {
    const videoNode = videoRef.current;
    if (!videoNode || !stream) return;

    console.log(`📺 [PEER-TILE] Attaching stream for ${name} (${socketId})`);
    console.log(`   Tracks:`, stream.getTracks().map(t => `${t.kind}:${t.readyState}`));

    videoNode.srcObject = stream;

    // Force play with retry logic
    const attemptPlay = () => {
      const playPromise = videoNode.play();
      if (playPromise !== undefined) {
        playPromise
          .then(() => {
            console.log(`✅ [PLAYING] Video playing for ${name}`);
          })
          .catch((err) => {
            console.warn(`⚠️ [PLAY-FAILED] Retrying play for ${name}:`, err.message);
            setTimeout(attemptPlay, 500);
          });
      }
    };

    attemptPlay();

    // Listen for track events
    stream.getTracks().forEach(track => {
      track.onunmute = () => {
        console.log(`🔊 [UNMUTE] ${track.kind} unmuted for ${name}`);
        attemptPlay();
      };
    });

    return () => {
      if (videoNode) {
        videoNode.pause();
        videoNode.srcObject = null;
      }
    };
  }, [stream, name, socketId]);

  return (
    <div className="bg-black rounded-lg relative overflow-hidden w-full aspect-video">
      <video
        ref={videoRef}
        autoPlay
        playsInline
        className="w-full h-full object-cover"
      />
      <div className="absolute bottom-2 left-2 bg-black/60 text-white text-sm px-2 py-1 rounded-md">
        {name}
      </div>
    </div>
  );
}