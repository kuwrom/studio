
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
    if (!newIdeaChunk.trim()) {
      setIsActivelyListening(false);
      setIsMicButtonPressed(false);
      return;
    }
    setIsSummarizing(true);
    const updatedConversation = fullConversationText ? `${fullConversationText}\n\n${newIdeaChunk}` : newIdeaChunk;
    setFullConversationText(updatedConversation);

    try {
      const result = await summarizeVideoIdea({ input: updatedConversation });
      setCurrentSummary(result.summary);
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
      recognitionRef.current.stop();
    }
    setIsActivelyListening(false);
    setIsMicButtonPressed(false);
  }, []);

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
        recognitionRef.current.abort(); // Use abort on cleanup
        recognitionRef.current.onstart = null;
        recognitionRef.current.onresult = null;
        recognitionRef.current.onerror = null;
        recognitionRef.current.onend = null;
      }
      window.removeEventListener('mouseup', handleUserForceStopRef.current);
      window.removeEventListener('touchend', handleUserForceStopRef.current);
    };
  }, [toast, handleSummarizeIdea, handleUserForceStop]);

  const handleTextInputSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const currentInput = videoIdeaInput.trim();
    if (currentInput) {
      setVideoIdeaInput('');
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
    if (isActivelyListening || isSummarizing) {
      if(isSummarizing && !isActivelyListening) toast({ title: 'Processing...', description: 'Please wait for the current idea to be summarized.', variant: 'default' });
      return;
    }

    try {
      setIsMicButtonPressed(true);
      // onstart will set isActivelyListening to true
      recognitionRef.current.start();
    } catch (error: any) {
      setIsMicButtonPressed(false);
      setIsActivelyListening(false);

      if (error.name === 'InvalidStateError') {
        console.warn("SpeechRecognition InvalidStateError on start. Attempting to reset listening state.");
        window.removeEventListener('mouseup', handleUserForceStopRef.current);
        window.removeEventListener('touchend', handleUserForceStopRef.current);
        if (recognitionRef.current) {
            recognitionRef.current.abort();
        }
      } else {
        console.error("Error starting recognition:", error);
        toast({ title: 'Recognition Error', description: `Could not start listening: ${error.message}`, variant: 'destructive' });
      }
    }
  };

  const handleGenerateScript = async () => {
    if (!currentSummary.trim() && !fullConversationText.trim()) {
       const ideaToUse = videoIdeaInput.trim() || fullConversationText.trim();
       if (!ideaToUse) {
        toast({ title: 'Idea Required', description: 'First, provide an idea by speaking or typing.', variant: 'destructive' });
        return;
       }
       // If there's no summary but there is text, summarize first
       await handleSummarizeIdea(ideaToUse);
       // handleGenerateScript will be called again effectively by the state update if currentSummary becomes available
       // This might need a useEffect to trigger generate if summary becomes available and a flag is set.
       // For now, let's assume user generates summary first or the currentSummary state is up-to-date.
       // The original PRD implies generation from summary, so we should ensure summary exists.
       if(!currentSummary.trim() && ideaToUse) { // if summary didn't update in time or instantly
         setIsGeneratingScript(true); // show loader
         try {
            const summaryResult = await summarizeVideoIdea({ input: ideaToUse });
            if(summaryResult.summary){
                const scriptResult = await generateVideoScript({ contextSummary: summaryResult.summary });
                setGeneratedScript(scriptResult.script);
                setCurrentView('script');
            } else {
                toast({ title: 'Summary Failed', description: 'Could not summarize the idea to generate a script.', variant: 'destructive' });
            }
         } catch (error) {
            console.error('Error generating script after intermediate summary:', error);
            toast({ title: 'Error Generating Script', description: 'Could not generate the script. Please try again.', variant: 'destructive' });
         } finally {
            setIsGeneratingScript(false);
         }
         return;
       }

    }
    if (!currentSummary.trim()) {
        toast({ title: 'Summary Required', description: 'Please provide an idea for summarization first.', variant: 'destructive' });
        return;
    }

    setIsGeneratingScript(true);
    setGeneratedScript('');
    try {
      const result = await generateVideoScript({ contextSummary: currentSummary });
      setGeneratedScript(result.script);
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
        <CardTitle className="text-2xl sm:text-3xl font-bold text-primary">Storyy Idea</CardTitle>
        {/* Description removed */}
      </CardHeader>
      <CardContent
        className="flex-grow p-4 sm:p-6 flex flex-col items-center justify-center text-center cursor-pointer"
        onMouseDown={!isSummarizing && !isActivelyListening ? handleMicButtonInteractionStart : undefined}
        onTouchStart={(e) => {
          if (!isSummarizing && !isActivelyListening) {
            e.preventDefault(); // Prevent default touch actions like scrolling or zooming
            handleMicButtonInteractionStart();
          }
        }}
        aria-label="Press and hold to speak your video idea"
        role="button" // Semantically a button now
        tabIndex={0} // Make it focusable
        // onKeyDown might be added later for space/enter activation if desired, but push-to-talk is primary.
      >
        {/* Label removed */}
        <div
          id="aiSummaryDisplay"
          className="w-full min-h-[150px] sm:min-h-[200px] p-3 rounded-md text-lg flex items-center justify-center whitespace-pre-wrap" // Ensure flex properties for centering loader/text
          aria-live="polite"
        >
          {isSummarizing && !currentSummary ? (
            <Loader2 className="h-10 w-10 animate-spin text-primary" />
          ) : currentSummary ? (
            <span className="text-foreground text-2xl font-medium">{currentSummary}</span>
          ) : isActivelyListening ? (
            <span className="text-primary text-xl">Listening...</span>
          ): (
            <span className="text-muted-foreground text-xl">
              Press and hold in this area to speak,
              <br />
              or type your idea below.
            </span>
          )}
          {isSummarizing && currentSummary && (
            <span className="text-sm text-muted-foreground block mt-2">
              Updating summary... <Loader2 className="inline h-4 w-4 animate-spin" />
            </span>
          )}
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
            disabled={isActivelyListening || isSummarizing}
          />
          <Button type="submit" size="icon" aria-label="Submit text idea" disabled={isActivelyListening || isSummarizing || !videoIdeaInput.trim()}>
            {isSummarizing && !isActivelyListening && !videoIdeaInput ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
          </Button>
        </form>
        <div className="flex items-center justify-end"> 
          {/* Hold to Speak button removed */}
          <Button 
            onClick={() => {
              if (currentSummary || fullConversationText.trim() || videoIdeaInput.trim()) {
                navigateTo('script');
              } else {
                toast({title: "No Idea Yet", description: "Please provide an idea first by speaking or typing.", variant: "default"});
              }
            }} 
            variant="default" 
            className="gap-2 bg-primary hover:bg-primary/90 text-primary-foreground hidden sm:flex" // Added hidden sm:flex
            disabled={isGeneratingScript || isActivelyListening || isSummarizing} 
          >
            Next <ArrowRight className="h-5 w-5" />
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
  
  // Extracted Label component for reusability if needed elsewhere, or can be kept inline
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
        // borderColor is removed; gradient is internal to visualizer
        baseBorderThickness={3} 
        amplitudeSensitivity={0.1}
        className="fixed inset-0 z-[1000] pointer-events-none" 
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
