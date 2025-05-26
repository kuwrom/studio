
"use client";

import { useState, useEffect, useRef, FormEvent, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Send, Sparkles, ArrowLeft, ArrowRight, Loader2 } from 'lucide-react';
import { summarizeVideoIdea } from '@/ai/flows/summarize-video-idea';
import { generateVideoScript } from '@/ai/flows/generate-video-script';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import AudioWaveVisualizer from '@/components/ui/AudioWaveVisualizer';

type View = 'input' | 'script';

declare global {
  interface Window {
    SpeechRecognition: typeof SpeechRecognition;
    webkitSpeechRecognition: typeof SpeechRecognition;
    webkitAudioContext: typeof AudioContext;
  }
}

export default function VideoScriptAIPage() {
  const [currentView, setCurrentView] = useState<View>('input');
  const [videoIdeaInput, setVideoIdeaInput] = useState('');
  const [fullConversationText, setFullConversationText] = useState('');
  const [currentSummary, setCurrentSummary] = useState('');
  const [generatedScript, setGeneratedScript] = useState('');
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [isActivelyListening, setIsActivelyListening] = useState(false);
  const [isGeneratingScript, setIsGeneratingScript] = useState(false);
  const [isMicButtonPressed, setIsMicButtonPressed] = useState(false);

  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const { toast } = useToast();
  const handleUserForceStopRef = useRef<() => void>(() => {});


  const handleSummarizeIdea = useCallback(async (newIdeaChunk: string) => {
    if (!newIdeaChunk.trim() && !fullConversationText.trim()) { // if new chunk is empty and no existing conversation
      setIsActivelyListening(false);
      setIsMicButtonPressed(false);
      return;
    }
    
    setIsSummarizing(true);
    // Append new chunk only if it's not empty. If it's empty but fullConversationText exists, we re-summarize existing.
    const updatedConversation = newIdeaChunk.trim() 
      ? (fullConversationText ? `${fullConversationText}\n\n${newIdeaChunk}` : newIdeaChunk)
      : fullConversationText;

    setFullConversationText(updatedConversation);

    if (!updatedConversation.trim()) { // if after potential append, it's still empty
        setIsSummarizing(false);
        setIsActivelyListening(false);
        setIsMicButtonPressed(false);
        setCurrentSummary(''); // Clear summary if conversation is empty
        return;
    }

    try {
      const result = await summarizeVideoIdea({ input: updatedConversation });
      setCurrentSummary(result.summary);
      // Toast removed as per user request
    } catch (error) {
      console.error('Error summarizing idea:', error);
      toast({ title: 'Error Summarizing', description: 'Could not process your input. Please try again.', variant: 'destructive' });
    } finally {
      setIsSummarizing(false);
    }
  }, [fullConversationText, toast]);
  
  const handleUserForceStop = useCallback(() => {
    window.removeEventListener('mouseup', handleUserForceStopRef.current);
    window.removeEventListener('touchend', handleUserForceStopRef.current);
    
    if (recognitionRef.current) {
      recognitionRef.current.stop(); // Use stop() to ensure onresult is called
    }
    // Immediate UI reset for responsiveness
    setIsActivelyListening(false);
    setIsMicButtonPressed(false);
  }, []); // Dependencies are empty as it only uses stable refs and setters

  useEffect(() => {
    handleUserForceStopRef.current = handleUserForceStop;
  }, [handleUserForceStop]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const SpeechRecognitionAPI = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (SpeechRecognitionAPI) {
        const recognitionInstance = new SpeechRecognitionAPI();
        recognitionInstance.continuous = false; 
        recognitionInstance.interimResults = false;
        recognitionInstance.lang = 'en-US';

        recognitionInstance.onstart = () => {
          setIsActivelyListening(true);
          // Add listeners only when recognition actually starts
          window.addEventListener('mouseup', handleUserForceStopRef.current);
          window.addEventListener('touchend', handleUserForceStopRef.current);
        };

        recognitionInstance.onresult = async (event) => {
          const transcript = event.results[0][0].transcript;
          // `handleSummarizeIdea` will be called with the transcript.
          // `isActivelyListening` and `isMicButtonPressed` will be reset by `onend` or `handleUserForceStop`.
          if (transcript) {
            await handleSummarizeIdea(transcript);
          }
        };
        
        recognitionInstance.onerror = (event) => {
          if (event.error !== 'no-speech' && event.error !== 'aborted') {
            console.error('Speech recognition error', event.error);
            toast({
              title: 'Speech Recognition Error',
              description: `Error: ${event.error}. Please ensure microphone permissions are granted.`,
              variant: 'destructive',
            });
          }
          setIsActivelyListening(false);
          setIsMicButtonPressed(false);
          window.removeEventListener('mouseup', handleUserForceStopRef.current);
          window.removeEventListener('touchend', handleUserForceStopRef.current);
        };

        recognitionInstance.onend = () => {
          setIsActivelyListening(false);
          setIsMicButtonPressed(false);
          window.removeEventListener('mouseup', handleUserForceStopRef.current);
          window.removeEventListener('touchend', handleUserForceStopRef.current);
        };
        
        recognitionRef.current = recognitionInstance;
      } else {
        toast({
          title: 'Speech Recognition Not Supported',
          description: 'Please use a browser that supports Web Speech API, or use text input.',
          variant: 'destructive',
        });
      }
    }
    
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.abort(); 
        recognitionRef.current.onstart = null;
        recognitionRef.current.onresult = null;
        recognitionRef.current.onerror = null;
        recognitionRef.current.onend = null;
      }
      window.removeEventListener('mouseup', handleUserForceStopRef.current);
      window.removeEventListener('touchend', handleUserForceStopRef.current);
    };
  }, [toast, handleSummarizeIdea, handleUserForceStop]); // handleSummarizeIdea is now a dependency

  const handleTextInputSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const currentInput = videoIdeaInput.trim();
    if (currentInput) {
      setVideoIdeaInput(''); // Clear input after sending
      await handleSummarizeIdea(currentInput);
    } else {
       toast({ title: 'Input Required', description: 'Please type your video idea.', variant: 'destructive' });
    }
  };

  const handleMicButtonInteractionStart = () => {
    if (!recognitionRef.current) {
      toast({ title: 'Speech API not ready', description: 'Speech recognition is not available or not yet initialized.', variant: 'destructive' });
      return;
    }
    // Prevent starting if already listening or if it's currently summarizing (unless it's an update summarization)
    if (isActivelyListening || (isSummarizing && !currentSummary) ) { 
      if(isSummarizing && !isActivelyListening) toast({ title: 'Processing...', description: 'Please wait for the current idea to be summarized.', variant: 'default' });
      return;
    }

    try {
      setIsMicButtonPressed(true); // Visual feedback starts
      // onstart will set isActivelyListening to true
      recognitionRef.current.start();
    } catch (error: any) {
      setIsMicButtonPressed(false);
      setIsActivelyListening(false); // Ensure reset on error

      if (error.name === 'InvalidStateError') {
        // This can happen if start() is called while already started or in a weird state.
        // Attempt to recover by ensuring global listeners are cleaned up.
        console.warn("SpeechRecognition InvalidStateError on start. Attempting to reset listening state.");
        window.removeEventListener('mouseup', handleUserForceStopRef.current);
        window.removeEventListener('touchend', handleUserForceStopRef.current);
        if (recognitionRef.current) {
            recognitionRef.current.abort(); // Try aborting to fully reset
        }
      } else {
        console.error("Error starting recognition:", error);
        toast({ title: 'Recognition Error', description: `Could not start listening: ${error.message}`, variant: 'destructive' });
      }
    }
  };


  const handleGenerateScript = async () => {
    const ideaToUseForScript = currentSummary || fullConversationText.trim() || videoIdeaInput.trim();

    if (!ideaToUseForScript) {
      toast({ title: 'Idea Required', description: 'First, provide an idea by speaking or typing.', variant: 'destructive' });
      return;
    }

    setIsGeneratingScript(true);
    setGeneratedScript(''); // Clear previous script

    let summaryForScript = currentSummary;

    // If no currentSummary but other text exists, try to summarize it first
    if (!summaryForScript && (fullConversationText.trim() || videoIdeaInput.trim())) {
      try {
        const tempSummaryResult = await summarizeVideoIdea({ input: fullConversationText.trim() || videoIdeaInput.trim() });
        summaryForScript = tempSummaryResult.summary;
        setCurrentSummary(summaryForScript); // Update UI with this summary
      } catch (error) {
        console.error('Error summarizing idea before script generation:', error);
        toast({ title: 'Summarization Failed', description: 'Could not summarize the idea to generate a script. Please try again.', variant: 'destructive' });
        setIsGeneratingScript(false);
        return;
      }
    }

    if (!summaryForScript) { // If still no summary after trying
        toast({ title: 'Summary Required', description: 'Could not obtain a summary for script generation.', variant: 'destructive' });
        setIsGeneratingScript(false);
        return;
    }
    
    try {
      const result = await generateVideoScript({ contextSummary: summaryForScript });
      setGeneratedScript(result.script);
      // Toast removed as per user request
      setCurrentView('script');
    } catch (error) {
      console.error('Error generating script:', error);
      toast({ title: 'Error Generating Script', description: 'Could not generate the script. Please try again.', variant: 'destructive' });
    } finally {
      setIsGeneratingScript(false);
    }
  };

  const navigateTo = (view: View) => {
    setCurrentView(view);
  };

  const renderInputView = () => (
    <div className="flex flex-col h-full bg-background">
      <CardHeader className="p-4 sm:p-6">
        <CardTitle className="text-2xl sm:text-3xl font-normal text-muted-foreground opacity-60">Storyy Idea</CardTitle>
      </CardHeader>
      <CardContent
        className="flex-grow p-4 sm:p-6 flex flex-col items-center justify-center text-center cursor-pointer"
        onMouseDown={!isActivelyListening && !(isSummarizing && !currentSummary) ? handleMicButtonInteractionStart : undefined}
        onTouchStart={(e) => {
          if (!isActivelyListening && !(isSummarizing && !currentSummary)) {
            e.preventDefault(); 
            handleMicButtonInteractionStart();
          }
        }}
        aria-label="Press and hold in this area to speak your video idea, or type below"
        role="button" 
        tabIndex={0} 
      >
        <div
          id="aiSummaryDisplay"
          className="w-full min-h-[150px] sm:min-h-[200px] p-3 rounded-md flex flex-col items-center justify-center text-center"
          aria-live="polite"
        >
          {(() => {
            if (isActivelyListening) {
              return <span className="text-primary text-xl font-medium">Listening...</span>;
            }
            // Initial summary in progress (e.g., after text input submission), and no prior summary exists
            if (isSummarizing && !currentSummary) { 
              return <Loader2 className="h-10 w-10 animate-spin text-primary" />;
            }
            // If there's a summary, display it.
            if (currentSummary) {
              return (
                <>
                  <span className="text-foreground text-xl font-medium whitespace-pre-wrap">{currentSummary}</span>
                  {/* If an update to this summary is in progress, show a small indicator */}
                  {isSummarizing && ( 
                    <span className="text-sm text-muted-foreground block mt-2">
                      Updating summary... <Loader2 className="inline h-4 w-4 animate-spin" />
                    </span>
                  )}
                </>
              );
            }
            // Default state: no active listening, not in initial summarization, no summary yet.
            return (
              <span className="text-muted-foreground text-xl font-medium whitespace-pre-wrap">
                Press and hold in this area to speak,
                <br />
                or type your idea below.
              </span>
            );
          })()}
        </div>
      </CardContent>
      
      <div className="p-4 border-t border-border bg-card shadow-md">
        <form onSubmit={handleTextInputSubmit} className="flex items-center gap-2 sm:gap-4 mb-3">
          <Input
            type="text"
            value={videoIdeaInput}
            onChange={(e) => setVideoIdeaInput(e.target.value)}
            placeholder="Type your video idea chunk here..."
            className="flex-grow text-base"
            disabled={isActivelyListening || (isSummarizing && !currentSummary)}
          />
          <Button 
            type="submit" 
            size="icon" 
            aria-label="Submit text idea" 
            disabled={isActivelyListening || (isSummarizing && !currentSummary) || !videoIdeaInput.trim()}
          >
            {(isSummarizing && !currentSummary && !isActivelyListening && videoIdeaInput.trim()) ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
          </Button>
        </form>
        <div className="flex items-center justify-end"> 
          <Button 
            onClick={() => {
              const ideaExists = currentSummary || fullConversationText.trim() || videoIdeaInput.trim();
              if (ideaExists) {
                navigateTo('script'); // Navigate if idea exists
              } else if (currentView === 'input' && !isGeneratingScript && !isActivelyListening && !isSummarizing){
                // If on input view and no idea, and not busy, then generate script from current state.
                // This typically means currentSummary should exist. If not, handleGenerateScript will try to make one.
                handleGenerateScript(); 
              } else if (!ideaExists) {
                toast({title: "No Idea Yet", description: "Please provide an idea first by speaking or typing.", variant: "default"});
              }
            }} 
            variant="default" 
            className="gap-2 bg-primary hover:bg-primary/90 text-primary-foreground hidden sm:flex" 
            disabled={isGeneratingScript || isActivelyListening || (isSummarizing && !currentSummary)} 
          >
             {isGeneratingScript ? <Loader2 className="h-5 w-5 animate-spin" /> : <>Next <ArrowRight className="h-5 w-5" /></>}
          </Button>
        </div>
      </div>
    </div>
  );

  const renderScriptView = () => (
    <div className="flex flex-col h-full bg-background">
      <CardHeader className="p-4 sm:p-6">
        <CardTitle className="text-2xl sm:text-3xl font-bold text-primary">Generated Video Script</CardTitle>
        <CardDescription>Here's the AI-generated script based on your idea. Review and use it for your video!</CardDescription>
      </CardHeader>
      <CardContent className="flex-grow p-4 sm:p-6 overflow-y-auto">
        <Label htmlFor="generatedScriptArea" className="text-lg font-semibold mb-2 block">Your Script:</Label>
        <Textarea
          id="generatedScriptArea"
          value={generatedScript || (currentSummary ? "Click 'Generate Script' below to create your video script based on the cumulative summary." : "Please go back and provide an idea first.")}
          readOnly
          placeholder="Your generated script will appear here..."
          className="w-full min-h-[300px] text-base bg-card text-card-foreground shadow-sm whitespace-pre-wrap"
          aria-live="polite"
        />
      </CardContent>
      <div className="p-4 border-t border-border bg-card shadow-md flex items-center justify-between">
        <Button onClick={() => navigateTo('input')} variant="outline" className="gap-2">
          <ArrowLeft className="h-5 w-5" /> Back to Idea
        </Button>
        <Button 
            onClick={handleGenerateScript} 
            disabled={isGeneratingScript || (!currentSummary.trim() && !fullConversationText.trim() && !videoIdeaInput.trim())} 
            className="gap-2 bg-accent hover:bg-accent/90 text-accent-foreground"
        >
          {isGeneratingScript ? <Loader2 className="h-5 w-5 animate-spin" /> : <Sparkles className="h-5 w-5" />}
          Generate Script
        </Button>
      </div>
    </div>
  );
  
  const Label = ({ htmlFor, className, children }: { htmlFor?: string; className?: string; children: React.ReactNode }) => (
    <label htmlFor={htmlFor} className={cn("block text-sm font-medium text-foreground", className)}>
      {children}
    </label>
  );
  const CardDescription = ({ className, children }: { className?: string; children: React.ReactNode }) => (
    <p className={cn("text-sm text-muted-foreground", className)}>
      {children}
    </p>
  );


  return (
    <main className="relative w-full h-screen overflow-hidden bg-background">
       <AudioWaveVisualizer 
        isActive={isMicButtonPressed}
        baseBorderThickness={3} 
        amplitudeSensitivity={0.1}
        className="fixed inset-0 z-[1000] pointer-events-none" 
        colorStart='hsl(220, 90%, 60%)' // Blue
        colorEnd='hsl(var(--primary))' // Theme Purple
      />
      <div
        className={cn(
          "absolute inset-0 transition-transform duration-500 ease-in-out transform",
          currentView === 'input' ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        {renderInputView()}
      </div>
      <div
        className={cn(
          "absolute inset-0 transition-transform duration-500 ease-in-out transform",
          currentView === 'script' ? 'translate-x-0' : 'translate-x-full'
        )}
      >
        {renderScriptView()}
      </div>
    </main>
  );
}

