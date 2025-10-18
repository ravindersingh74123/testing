import React from 'react';
import { Loader2, UserCheck, XCircle } from 'lucide-react';

export default function WaitingRoom({ userName, onCancel }) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-gray-900 to-slate-800 flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        <div className="bg-gray-800 rounded-2xl shadow-2xl p-8 text-center">
          {/* Animated loader */}
          <div className="flex justify-center mb-6">
            <div className="relative">
              <div className="w-24 h-24 rounded-full bg-blue-600/20 flex items-center justify-center">
                <UserCheck className="text-blue-500" size={48} />
              </div>
              <div className="absolute inset-0 rounded-full border-4 border-blue-600 border-t-transparent animate-spin"></div>
            </div>
          </div>

          {/* Message */}
          <h1 className="text-2xl font-bold text-white mb-2">
            Waiting for Admission
          </h1>
          <p className="text-gray-400 mb-6">
            {userName ? `Hi ${userName}, you're` : "You're"} in the waiting room. 
            The meeting host will let you in soon.
          </p>

          {/* Loading dots */}
          <div className="flex justify-center gap-2 mb-8">
            <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
            <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
            <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
          </div>

          {/* Info box */}
          <div className="bg-gray-900 rounded-lg p-4 mb-6 text-left">
            <h3 className="text-sm font-semibold text-gray-300 mb-2">While you wait:</h3>
            <ul className="text-sm text-gray-400 space-y-1">
              <li>• Make sure your camera and microphone are ready</li>
              <li>• Check your internet connection</li>
              <li>• The host will be notified of your request</li>
            </ul>
          </div>

          {/* Cancel button */}
          {onCancel && (
            <button
              onClick={onCancel}
              className="w-full py-3 px-4 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors flex items-center justify-center gap-2"
            >
              <XCircle size={20} />
              Leave Waiting Room
            </button>
          )}
        </div>

        {/* Additional info */}
        <p className="text-center text-gray-500 text-sm mt-4">
          Your request to join has been sent to the meeting host
        </p>
      </div>
    </div>
  );
}

// Denied access component
export function AccessDenied({ onGoBack }) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-gray-900 to-slate-800 flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        <div className="bg-gray-800 rounded-2xl shadow-2xl p-8 text-center">
          {/* Error icon */}
          <div className="flex justify-center mb-6">
            <div className="w-24 h-24 rounded-full bg-red-600/20 flex items-center justify-center">
              <XCircle className="text-red-500" size={48} />
            </div>
          </div>

          {/* Message */}
          <h1 className="text-2xl font-bold text-white mb-2">
            Access Denied
          </h1>
          <p className="text-gray-400 mb-8">
            The meeting host has denied your request to join this meeting.
          </p>

          {/* Action button */}
          {onGoBack && (
            <button
              onClick={onGoBack}
              className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
            >
              Go Back to Home
            </button>
          )}
        </div>
      </div>
    </div>
  );
}