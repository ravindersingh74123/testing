// import React, { useEffect, useRef } from "react";

// export default function VideoGrid({
//   localVideoRef,
//   peers,
//   participants,
//   user,
//   muted,
//   cameraOff,
// }) {
//   console.log("🎨 [VIDEOGRID] Rendering with", Object.keys(peers).length, "peers");

//   const peerEntries = Object.entries(peers).filter(
//     ([socketId, p]) => p.stream && p.stream.getTracks().length > 0
//   );

//   const totalParticipants = 1 + peerEntries.length;

//   const getGridClass = (count) => {
//     if (count === 1) return "grid-cols-1";
//     if (count === 2) return "grid-cols-1 md:grid-cols-2";
//     if (count <= 4) return "grid-cols-2";
//     if (count <= 9) return "grid-cols-3";
//     return "grid-cols-4";
//   };

//   return (
//     <div className="flex-1 overflow-auto bg-[#1E1E1E] rounded-xl p-4">
//       <div
//         className={`grid ${getGridClass(
//           totalParticipants
//         )} gap-4 place-items-center`}
//       >
//         {/* Local Video */}
//         <div className="bg-black rounded-lg relative overflow-hidden w-full aspect-video">
//           <video
//             ref={localVideoRef}
//             autoPlay
//             muted
//             playsInline
//             className="w-full h-full object-cover scale-x-[-1]"
//           />
//           <div className="absolute bottom-2 left-2 bg-black/60 text-white text-sm px-2 py-1 rounded-md flex items-center gap-1">
//             {user?.name || "You"} (You)
//             {muted && <span className="text-red-500 font-bold">●</span>}
//           </div>
//         </div>

//         {/* Remote Peers */}
//         {peerEntries.map(([socketId, peerData]) => (
//           <PeerTile
//             key={socketId}
//             socketId={socketId}
//             stream={peerData.stream}
//             name={peerData.user?.name || "Participant"}
//           />
//         ))}
//       </div>
//     </div>
//   );
// }

// function PeerTile({ socketId, stream, name }) {
//   const videoRef = useRef(null);

//   useEffect(() => {
//     const videoNode = videoRef.current;
//     if (!videoNode || !stream) return;

//     console.log(`📺 [PEER-TILE] Attaching stream for ${name} (${socketId})`);
//     console.log(`   Tracks:`, stream.getTracks().map(t => `${t.kind}:${t.readyState}`));

//     videoNode.srcObject = stream;

//     // Force play with retry logic
//     const attemptPlay = () => {
//       const playPromise = videoNode.play();
//       if (playPromise !== undefined) {
//         playPromise
//           .then(() => {
//             console.log(`✅ [PLAYING] Video playing for ${name}`);
//           })
//           .catch((err) => {
//             console.warn(`⚠️ [PLAY-FAILED] Retrying play for ${name}:`, err.message);
//             setTimeout(attemptPlay, 500);
//           });
//       }
//     };

//     attemptPlay();

//     // Listen for track events
//     stream.getTracks().forEach(track => {
//       track.onunmute = () => {
//         console.log(`🔊 [UNMUTE] ${track.kind} unmuted for ${name}`);
//         attemptPlay();
//       };
//     });

//     return () => {
//       if (videoNode) {
//         videoNode.pause();
//         videoNode.srcObject = null;
//       }
//     };
//   }, [stream, name, socketId]);

//   return (
//     <div className="bg-black rounded-lg relative overflow-hidden w-full aspect-video">
//       <video
//         ref={videoRef}
//         autoPlay
//         playsInline
//         className="w-full h-full object-cover"
//       />
//       <div className="absolute bottom-2 left-2 bg-black/60 text-white text-sm px-2 py-1 rounded-md">
//         {name}
//       </div>
//     </div>
//   );
// }









// videogrid.jsx
import React, { useEffect, useRef, useState, useMemo } from "react";

/**
 * Updated VideoGrid to avoid overlapping tiles and provide smooth vertical scrolling.
 *
 * - Grid view uses gridAutoRows = '1fr' so each tile gets equal height and doesn't overlap.
 * - Stack view (vertical scrolling) sets a consistent tile height and prevents shrinking (flex-shrink-0).
 * - Important flexbox fixes: add `min-h-0` and `min-w-0` at appropriate parents so children can shrink correctly.
 *
 * Props: localVideoRef, peers, participants, user, muted, cameraOff
 */
