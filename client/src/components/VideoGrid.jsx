// import React from "react";

// export default function VideoGrid({ localVideoRef, peers, participants, user }) {
//   // peers: { socketId: { peer: RTCPeerConnection, stream: MediaStream } }
//   // participants: { socketId, user: { name, _id } }[]

//   const peerEntries = Object.entries(peers).filter(
//     ([, p]) => p.stream && p.stream.getTracks().length > 0
//   );

//   const totalParticipants = 1 + peerEntries.length;

//   // Choose grid layout dynamically based on total participants
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
//             className="w-full h-full object-cover"
//           />
//           <div className="absolute bottom-2 left-2 bg-black/60 text-white text-sm px-2 py-1 rounded-md">
//             {user?.name || "You"} (You)
//           </div>
//         </div>

//         {/* Remote Peers */}
//         {peerEntries.map(([socketId, p]) => {
//           // find the matching participant info
//           const participant = participants.find(
//             (pt) => pt.socketId === socketId
//           );
//           const name = participant?.user?.name || "Participant";

//           return (
//             <PeerTile key={socketId} stream={p.stream} name={name} />
//           );
//         })}
//       </div>
//     </div>
//   );
// }

// function PeerTile({ stream, name }) {
//   const videoRef = React.useRef(null);

//   React.useEffect(() => {
//     if (videoRef.current && stream) {
//       videoRef.current.srcObject = stream;
//     }
//   }, [stream]);

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

// // client/src/components/VideoGrid.jsx
// import React from "react";
// import { Mic, MicOff, Video, VideoOff, ScreenShare, ShieldCheck } from 'lucide-react';

// // --- Participant Controls (Visible to Admin) ---
// function ParticipantControls({ participant, onGrantPermission }) {
//     const { permissions, socketId } = participant;
//     // Return null if permissions data isn't available yet
//     if (!permissions) {
//         return null;
//     }

//     // Toggles the specified permission type for the target socketId
//     const togglePermission = (type, currentStatus) => {
//         onGrantPermission(socketId, type, !currentStatus);
//     };

//     return (
//         <div className="absolute top-1 right-1 z-10 flex gap-1 bg-black/50 p-1 rounded-md opacity-80 hover:opacity-100 transition-opacity">
//             {/* Mic Permission Button */}
//             <button
//                 title={permissions.canUnmute ? "Disallow Unmute" : "Allow Unmute"}
//                 onClick={() => togglePermission('canUnmute', permissions.canUnmute)}
//                 className={`p-1 rounded transition-colors ${permissions.canUnmute ? 'text-green-400 hover:bg-gray-600' : 'text-red-500 hover:bg-gray-600'}`}
//             >
//                 {permissions.canUnmute ? <Mic size={14}/> : <MicOff size={14}/>}
//             </button>
//             {/* Video Permission Button */}
//             <button
//                 title={permissions.canShareVideo ? "Disallow Video" : "Allow Video"}
//                 onClick={() => togglePermission('canShareVideo', permissions.canShareVideo)}
//                 className={`p-1 rounded transition-colors ${permissions.canShareVideo ? 'text-green-400 hover:bg-gray-600' : 'text-red-500 hover:bg-gray-600'}`}
//             >
//                 {permissions.canShareVideo ? <Video size={14}/> : <VideoOff size={14}/>}
//             </button>
//             {/* Screen Share Permission Button */}
//             <button
//                 title={permissions.canShareScreen ? "Disallow Screen Share" : "Allow Screen Share"}
//                 onClick={() => togglePermission('canShareScreen', permissions.canShareScreen)}
//                 className={`p-1 rounded transition-colors ${permissions.canShareScreen ? 'text-green-400 hover:bg-gray-600' : 'text-red-500 hover:bg-gray-600'}`}
//             >
//                 <ScreenShare size={14}/>
//             </button>
//         </div>
//     );
// }

// // --- Individual Peer Video Tile ---
// function PeerTile({ participant, stream, isAdmin, onGrantPermission }) {
//   const videoRef = React.useRef(null);

