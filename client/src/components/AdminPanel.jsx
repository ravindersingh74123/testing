// // client/src/components/AdminPanel.jsx
// import React, { useState, useEffect } from "react";
// import { 
//   Shield, 
//   Mic, 
//   MicOff, 
//   Video, 
//   VideoOff, 
//   MonitorUp, 
//   UserCheck, 
//   UserX,
//   ChevronDown,
//   ChevronUp
// } from "lucide-react";

// export default function AdminPanel({ 
//   isAdmin, 
//   participants, 
//   pendingUsers,
//   onGrantPermission,
//   onRevokePermission,
//   onApproveUser,
//   onRejectUser,
//   currentUserId 
// }) {
//   const [isExpanded, setIsExpanded] = useState(true);
//   const [activeTab, setActiveTab] = useState("participants"); // "participants" or "pending"

//   if (!isAdmin) return null;

//   return (
//     <div className="bg-gradient-to-b from-gray-800 to-gray-900 border border-gray-700/50 rounded-xl shadow-2xl overflow-hidden">
//       {/* Header */}
//       <div 
//         className="flex items-center justify-between p-4 bg-gradient-to-r from-blue-600 to-blue-700 cursor-pointer hover:from-blue-700 hover:to-blue-800 transition-all duration-200"
//         onClick={() => setIsExpanded(!isExpanded)}
//       >
//         <div className="flex items-center gap-3">
//           <div className="p-2 bg-white/20 rounded-lg backdrop-blur-sm">
//             <Shield size={20} className="text-white" />
//           </div>
//           <div>
//             <h3 className="text-white font-semibold text-lg">Admin Controls</h3>
//             <p className="text-blue-100 text-xs">Manage meeting permissions</p>
//           </div>
//         </div>
//         <button className="p-2 hover:bg-white/10 rounded-lg transition-colors">
//           {isExpanded ? (
//             <ChevronUp size={20} className="text-white" />
//           ) : (
//             <ChevronDown size={20} className="text-white" />
//           )}
//         </button>
//       </div>

//       {/* Content */}
//       {isExpanded && (
//         <div className="p-4">
//           {/* Tabs */}
//           <div className="flex gap-2 mb-4">
//             <button
//               onClick={() => setActiveTab("participants")}
//               className={`flex-1 px-4 py-2 rounded-lg font-medium transition-all duration-200 ${
//                 activeTab === "participants"
//                   ? "bg-blue-600 text-white shadow-lg"
//                   : "bg-gray-700/50 text-gray-300 hover:bg-gray-700"
//               }`}
//             >
//               Participants ({participants.length})
//             </button>
//             <button
//               onClick={() => setActiveTab("pending")}
//               className={`flex-1 px-4 py-2 rounded-lg font-medium transition-all duration-200 relative ${
//                 activeTab === "pending"
//                   ? "bg-blue-600 text-white shadow-lg"
//                   : "bg-gray-700/50 text-gray-300 hover:bg-gray-700"
//               }`}
//             >
//               Pending ({pendingUsers?.length || 0})
//               {pendingUsers?.length > 0 && (
//                 <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 rounded-full text-xs flex items-center justify-center animate-pulse">
//                   {pendingUsers.length}
//                 </span>
//               )}
//             </button>
//           </div>

//           {/* Participants Tab */}
//           {activeTab === "participants" && (
//             <div className="space-y-2 max-h-96 overflow-y-auto custom-scrollbar">
//               {participants.length === 0 ? (
//                 <div className="text-center py-8 text-gray-400">
//                   <UserCheck size={48} className="mx-auto mb-3 opacity-50" />
//                   <p>No participants yet</p>
//                 </div>
//               ) : (
//                 participants.map((participant) => (
//                   <ParticipantCard
//                     key={participant.socketId}
//                     participant={participant}
//                     isCurrentUser={participant.user?._id === currentUserId}
//                     onGrantPermission={onGrantPermission}
//                     onRevokePermission={onRevokePermission}
//                   />
//                 ))
//               )}
//             </div>
//           )}

