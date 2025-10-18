// // src/components/Controls.jsx
// import React from "react";
// import {
//   Mic, MicOff, Video, VideoOff, ScreenShare, PhoneOff, MessageSquare
// } from "lucide-react";

// // A reusable button component for a consistent look and accessibility
// const ControlButton = ({ onClick, children, className = "", title }) => (
//   <button
//     onClick={onClick}
//     title={title}
//     className={`p-3 rounded-full transition-all duration-200 hover:scale-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-[#1E1E1E] focus-visible:ring-blue-500 ${className}`}
//   >
//     {children}
//   </button>
// );

// export default function Controls({
//   muted,
//   cameraOff,
//   isChatOpen,
//   onToggleMute,
//   onToggleCamera,
//   onScreenShare,
//   onLeave,
//   onToggleChat,
// }) {
//   return (
//     <div className="bg-[#1E1E1E] rounded-xl p-3 flex justify-center items-center gap-4 shadow-lg mx-auto">
//       <ControlButton
//         onClick={onToggleMute}
//         title={muted ? "Unmute" : "Mute"}
//         className={muted ? "bg-red-600 text-white" : "bg-gray-600 text-white hover:bg-gray-500"}
//       >
//         {muted ? <MicOff size={22} /> : <Mic size={22} />}
//       </ControlButton>

//       <ControlButton
//         onClick={onToggleCamera}
//         title={cameraOff ? "Turn Camera On" : "Turn Camera Off"}
//         className={cameraOff ? "bg-red-600 text-white" : "bg-gray-600 text-white hover:bg-gray-500"}
//       >
//         {cameraOff ? <VideoOff size={22} /> : <Video size={22} />}
//       </ControlButton>

//       <ControlButton
//         onClick={onScreenShare}
//         title="Share Screen"
//         className="bg-gray-600 text-white hover:bg-gray-500"
//       >
//         <ScreenShare size={22} />
//       </ControlButton>

//       {/* Visual Separator */}
//       <div className="h-8 w-[1px] bg-gray-600 mx-2"></div>

//       <ControlButton
//         onClick={onToggleChat}
//         title={isChatOpen ? "Hide Chat" : "Show Chat"}
//         className={isChatOpen ? "bg-blue-600 text-white" : "bg-gray-600 text-white hover:bg-gray-500"}
//       >
//         <MessageSquare size={22} />
//       </ControlButton>

//       <ControlButton
//         onClick={onLeave}
//         title="Leave Meeting"
//         className="bg-red-600 text-white hover:bg-red-700"
//       >
//         <PhoneOff size={22} />
//       </ControlButton>
//     </div>
//   );
// }













// // client/src/components/Controls.jsx
// import React from "react";
// import { Mic, MicOff, Video, VideoOff, ScreenShare, PhoneOff, MessageSquare } from "lucide-react";

// // ControlButton component
// const ControlButton = ({ onClick, children, className = "", title, disabled = false }) => (
//   <button
//     onClick={onClick}
//     title={title}
//     disabled={disabled} // Disable based on permissions
//     className={`p-3 rounded-full transition-all duration-200 hover:scale-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-[#1E1E1E] focus-visible:ring-blue-500 ${className} ${disabled ? 'opacity-50 cursor-not-allowed hover:scale-100' : ''}`}
//   >
//     {children}
//   </button>
// );

// export default function Controls({
//   muted,
//   cameraOff,
//   isChatOpen,
//   onToggleMute,
//   onToggleCamera,
//   onScreenShare,
//   onLeave,
//   onToggleChat,
//   // --- NEW PROPS ---
//   canUnmute,
//   canShareVideo,
//   canShareScreen
// }) {
//   // Correct disabled logic
//   const micDisabled = !canUnmute;          // Disabled if host locked mic
//   const videoDisabled = !canShareVideo;    // Disabled if host locked camera
//   const screenShareDisabled = !canShareScreen;

//   return (
//     <div className="bg-[#1E1E1E] rounded-xl p-3 flex justify-center items-center gap-4 shadow-lg mx-auto">
//       <ControlButton
//         onClick={onToggleMute}
//         title={micDisabled ? "Mic locked by host" : (muted ? "Unmute" : "Mute")}
//         disabled={micDisabled}
//         className={muted ? "bg-red-600 text-white" : "bg-gray-600 text-white hover:bg-gray-500"}
//       >
//         {muted ? <MicOff size={22} /> : <Mic size={22} />}
//       </ControlButton>

