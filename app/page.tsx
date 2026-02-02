// app/page.tsx

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Users, PlusCircle } from 'lucide-react';

export default function Home() {
  const router = useRouter();
  const [isCreating, setIsCreating] = useState(false);

  const handleCreateSession = async () => {
    setIsCreating(true);
    try {
      const response = await fetch('/api/sessions', {
        method: 'POST',
      });
      
      if (!response.ok) {
        throw new Error('Failed to create session');
      }

      const data = await response.json();
      // Redirect to the edit link (with key)
      router.push(`/s/${data.sessionId}?key=${data.editKey}`);
    } catch (error) {
      console.error('Error creating session:', error);
      alert('Failed to create playdate session. Please try again.');
      setIsCreating(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-purple-50">
      <div className="container max-w-md mx-auto px-6 py-12">
        <div className="text-center mt-12 mb-8">
          <div className="inline-flex items-center justify-center w-20 h-20 bg-gradient-to-br from-blue-500 to-purple-600 rounded-3xl mb-4 shadow-lg">
            <Users className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-4xl font-bold text-gray-900 mb-2">PlaydateSync</h1>
          <p className="text-gray-600 text-lg">Track playdate activities together</p>
        </div>

        <div className="space-y-4 mt-16">
          <button
            onClick={handleCreateSession}
            disabled={isCreating}
            className="w-full bg-gradient-to-r from-blue-500 to-purple-600 text-white font-semibold py-4 px-6 rounded-2xl shadow-lg hover:shadow-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <div className="flex items-center justify-center gap-2">
              <PlusCircle className="w-5 h-5" />
              <span>{isCreating ? 'Creating...' : 'Start New Playdate'}</span>
            </div>
          </button>
        </div>

        <div className="mt-16 text-center">
          <p className="text-sm text-gray-500 mb-4">How it works:</p>
          <div className="space-y-3 text-left bg-white/50 rounded-2xl p-4">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0">
                <span className="text-blue-600 font-bold text-sm">1</span>
              </div>
              <p className="text-sm text-gray-700 pt-1">Start a playdate session</p>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 bg-purple-100 rounded-full flex items-center justify-center flex-shrink-0">
                <span className="text-purple-600 font-bold text-sm">2</span>
              </div>
              <p className="text-sm text-gray-700 pt-1">Share the link via text, WhatsApp, or Messenger</p>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 bg-pink-100 rounded-full flex items-center justify-center flex-shrink-0">
                <span className="text-pink-600 font-bold text-sm">3</span>
              </div>
              <p className="text-sm text-gray-700 pt-1">Track activities together in real-time</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