//           {/* Pending Users Tab */}
//           {activeTab === "pending" && (
//             <div className="space-y-2 max-h-96 overflow-y-auto custom-scrollbar">
//               {(!pendingUsers || pendingUsers.length === 0) ? (
//                 <div className="text-center py-8 text-gray-400">
//                   <UserCheck size={48} className="mx-auto mb-3 opacity-50" />
//                   <p>No pending requests</p>
//                 </div>
//               ) : (
//                 pendingUsers.map((user) => (
//                   <PendingUserCard
//                     key={user.socketId}
//                     user={user}
//                     onApprove={onApproveUser}
//                     onReject={onRejectUser}
//                   />
//                 ))
//               )}
//             </div>
//           )}
//         </div>
//       )}

//       {/* Custom Scrollbar Styles */}
//       <style>{`
//         .custom-scrollbar::-webkit-scrollbar {
//           width: 8px;
//         }
//         .custom-scrollbar::-webkit-scrollbar-track {
//           background: rgba(0, 0, 0, 0.2);
//           border-radius: 4px;
//         }
//         .custom-scrollbar::-webkit-scrollbar-thumb {
//           background: rgba(59, 130, 246, 0.5);
//           border-radius: 4px;
//         }
//         .custom-scrollbar::-webkit-scrollbar-thumb:hover {
//           background: rgba(59, 130, 246, 0.7);
//         }
//       `}</style>
//     </div>
//   );
// }

// // Participant Card Component
// function ParticipantCard({ participant, isCurrentUser, onGrantPermission, onRevokePermission }) {
//   const permissions = participant.permissions || {
//     canUnmute: true,
//     canToggleVideo: true,
//     canShareScreen: false
//   };

//   const handleToggle = (permission) => {
//     const currentValue = permissions[permission];
//     if (currentValue) {
//       onRevokePermission(participant.socketId, permission);
//     } else {
//       onGrantPermission(participant.socketId, permission);
//     }
//   };

//   return (
//     <div className={`bg-gray-800/50 rounded-lg p-3 border border-gray-700/50 hover:border-gray-600 transition-all duration-200 ${
//       isCurrentUser ? "ring-2 ring-blue-500/50" : ""
//     }`}>
//       {/* User Info */}
//       <div className="flex items-center justify-between mb-3">
//         <div className="flex items-center gap-3">
//           <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-semibold">
//             {participant.user?.name?.charAt(0)?.toUpperCase() || "?"}
//           </div>
//           <div>
//             <p className="text-white font-medium">
//               {participant.user?.name || "Unknown"}
//               {isCurrentUser && (
//                 <span className="ml-2 text-xs bg-blue-600 px-2 py-0.5 rounded">You</span>
//               )}
//             </p>
//             <p className="text-gray-400 text-xs">
//               {participant.user?.email || "No email"}
//             </p>
//           </div>
//         </div>
//       </div>

//       {/* Permission Controls */}
//       {!isCurrentUser && (
//         <div className="grid grid-cols-3 gap-2">
//           {/* Audio Permission */}
//           <PermissionButton
//             icon={permissions.canUnmute ? Mic : MicOff}
//             label="Audio"
//             isGranted={permissions.canUnmute}
//             onClick={() => handleToggle("canUnmute")}
//           />

//           {/* Video Permission */}
//           <PermissionButton
//             icon={permissions.canToggleVideo ? Video : VideoOff}
//             label="Video"
//             isGranted={permissions.canToggleVideo}
//             onClick={() => handleToggle("canToggleVideo")}
//           />

//           {/* Screen Share Permission */}
//           <PermissionButton
//             icon={MonitorUp}
//             label="Screen"
//             isGranted={permissions.canShareScreen}
//             onClick={() => handleToggle("canShareScreen")}
//           />
//         </div>
//       )}
//     </div>
//   );
// }