export default function VideoGrid({
  localVideoRef,
  peers = {},
  participants,
  user,
  muted,
  cameraOff,
}) {
  // filter peers that have a stream
  const peerEntries = useMemo(
    () =>
      Object.entries(peers).filter(
        ([, p]) => p && p.stream && p.stream.getTracks().length > 0
      ),
    [peers]
  );

  const totalParticipants = 1 + peerEntries.length;

  // threshold to auto switch to vertical stacked view (you can tune)
  const AUTO_STACK_THRESHOLD = 7;

  const [forceView, setForceView] = useState(null); // 'grid' | 'stack' | null
  const inferredStack = totalParticipants >= AUTO_STACK_THRESHOLD;
  const isStackView = forceView === "stack" || (forceView === null && inferredStack);

  const getGridClass = (count) => {
    if (count === 1) return "grid-cols-1";
    if (count === 2) return "grid-cols-1 md:grid-cols-2";
    if (count <= 4) return "grid-cols-2";
    if (count <= 9) return "grid-cols-3";
    return "grid-cols-4";
  };

  return (
    <div className="flex-1 h-full min-h-0 min-w-0 bg-[#1E1E1E] rounded-xl p-4 flex flex-col">
      {/* Top bar */}
      <div className="flex items-center justify-between mb-3">
        <div className="text-sm text-gray-200">
          Participants: <span className="font-medium">{totalParticipants}</span>
        </div>

        <div className="flex items-center gap-2">
          <ToggleButton
            active={forceView === "grid"}
            onClick={() => setForceView((v) => (v === "grid" ? null : "grid"))}
            label="Grid"
            title="Force Grid view"
          />
          <ToggleButton
            active={forceView === "stack"}
            onClick={() => setForceView((v) => (v === "stack" ? null : "stack"))}
            label="Stack"
            title="Force Vertical (Stack) view"
          />
          <button
            onClick={() => setForceView(null)}
            className="px-2 py-1 rounded-md text-sm bg-black/30 text-gray-200 hover:bg-black/50"
            title="Auto view"
          >
            Auto
          </button>
        </div>
      </div>

      {/* Content area must be min-h-0 so children can scroll inside */}
      <div className="flex-1 min-h-0">
        {/* STACK (vertical) view */}
        {isStackView ? (
          <div className="h-full flex flex-col gap-4 min-h-0">
            {/* Local tile pinned at top: fixed height so stack tiles are consistent */}
            <div className="w-full flex-shrink-0">
              <LocalTile
                localVideoRef={localVideoRef}
                user={user}
                muted={muted}
                cameraOff={cameraOff}
              />
            </div>

            {/* Remote scrollable list: make sure min-h-0 allows scroll inside flex container */}
            <div
              className="w-full flex-1 overflow-y-auto pr-2 min-h-0"
              style={{ WebkitOverflowScrolling: "touch" }}
            >
              <div className="flex flex-col gap-4">
                {peerEntries.map(([socketId, peerData]) => (
                  <div key={socketId} className="flex-shrink-0">
                    {/* fixed height tile to avoid overlap and to provide predictable scrolling */}
                    <PeerTileStack
                      socketId={socketId}
                      stream={peerData.stream}
                      name={peerData.user?.name || "Participant"}
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          // GRID VIEW: gridAutoRows: '1fr' => every grid row has equal height (prevents overlap).
          <div
            className={`grid ${getGridClass(totalParticipants)} gap-4 place-items-center overflow-y-auto pr-2 h-full min-h-0 min-w-0`}
            style={{ WebkitOverflowScrolling: "touch", alignContent: "start", gridAutoRows: "1fr" }}
          >
            {/* Local Video as a full tile (fills row height) */}
            <div className="bg-black rounded-lg relative overflow-hidden w-full h-full">
              <video
                ref={localVideoRef}
                autoPlay
                muted
                playsInline
                className="w-full h-full object-cover scale-x-[-1]"
              />
              <div className="absolute bottom-2 left-2 bg-black/60 text-white text-sm px-2 py-1 rounded-md flex items-center gap-2">
                <span className="font-medium">{user?.name || "You"}</span>
                <span className="text-xs text-gray-300">(You)</span>
                {muted && <span className="text-red-500 font-bold">●</span>}
                {cameraOff && <span className="ml-1 text-yellow-300 text-xs">cam off</span>}
              </div>
            </div>

            {/* Remote peers */}
            {peerEntries.map(([socketId, peerData]) => (
              <PeerTileGrid
                key={socketId}
                socketId={socketId}
                stream={peerData.stream}
                name={peerData.user?.name || "Participant"}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* Toggle button component */
function ToggleButton({ active, onClick, label, title }) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1 rounded-md text-sm focus:outline-none ${
        active ? "bg-gray-700 text-white" : "bg-black/40 text-gray-200 hover:bg-black/60"
      }`}
      aria-pressed={active}
      title={title}
    >
      {label}
    </button>
  );
}

/* Local tile — fixed height for stack view; flexible for grid */
function LocalTile({ localVideoRef, user, muted, cameraOff }) {
  return (
    <div className="bg-black rounded-lg relative overflow-hidden w-full h-56 md:h-64">
      <video
        ref={localVideoRef}
        autoPlay
        muted
        playsInline
        className="w-full h-full object-cover scale-x-[-1]"
      />
      <div className="absolute bottom-2 left-2 bg-black/60 text-white text-sm px-2 py-1 rounded-md flex items-center gap-2">
        <span className="font-medium">{user?.name || "You"}</span>
        <span className="text-xs text-gray-300">(You)</span>
        {muted && <span className="text-red-500 font-bold">●</span>}
        {cameraOff && <span className="ml-1 text-yellow-300 text-xs">cam off</span>}
      </div>
    </div>
  );
}

/* Peer tile used in GRID view -> should fill the grid cell (use h-full) */
function PeerTileGrid({ socketId, stream, name }) {
  const videoRef = useRef(null);
  const [cameraActive, setCameraActive] = useState(true);
  const [audioBlocked, setAudioBlocked] = useState(false);
  const [userMutedAudio, setUserMutedAudio] = useState(false);

  useEffect(() => {
    const videoNode = videoRef.current;
    if (!videoNode || !stream) return;

    const videoTracks = stream.getVideoTracks() || [];
    const hasActiveVideo =
      videoTracks.length > 0 && videoTracks.some((t) => t.readyState !== "ended" && t.enabled);
    setCameraActive(Boolean(hasActiveVideo));

    videoNode.srcObject = stream;

    let cancelled = false;
    const attemptPlay = async (tryMuted = false) => {
      if (cancelled) return;
      try {
        videoNode.muted = !!tryMuted || userMutedAudio;
        const p = videoNode.play();
        if (p !== undefined) {
          await p;
          if (!tryMuted) setAudioBlocked(false);
          else setAudioBlocked(true);
        }
      } catch (err) {
        if (!tryMuted) return attemptPlay(true);
        else setAudioBlocked(true);
      }
    };

    attemptPlay(false);

    const onTrackChange = () => {
      const vt = stream.getVideoTracks() || [];
      const hasVid = vt.some((t) => t.readyState !== "ended" && t.enabled);
      setCameraActive(Boolean(hasVid));
      attemptPlay(false);
    };

    stream.getTracks().forEach((track) => {
      track.onunmute = onTrackChange;
      track.onended = onTrackChange;
      track.onmute = onTrackChange;
    });

    return () => {
      cancelled = true;
      try {
        if (videoNode) {
          videoNode.pause();
          videoNode.srcObject = null;
        }
      } catch (e) {}
    };
  }, [stream, name, socketId, userMutedAudio]);

  const handleEnableAudioClick = () => {
    const videoNode = videoRef.current;
    if (!videoNode) return;
    try {
      videoNode.muted = false;
      videoNode.play().catch(() => {});
      setAudioBlocked(false);
    } catch (e) {}
  };

  const toggleLocalMuteForTile = () => {
    const videoNode = videoRef.current;
    if (!videoNode) return;
    const next = !userMutedAudio;
    setUserMutedAudio(next);
    videoNode.muted = next;
  };

  return (
    <div className="bg-black rounded-lg relative overflow-hidden w-full h-full">
      {cameraActive ? (
        <>
          <video
            ref={videoRef}
            autoPlay
            playsInline
            className="w-full h-full object-cover"
          />
          <div className="absolute bottom-2 left-2 bg-black/60 text-white text-sm px-2 py-1 rounded-md flex items-center gap-2">
            <span className="font-medium">{name}</span>
          </div>

          <div className="absolute top-2 right-2 flex items-center gap-2">
            <button
              onClick={toggleLocalMuteForTile}
              className="px-2 py-1 rounded-md bg-black/50 text-xs text-gray-200 focus:outline-none"
              aria-pressed={userMutedAudio}
            >
              {userMutedAudio ? "Unmute" : "Mute"}
            </button>

            {audioBlocked && (
              <button
                onClick={handleEnableAudioClick}
                className="px-2 py-1 rounded-md bg-yellow-500/95 text-xs text-black font-medium focus:outline-none"
                aria-label={`Enable audio for ${name}`}
              >
                Enable audio
              </button>
            )}
          </div>
        </>
      ) : (
        <div className="w-full h-full bg-gray-900 flex items-center justify-center">
          <div className="text-center text-gray-200">
            <div
              className="w-16 h-16 rounded-full bg-gray-700 flex items-center justify-center mx-auto mb-3 text-2xl font-bold"
              aria-hidden
            >
              {String(name || "P").charAt(0).toUpperCase()}
            </div>
            <div className="text-sm font-medium">{name}</div>
            <div className="text-xs text-gray-400 mt-1">Camera off</div>
          </div>

          {/* keep audio attached but video hidden for camera-off */}
          <video ref={videoRef} autoPlay playsInline className="hidden" />
          <div className="absolute top-2 right-2">
            <button
              onClick={toggleLocalMuteForTile}
              className="px-2 py-1 rounded-md bg-black/50 text-xs text-gray-200 focus:outline-none"
            >
              {userMutedAudio ? "Unmute" : "Mute"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* Peer tile for STACK (vertical list): fixed height to avoid overlap while scrolling */
function PeerTileStack({ socketId, stream, name }) {
  // reuse same logic as grid tile but with fixed heights and slightly different sizing
  const videoRef = useRef(null);
  const [cameraActive, setCameraActive] = useState(true);
  const [audioBlocked, setAudioBlocked] = useState(false);
  const [userMutedAudio, setUserMutedAudio] = useState(false);

  useEffect(() => {
    const videoNode = videoRef.current;
    if (!videoNode || !stream) return;

    const videoTracks = stream.getVideoTracks() || [];
    const hasActiveVideo =
      videoTracks.length > 0 && videoTracks.some((t) => t.readyState !== "ended" && t.enabled);
    setCameraActive(Boolean(hasActiveVideo));

    videoNode.srcObject = stream;

    let cancelled = false;
    const attemptPlay = async (tryMuted = false) => {
      if (cancelled) return;
      try {
        videoNode.muted = !!tryMuted || userMutedAudio;
        const p = videoNode.play();
        if (p !== undefined) {
          await p;
          if (!tryMuted) setAudioBlocked(false);
          else setAudioBlocked(true);
        }
      } catch (err) {
        if (!tryMuted) return attemptPlay(true);
        else setAudioBlocked(true);
      }
    };

    attemptPlay(false);

    const onTrackChange = () => {
      const vt = stream.getVideoTracks() || [];
      const hasVid = vt.some((t) => t.readyState !== "ended" && t.enabled);
      setCameraActive(Boolean(hasVid));
      attemptPlay(false);
    };

    stream.getTracks().forEach((track) => {
      track.onunmute = onTrackChange;
      track.onended = onTrackChange;
      track.onmute = onTrackChange;
    });

    return () => {
      cancelled = true;
      try {
        if (videoNode) {
          videoNode.pause();
          videoNode.srcObject = null;
        }
      } catch (e) {}
    };
  }, [stream, name, socketId, userMutedAudio]);

  const handleEnableAudioClick = () => {
    const videoNode = videoRef.current;
    if (!videoNode) return;
    try {
      videoNode.muted = false;
      videoNode.play().catch(() => {});
      setAudioBlocked(false);
    } catch (e) {}
  };

  const toggleLocalMuteForTile = () => {
    const videoNode = videoRef.current;
    if (!videoNode) return;
    const next = !userMutedAudio;
    setUserMutedAudio(next);
    videoNode.muted = next;
  };

  return (
    // fixed height: h-48 on small, h-56 on md. flex-shrink-0 prevents shrinking and overlapping.
    <div className="bg-black rounded-lg relative overflow-hidden w-full h-48 md:h-56 flex-shrink-0">
      {cameraActive ? (
        <>
          <video ref={videoRef} autoPlay playsInline className="w-full h-full object-cover" />
          <div className="absolute bottom-2 left-2 bg-black/60 text-white text-sm px-2 py-1 rounded-md flex items-center gap-2">
            <span className="font-medium">{name}</span>
          </div>

          <div className="absolute top-2 right-2 flex items-center gap-2">
            <button
              onClick={toggleLocalMuteForTile}
              className="px-2 py-1 rounded-md bg-black/50 text-xs text-gray-200 focus:outline-none"
              aria-pressed={userMutedAudio}
            >
              {userMutedAudio ? "Unmute" : "Mute"}
            </button>

            {audioBlocked && (
              <button
                onClick={handleEnableAudioClick}
                className="px-2 py-1 rounded-md bg-yellow-500/95 text-xs text-black font-medium focus:outline-none"
                aria-label={`Enable audio for ${name}`}
              >
                Enable audio
              </button>
            )}
          </div>
        </>
      ) : (
        <div className="w-full h-full bg-gray-900 flex items-center justify-center">
          <div className="text-center text-gray-200">
            <div className="w-12 h-12 rounded-full bg-gray-700 flex items-center justify-center mx-auto mb-2 text-xl font-bold">
              {String(name || "P").charAt(0).toUpperCase()}
            </div>
            <div className="text-sm font-medium">{name}</div>
            <div className="text-xs text-gray-400 mt-1">Camera off</div>
          </div>

          <video ref={videoRef} autoPlay playsInline className="hidden" />
          <div className="absolute top-2 right-2">
            <button
              onClick={toggleLocalMuteForTile}
              className="px-2 py-1 rounded-md bg-black/50 text-xs text-gray-200 focus:outline-none"
            >
              {userMutedAudio ? "Unmute" : "Mute"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