//       <ControlButton
//         onClick={onToggleCamera}
//         title={videoDisabled ? "Camera locked by host" : (cameraOff ? "Turn Camera On" : "Turn Camera Off")}
//         disabled={videoDisabled}
//         className={cameraOff ? "bg-red-600 text-white" : "bg-gray-600 text-white hover:bg-gray-500"}
//       >
//         {cameraOff ? <VideoOff size={22} /> : <Video size={22} />}
//       </ControlButton>

//       <ControlButton
//         onClick={onScreenShare}
//         title={screenShareDisabled ? "Screen share disabled by host" : "Share Screen"}
//         disabled={screenShareDisabled}
//         className="bg-gray-600 text-white hover:bg-gray-500"
//       >
//         <ScreenShare size={22} />
//       </ControlButton>

//       {/* Separator */}
//       <div className="h-8 w-[1px] bg-gray-600 mx-2"></div>

//       <ControlButton
//         onClick={onToggleChat}
//         title={isChatOpen ? "Hide Chat" : "Show Chat"}
//         className={isChatOpen ? "bg-blue-600 text-white" : "bg-gray-600 text-white hover:bg-gray-500"}
//       >
//         <MessageSquare size={22} />
//       </ControlButton>

//       <ControlButton
//         onClick={onLeave}
//         title="Leave Meeting"
//         className="bg-red-600 text-white hover:bg-red-700"
//       >
//         <PhoneOff size={22} />
//       </ControlButton>
//     </div>
//   );
// }





// src/components/Controls.jsx
import React from "react";
import {
  Mic,
  MicOff,
  Video,
  VideoOff,
  ScreenShare,
  PhoneOff,
  MessageSquare,
} from "lucide-react";

// Reusable button for consistent styling
const ControlButton = ({ onClick, children, className = "", title }) => (
  <button
    onClick={onClick}
    title={title}
    className={`p-3 rounded-full transition-all duration-200 hover:scale-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-[#1E1E1E] focus-visible:ring-blue-500 ${className}`}
  >
    {children}
  </button>
);

export default function Controls({
  muted,
  cameraOff,
  isChatOpen,
  onToggleMute,
  onToggleCamera,
  onScreenShare,
  onLeave,
  onToggleChat,
  isAdmin = false,
  participants = [],
}) {
  return (
    <div className="bg-[#1E1E1E] rounded-xl p-3 flex justify-center items-center gap-4 shadow-lg mx-auto">
      {/* Mute / Unmute */}
      <ControlButton
        onClick={onToggleMute}
        title={muted ? "Unmute" : "Mute"}
        className={
          muted
            ? "bg-red-600 text-white"
            : "bg-gray-600 text-white hover:bg-gray-500"
        }
      >
        {muted ? <MicOff size={22} /> : <Mic size={22} />}
      </ControlButton>

      {/* Camera On / Off */}
      <ControlButton
        onClick={onToggleCamera}
        title={cameraOff ? "Turn Camera On" : "Turn Camera Off"}
        className={
          cameraOff
            ? "bg-red-600 text-white"
            : "bg-gray-600 text-white hover:bg-gray-500"
        }
      >
        {cameraOff ? <VideoOff size={22} /> : <Video size={22} />}
      </ControlButton>

      {/* Screen Share */}
      <ControlButton
        onClick={onScreenShare}
        title="Share Screen"
        className="bg-gray-600 text-white hover:bg-gray-500"
      >
        <ScreenShare size={22} />
      </ControlButton>

      {/* Visual Separator */}
      <div className="h-8 w-[1px] bg-gray-600 mx-2"></div>

      {/* Chat Toggle */}
      <ControlButton
        onClick={onToggleChat}
        title={isChatOpen ? "Hide Chat" : "Show Chat"}
        className={
          isChatOpen
            ? "bg-blue-600 text-white"
            : "bg-gray-600 text-white hover:bg-gray-500"
        }
      >
        <MessageSquare size={22} />
      </ControlButton>

      {/* Leave Meeting */}
      <ControlButton
        onClick={onLeave}
        title="Leave Meeting"
        className="bg-red-600 text-white hover:bg-red-700"
      >
        <PhoneOff size={22} />
      </ControlButton>

      {/* Optional Admin Info */}
      {isAdmin && (
        <div className="ml-4 text-gray-300 text-sm font-medium">
          Participants: {participants.length + 1}
        </div>
      )}
    </div>
  );
}