// // Permission Button Component
// function PermissionButton({ icon: Icon, label, isGranted, onClick }) {
//   return (
//     <button
//       onClick={onClick}
//       className={`flex flex-col items-center gap-1 p-2 rounded-lg transition-all duration-200 ${
//         isGranted
//           ? "bg-green-600/20 border border-green-500/50 hover:bg-green-600/30"
//           : "bg-red-600/20 border border-red-500/50 hover:bg-red-600/30"
//       }`}
//       title={`${isGranted ? "Revoke" : "Grant"} ${label} permission`}
//     >
//       <Icon 
//         size={18} 
//         className={isGranted ? "text-green-400" : "text-red-400"} 
//       />
//       <span className={`text-xs font-medium ${
//         isGranted ? "text-green-300" : "text-red-300"
//       }`}>
//         {label}
//       </span>
//     </button>
//   );
// }

// // Pending User Card Component
// function PendingUserCard({ user, onApprove, onReject }) {
//   return (
//     <div className="bg-gray-800/50 rounded-lg p-3 border border-yellow-500/30 hover:border-yellow-500/50 transition-all duration-200">
//       {/* User Info */}
//       <div className="flex items-center justify-between mb-3">
//         <div className="flex items-center gap-3">
//           <div className="w-10 h-10 rounded-full bg-gradient-to-br from-yellow-500 to-orange-600 flex items-center justify-center text-white font-semibold">
//             {user.user?.name?.charAt(0)?.toUpperCase() || "?"}
//           </div>
//           <div>
//             <p className="text-white font-medium">{user.user?.name || "Unknown"}</p>
//             <p className="text-gray-400 text-xs">{user.user?.email || "No email"}</p>
//           </div>
//         </div>
//         <span className="px-2 py-1 bg-yellow-600/20 text-yellow-300 text-xs rounded-full">
//           Waiting
//         </span>
//       </div>

//       {/* Action Buttons */}
//       <div className="flex gap-2">
//         <button
//           onClick={() => onApprove(user.socketId)}
//           className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium transition-all duration-200 transform hover:scale-105"
//         >
//           <UserCheck size={16} />
//           Approve
//         </button>
//         <button
//           onClick={() => onReject(user.socketId)}
//           className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium transition-all duration-200 transform hover:scale-105"
//         >
//           <UserX size={16} />
//           Reject
//         </button>
//       </div>
//     </div>
//   );
// }



import React, { useState } from 'react';
import { 
  Users, Settings, Shield, Mic, MicOff, Video, VideoOff, 
  Monitor, UserX, CheckCircle, XCircle, Crown, MoreVertical 
} from 'lucide-react';