//   // Effect to attach the stream to the video element
//   React.useEffect(() => {
//     const videoNode = videoRef.current;
//     let playPromise = null;

//     if (videoNode && stream) {
//       console.log(`Attaching stream for ${participant?.user?.name} (${participant?.socketId})`);
//       videoNode.srcObject = stream;

//       // Attempt to play the video, handling browser autoplay policies
//       playPromise = videoNode.play();
//       if (playPromise !== undefined) {
//         playPromise.catch(error => {
//           // Autoplay was prevented.
//           // This is common, user interaction (like a click) might be needed.
//           // Or, remote videos might need to be unmuted manually by the user.
//           console.warn(`Video play() failed for ${participant?.socketId}: ${error.message}`);
//           // You could show an overlay on the video asking the user to click to play/unmute
//         });
//       }
//     } else {
//       console.warn(`No stream to attach for ${participant?.user?.name} (${participant?.socketId})`);
//        if (videoNode) {
//            videoNode.srcObject = null; // Clear srcObject if stream is null
//        }
//     }

//     // Cleanup: Remove stream source when component unmounts or stream/participant changes
//     return () => {
//       if (videoNode) {
//         // Pause the video and clear the source
//         if (playPromise !== undefined) {
//             playPromise.then(() => videoNode.pause()).catch(() => {}); // Stop playback
//         }
//         videoNode.srcObject = null;
//       }
//     };
//   // Re-run this effect if the stream object itself changes,
//   // or if the participant identifier changes (ensuring correct stream is attached)
//   }, [stream, participant?.socketId]);

//   const peerName = participant?.user?.name || "Participant"; // Fallback name
//   const isPeerAdmin = participant?.isAdmin;

//   return (
//     <div className="bg-black rounded-lg relative overflow-hidden w-full aspect-video shadow-md">
//       <video
//         ref={videoRef}
//         autoPlay // Required to play automatically when stream is attached
//         playsInline // Important for mobile browsers
//         className="w-full h-full object-cover"
//         // Remote streams should NOT be muted by default, or you can't hear them.
//         // User must mute their own audio output if they don't want to hear.
//         muted={false}
//       />
//       {/* Name Tag */}
//       <div className="absolute bottom-2 left-2 bg-black/60 text-white text-sm px-2 py-1 rounded-md flex items-center gap-1 z-10">
//           {peerName}
//           {/* Show host icon if this peer is the admin */}
//           {isPeerAdmin && <ShieldCheck size={14} className="text-blue-400" title="Host"/>}
//       </div>
//       {/* Admin Controls Overlay */}
//       {isAdmin && !isPeerAdmin && participant && (
//           <ParticipantControls participant={participant} onGrantPermission={onGrantPermission} />
//       )}
//     </div>
//   );
// }

// // --- Main Video Grid Component ---
// export default function VideoGrid({ localVideoRef, peers, user, participants, isAdmin, onGrantPermission, mySocketId }) {

//   // Create a memoized list of remote participants with their stream data
//   const participantEntries = React.useMemo(() =>
//     Object.entries(participants ?? {}) // Use empty object as fallback
//       .filter(([socketId]) => socketId !== mySocketId) // Exclude self
//       .map(([socketId, participantData]) => ({
//           socketId,
//           participantData, // { user, isAdmin, permissions }
//           stream: peers[socketId]?.stream // Get the stream from the peers state
//       })), [participants, peers, mySocketId]); // Dependencies

//   const totalVisibleParticipants = 1 + participantEntries.length; // Self + remote

//   // Dynamically adjust grid columns
//   const getGridClass = (count) => {
//     if (count <= 1) return "grid-cols-1";
//     if (count <= 2) return "grid-cols-1 md:grid-cols-2";
//     if (count <= 4) return "grid-cols-2";
//     if (count <= 6) return "grid-cols-3";
//     if (count <= 9) return "grid-cols-3";
//     return "grid-cols-4";
//   };

