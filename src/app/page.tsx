
"use client";

import { useAuth, SignInScreen } from '@/contexts/AuthContext';
import { VideoScriptAI } from '@/components/VideoScript/VideoScriptAI';


function VideoScriptAIPageContent() {
  return <VideoScriptAI />;
}

export default function Page() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-background">
        <p className="text-foreground">Loading...</p>
      </div>
    );
  }
  
  if (!user) {
    return <SignInScreen />;
  }

  return <VideoScriptAIPageContent />;
}

  