export default function AdminPanel({ 
  participants = [], 
  waitingRoom = [],
  isAdmin,
  onAdmitUser,
  onDenyUser,
  onUpdatePermissions,
  onRemoveParticipant,
  onUpdateSettings,
  currentSettings = {}
}) {
  const [activeTab, setActiveTab] = useState('participants');
  const [showSettings, setShowSettings] = useState(false);
  const [openMenu, setOpenMenu] = useState(null);

  // Local settings state
  const [settings, setSettings] = useState({
    requireAdmission: currentSettings.requireAdmission || false,
    muteMicOnEntry: currentSettings.muteMicOnEntry || false,
    disableVideoOnEntry: currentSettings.disableVideoOnEntry || false,
    allowScreenShare: currentSettings.allowScreenShare || true,
  });

  if (!isAdmin) {
    return null;
  }

  const handleSettingsUpdate = () => {
    onUpdateSettings(settings);
    setShowSettings(false);
  };

  const togglePermission = (userId, permission) => {
    const participant = participants.find(p => p.user._id === userId || p.user.id === userId);
    if (participant) {
      onUpdatePermissions(userId, {
        ...participant.permissions,
        [permission]: !participant.permissions[permission]
      });
    }
  };

  return (
    <div className="h-full flex flex-col bg-[#1E1E1E] text-white">
      {/* Header */}
      <div className="flex-shrink-0 p-4 border-b border-gray-700">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Shield className="text-yellow-500" size={24} />
            <h2 className="text-xl font-bold">Admin Panel</h2>
          </div>
          <button
            onClick={() => setShowSettings(!showSettings)}
            className="p-2 hover:bg-gray-700 rounded-lg transition-colors"
            title="Meeting Settings"
          >
            <Settings size={20} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-2">
          <button
            onClick={() => setActiveTab('participants')}
            className={`flex-1 px-4 py-2 rounded-lg transition-colors ${
              activeTab === 'participants'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
          >
            <div className="flex items-center justify-center gap-2">
              <Users size={18} />
              <span>Participants ({participants.length})</span>
            </div>
          </button>
          <button
            onClick={() => setActiveTab('waiting')}
            className={`flex-1 px-4 py-2 rounded-lg transition-colors ${
              activeTab === 'waiting'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
          >
            <div className="flex items-center justify-center gap-2">
              <Shield size={18} />
              <span>Waiting ({waitingRoom.length})</span>
            </div>
          </button>
        </div>
      </div>

      {/* Settings Panel */}
      {showSettings && (
        <div className="flex-shrink-0 p-4 bg-gray-800 border-b border-gray-700">
          <h3 className="font-semibold mb-3 text-lg">Meeting Settings</h3>
          <div className="space-y-3">
            <label className="flex items-center justify-between cursor-pointer">
              <span className="text-sm">Require Admission</span>
              <input
                type="checkbox"
                checked={settings.requireAdmission}
                onChange={(e) => setSettings({...settings, requireAdmission: e.target.checked})}
                className="w-5 h-5 rounded"
              />
            </label>
            <label className="flex items-center justify-between cursor-pointer">
              <span className="text-sm">Mute Mic on Entry</span>
              <input
                type="checkbox"
                checked={settings.muteMicOnEntry}
                onChange={(e) => setSettings({...settings, muteMicOnEntry: e.target.checked})}
                className="w-5 h-5 rounded"
              />
            </label>
            <label className="flex items-center justify-between cursor-pointer">
              <span className="text-sm">Disable Video on Entry</span>
              <input
                type="checkbox"
                checked={settings.disableVideoOnEntry}
                onChange={(e) => setSettings({...settings, disableVideoOnEntry: e.target.checked})}
                className="w-5 h-5 rounded"
              />
            </label>
            <label className="flex items-center justify-between cursor-pointer">
              <span className="text-sm">Allow Screen Share</span>
              <input
                type="checkbox"
                checked={settings.allowScreenShare}
                onChange={(e) => setSettings({...settings, allowScreenShare: e.target.checked})}
                className="w-5 h-5 rounded"
              />
            </label>
          </div>
          <button
            onClick={handleSettingsUpdate}
            className="w-full mt-4 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
          >
            Save Settings
          </button>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {activeTab === 'participants' && (
          <div className="space-y-2">
            {participants.length === 0 ? (
              <div className="text-center text-gray-400 py-8">
                No participants yet
              </div>
            ) : (
              participants.map((participant) => (
                <ParticipantCard
                  key={participant.socketId}
                  participant={participant}
                  isOpen={openMenu === participant.socketId}
                  onToggleMenu={() => setOpenMenu(openMenu === participant.socketId ? null : participant.socketId)}
                  onTogglePermission={togglePermission}
                  onRemove={() => {
                    onRemoveParticipant(participant.user._id || participant.user.id);
                    setOpenMenu(null);
                  }}
                />
              ))
            )}
          </div>
        )}

        {activeTab === 'waiting' && (
          <div className="space-y-2">
            {waitingRoom.length === 0 ? (
              <div className="text-center text-gray-400 py-8">
                No one waiting
              </div>
            ) : (
              waitingRoom.map((user) => (
                <WaitingUserCard
                  key={user.socketId}
                  user={user}
                  onAdmit={() => onAdmitUser(user.userId, user.socketId)}
                  onDeny={() => onDenyUser(user.userId, user.socketId)}
                />
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function ParticipantCard({ participant, isOpen, onToggleMenu, onTogglePermission, onRemove }) {
  const userId = participant.user._id || participant.user.id;
  const permissions = participant.permissions || {};

  return (
    <div className="bg-gray-800 rounded-lg p-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3 flex-1">
          <div className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center font-semibold">
            {participant.user.name?.[0]?.toUpperCase() || 'U'}
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <span className="font-medium">{participant.user.name}</span>
              {participant.isAdmin && <Crown size={16} className="text-yellow-500" />}
            </div>
            <div className="flex gap-2 mt-1">
              {permissions.canUnmute ? (
                <Mic size={14} className="text-green-500" />
              ) : (
                <MicOff size={14} className="text-red-500" />
              )}
              {permissions.canVideo ? (
                <Video size={14} className="text-green-500" />
              ) : (
                <VideoOff size={14} className="text-red-500" />
              )}
              {permissions.canScreenShare && (
                <Monitor size={14} className="text-green-500" />
              )}
            </div>
          </div>
        </div>
        
        {!participant.isAdmin && (
          <div className="relative">
            <button
              onClick={onToggleMenu}
              className="p-2 hover:bg-gray-700 rounded-lg transition-colors"
            >
              <MoreVertical size={20} />
            </button>
            
            {isOpen && (
              <div className="absolute right-0 mt-2 w-56 bg-gray-900 rounded-lg shadow-xl border border-gray-700 z-50">
                <div className="p-2 space-y-1">
                  <button
                    onClick={() => onTogglePermission(userId, 'canUnmute')}
                    className="w-full px-3 py-2 text-left hover:bg-gray-700 rounded flex items-center gap-2"
                  >
                    {permissions.canUnmute ? <MicOff size={16} /> : <Mic size={16} />}
                    <span className="text-sm">
                      {permissions.canUnmute ? 'Disable Mic' : 'Enable Mic'}
                    </span>
                  </button>
                  <button
                    onClick={() => onTogglePermission(userId, 'canVideo')}
                    className="w-full px-3 py-2 text-left hover:bg-gray-700 rounded flex items-center gap-2"
                  >
                    {permissions.canVideo ? <VideoOff size={16} /> : <Video size={16} />}
                    <span className="text-sm">
                      {permissions.canVideo ? 'Disable Video' : 'Enable Video'}
                    </span>
                  </button>
                  <button
                    onClick={() => onTogglePermission(userId, 'canScreenShare')}
                    className="w-full px-3 py-2 text-left hover:bg-gray-700 rounded flex items-center gap-2"
                  >
                    <Monitor size={16} />
                    <span className="text-sm">
                      {permissions.canScreenShare ? 'Disable Screen Share' : 'Enable Screen Share'}
                    </span>
                  </button>
                  <div className="border-t border-gray-700 my-1"></div>
                  <button
                    onClick={onRemove}
                    className="w-full px-3 py-2 text-left hover:bg-red-600 rounded flex items-center gap-2 text-red-400 hover:text-white"
                  >
                    <UserX size={16} />
                    <span className="text-sm">Remove from Meeting</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function WaitingUserCard({ user, onAdmit, onDeny }) {
  return (
    <div className="bg-gray-800 rounded-lg p-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-yellow-600 flex items-center justify-center font-semibold">
            {user.name?.[0]?.toUpperCase() || 'U'}
          </div>
          <span className="font-medium">{user.name}</span>
        </div>
        <div className="flex gap-2">
          <button
            onClick={onAdmit}
            className="p-2 bg-green-600 hover:bg-green-700 rounded-lg transition-colors"
            title="Admit"
          >
            <CheckCircle size={20} />
          </button>
          <button
            onClick={onDeny}
            className="p-2 bg-red-600 hover:bg-red-700 rounded-lg transition-colors"
            title="Deny"
          >
            <XCircle size={20} />
          </button>
        </div>
      </div>
    </div>
  );
}