//   return (
//     // Flex-1 allows the grid to take available space, overflow-auto handles scrolling if grid exceeds height
//     <div className="flex-1 overflow-auto bg-[#1E1E1E] rounded-xl p-4">
//       {/* Grid container */}
//       <div className={`grid ${getGridClass(totalVisibleParticipants)} gap-4 place-items-center`}>

//         {/* Local User's Video Tile */}
//         <div className="bg-black rounded-lg relative overflow-hidden w-full aspect-video shadow-md">
//           <video
//             ref={localVideoRef} // This ref is set by Meeting.jsx's useEffect [Media]
//             autoPlay
//             muted // Mute self video locally to prevent echo
//             playsInline
//             className="w-full h-full object-cover scale-x-[-1]" // Mirror effect
//           />
//           <div className="absolute bottom-2 left-2 bg-black/60 text-white text-sm px-2 py-1 rounded-md flex items-center gap-1 z-10">
//             {user?.name || "You"} (You)
//             {isAdmin && <ShieldCheck size={14} className="text-blue-400" title="Host"/>}
//           </div>
//         </div>

//         {/* Remote Peers' Video Tiles */}
//         {participantEntries.map(({ socketId, participantData, stream }) => (
//           <PeerTile
//               key={socketId}
//               participant={participantData}
//               stream={stream} // This might be undefined initially, PeerTile handles it
//               isAdmin={isAdmin}
//               onGrantPermission={onGrantPermission}
//           />
//         ))}
//       </div>
//     </div>
//   );
// }

// // client/src/components/VideoGrid.jsx
// import React from "react";
// import {
//   Mic,
//   MicOff,
//   Video,
//   VideoOff,
//   ScreenShare,
//   ShieldCheck,
// } from "lucide-react";

// // --- Participant Controls (Visible to Admin) ---
// // This component is NOT used by default in the PeerTile below
// // because your Meeting.jsx does not pass onGrantPermission to VideoGrid.
// // This is here for completeness if you decide to add it back.
// function ParticipantControls({ participant, onGrantPermission }) {
//   const { permissions, socketId } = participant;
//   if (!permissions) {
//     return null;
//   }
//   const togglePermission = (type, currentStatus) => {
//     onGrantPermission(socketId, type, !currentStatus);
//   };
//   return (
//     <div className="absolute top-1 right-1 z-10 flex gap-1 bg-black/50 p-1 rounded-md opacity-80 hover:opacity-100 transition-opacity">
//       <button
//         title={permissions.canUnmute ? "Disallow Unmute" : "Allow Unmute"}
//         onClick={() => togglePermission("canUnmute", permissions.canUnmute)}
//         className={`p-1 rounded transition-colors ${
//           permissions.canUnmute
//             ? "text-green-400 hover:bg-gray-600"
//             : "text-red-500 hover:bg-gray-600"
//         }`}
//       >
//         {permissions.canUnmute ? <Mic size={14} /> : <MicOff size={14} />}
//       </button>
//       <button
//         title={permissions.canVideo ? "Disallow Video" : "Allow Video"}
//         onClick={() => togglePermission("canVideo", permissions.canVideo)}
//         className={`p-1 rounded transition-colors ${
//           permissions.canShareVideo
//             ? "text-green-400 hover:bg-gray-600"
//             : "text-red-500 hover:bg-gray-600"
//         }`}
//       >
//         {permissions.canShareVideo ? (
//           <Video size={14} />
//         ) : (
//           <VideoOff size={14} />
//         )}
//       </button>
//       <button
//         title={
//           permissions.canShareScreen
//             ? "Disallow Screen Share"
//             : "Allow Screen Share"
//         }
//         onClick={() =>
//           togglePermission("canShareScreen", permissions.canShareScreen)
//         }
//         className={`p-1 rounded transition-colors ${
//           permissions.canShareScreen
//             ? "text-green-400 hover:bg-gray-600"
//             : "text-red-500 hover:bg-gray-600"
//         }`}
//       >
//         <ScreenShare size={14} />
//       </button>
//     </div>
//   );
// }

// // --- Individual Peer Video Tile ---
// // This tile renders a peer based on the `peerData` object from the `peers` state
// function PeerTile({
//   socketId,
//   peerData,
//   isAdmin,
//   onGrantPermission,
//   participants,
// }) {
//   const videoRef = React.useRef(null);
//   // `peerData` from Meeting.jsx `peers` state is { pc, stream, user }
//   const { stream, user } = peerData; // Get user from peerData

//   // Find the full participant data (which has permissions) from the other prop
//   // Note: Your `participants` object from Meeting.jsx *only* has { socketId, user }
//   // It does NOT have permissions. Your `AdminPanel` logic is different.
//   // We will use the `user` from the `peerData` object.
//   const peerName = peerData.user?.name || "Participant";

//   // To check if a peer is admin, we'd need that info in the `participants` or `peers` object.
//   // Your `participants` object `{ socketId: { user } }` doesn't have it.
//   // We'll assume only the main user can be admin for now.
//   const isPeerAdmin = false;
//   const peerPermissions = peerData.permissions || { canVideo: true };
//   // Effect to attach the stream to the video element
//   React.useEffect(() => {
//     const videoNode = videoRef.current;
//     if (!videoNode) return;

//     // Attach stream only if peer can share video
//     if (stream && peerPermissions.canVideo) {
//       videoNode.srcObject = stream;
//       const playPromise = videoNode.play();
//       if (playPromise !== undefined) {
//         playPromise.catch((err) => {
//           console.warn(`Video play() failed for ${socketId}: ${err.message}`);
//         });
//       }
//     } else {
//       videoNode.srcObject = null; // stop video when blocked
//       videoNode.pause();
//     }
//   }, [stream, socketId, peerPermissions.canVideo]);

//   return (
//     <div className="bg-black rounded-lg relative overflow-hidden w-full aspect-video shadow-md">
//       <video
//         ref={videoRef}
//         autoPlay
//         muted={false} // remote peers should not be muted
//         playsInline
//         className="w-full h-full object-cover"
//         style={{ display: peerPermissions.canVideo ? "block" : "none" }}
//       />

//       {/* Name Tag */}
//       <div className="absolute bottom-2 left-2 bg-black/60 text-white text-sm px-2 py-1 rounded-md flex items-center gap-1 z-10">
//         {peerName}
//         {isPeerAdmin && (
//           <ShieldCheck size={14} className="text-blue-400" title="Host" />
//         )}
//       </div>

//       {/* Admin controls from your *new* logic (AdminPanel) are not here.
//           If you want controls on tiles, you must pass `onGrantPermission`
//           and the *full* participant data (with permissions) to this tile.
//       */}
//       {/* {isAdmin && !isPeerAdmin && participant && (
//           <ParticipantControls participant={participant} onGrantPermission={onGrantPermission} />
//       )} */}
//     </div>
//   );
// }

// // --- Main Video Grid Component ---
// export default function VideoGrid({
//   localVideoRef,
//   peers, // This is an OBJECT: { socketId: { pc, stream, user } }
//   user,
//   participants, // This is an OBJECT: { socketId: { user, ... } }
//   mySocketId, // Your own socket.id
//   isAdmin,
//   onGrantPermission,
// }) {
//   // **FIXED:** Iterate over the `peers` object, as it contains the `stream`
//   const peerEntries = React.useMemo(
//     () =>
//       Object.entries(peers ?? {})
//         .filter(
//           ([socketId]) => socketId !== mySocketId && peers[socketId].stream
//         ) // Exclude self & ensure stream exists
//         .map(([socketId, peerData]) => ({
//           socketId,
//           ...peerData,
//           permissions: {
//             canVideo: participants[socketId]?.permissions?.canVideo ?? true,
//             canUnmute: participants[socketId]?.permissions?.canUnmute ?? true,
//             canScreenShare:
//               participants[socketId]?.permissions?.canScreenShare ?? true,
//           },
//         })),

//     [peers, mySocketId]
//   );

//   const totalVisibleParticipants = 1 + peerEntries.length; // Self + remote

//   // Dynamically adjust grid columns
//   const getGridClass = (count) => {
//     if (count <= 1) return "grid-cols-1";
//     if (count <= 2) return "grid-cols-1 md:grid-cols-2";
//     if (count <= 4) return "grid-cols-2";
//     if (count <= 6) return "grid-cols-3";
//     if (count <= 9) return "grid-cols-3";
//     return "grid-cols-4";
//   };
//   const localPermissions = participants[mySocketId]?.permissions || {
//     canVideo: true,
//     canUnmute: true,
//     canScreenShare: true,
//   };

//   return (
//     <div className="flex-1 overflow-auto bg-[#1E1E1E] rounded-xl p-4">
//       <div
//         className={`grid ${getGridClass(
//           totalVisibleParticipants
//         )} gap-4 place-items-center`}
//       >
//         {/* Local User's Video Tile */}
//         <div className="bg-black rounded-lg relative overflow-hidden w-full aspect-video shadow-md">
//           <video
//             ref={localVideoRef}
//             autoPlay
//             muted
//             playsInline
//             className="w-full h-full object-cover scale-x-[-1]"
//             style={{ display: localPermissions.canVideo ? "block" : "none" }}
//           />

//           <div className="absolute bottom-2 left-2 bg-black/60 text-white text-sm px-2 py-1 rounded-md flex items-center gap-1 z-10">
//             {user?.name || "You"} (You)
//             {isAdmin && (
//               <ShieldCheck size={14} className="text-blue-400" title="Host" />
//             )}
//           </div>
//         </div>

//         {/* Remote Peers' Video Tiles */}
//         {peerEntries.map((peerData) => (
//           <PeerTile
//             key={peerData.socketId}
//             socketId={peerData.socketId}
//             peerData={peerData} // Pass the full peer object { pc, stream, user }
//             participants={participants} // Pass participants map
//             isAdmin={isAdmin}
//             onGrantPermission={onGrantPermission}
//           />
//         ))}
//       </div>
//     </div>
//   );
// }

import React from "react";

export default function VideoGrid({
  localVideoRef,
  peers,
  participants,
  user,
  muted,
  cameraOff,
}) {
  // peers: { socketId: { pc: RTCPeerConnection, stream: MediaStream, user } }
  // participants: { socketId, user: { name, id } }[]

  const peerEntries = Object.entries(peers).filter(
    ([, p]) => p.stream && p.stream.getTracks().length > 0
  );

  const totalParticipants = 1 + peerEntries.length;

  // Dynamic grid layout based on participants
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
            className={`w-full h-full object-cover ${
              cameraOff ? "opacity-50" : ""
            }`}
          />
          <div className="absolute bottom-2 left-2 bg-black/60 text-white text-sm px-2 py-1 rounded-md flex items-center gap-1">
            {user?.name || "You"} (You)
            {muted && <span className="text-red-500 font-bold">●</span>}
          </div>
        </div>

        {/* Remote Peers */}
        {peerEntries.map(([socketId, p]) => {
          const name = p.user?.name || "Participant";
          return <PeerTile key={socketId} stream={p.stream} name={name} />;
        })}
      </div>
    </div>
  );
}

function PeerTile({ stream, name }) {
  const videoRef = React.useRef(null);

  React.useEffect(() => {
    const videoNode = videoRef.current;
    if (!videoNode || !stream) return;

    console.log(
      `📺 [VIDEO] Attaching stream to peer tile:`,
      stream.getTracks().map((t) => t.kind)
    );
    videoNode.srcObject = stream;

    // Force play
    const playPromise = videoNode.play();
    if (playPromise !== undefined) {
      playPromise
        .then(() => {
          console.log(`✅ [VIDEO] Video playing for ${name}`);
        })
        .catch((err) => {
          console.warn(`⚠️ [VIDEO] Play failed for ${name}:`, err);
          // Retry play
          setTimeout(() => {
            videoNode.play().catch(() => {});
          }, 100);
        });
    }

    return () => {
      if (videoNode) {
        videoNode.srcObject = null;
      }
    };
  }, [stream, name]);

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
