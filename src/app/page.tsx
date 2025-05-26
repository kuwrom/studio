
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
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [isActivelyListening, setIsActivelyListening] = useState(false);
  const [isMicButtonPressed, setIsMicButtonPressed] = useState(false);
  const [isGeneratingScript, setIsGeneratingScript] = useState(false);
  const [generatedScript, setGeneratedScript] = useState('');

  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const { toast } = useToast();
  const handleUserForceStopRef = useRef<() => void>(() => {});

  const handleSummarizeIdea = useCallback(async (newIdeaChunk: string) => {
    setIsSummarizing(true);

    const updatedConversation = newIdeaChunk.trim()
      ? (fullConversationText ? `${fullConversationText}\n\n${newIdeaChunk}` : newIdeaChunk)
      : fullConversationText;

    setFullConversationText(updatedConversation);

    if (!updatedConversation.trim()) {
      setCurrentSummary('');
      setIsSummarizing(false);
      return;
    }

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

  const handleSummarizeIdeaRef = useRef(handleSummarizeIdea);

  useEffect(() => {
    handleSummarizeIdeaRef.current = handleSummarizeIdea;
  }, [handleSummarizeIdea]);


  const handleUserForceStop = useCallback(() => {
    window.removeEventListener('mouseup', handleUserForceStopRef.current);
    window.removeEventListener('touchend', handleUserForceStopRef.current);

    if (recognitionRef.current) {
      recognitionRef.current.stop(); // Use stop() to ensure result is processed
    }
    // Immediate UI update
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
          window.addEventListener('mouseup', handleUserForceStopRef.current);
          window.addEventListener('touchend', handleUserForceStopRef.current);
        };

        recognitionInstance.onresult = async (event) => {
          let transcript = '';
          if (event.results && event.results[0] && event.results[0][0]) {
            transcript = event.results[0][0].transcript;
          }
          await handleSummarizeIdeaRef.current(transcript);
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
  }, [toast, handleUserForceStop]); // Main dependencies are now stable

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
    if (isActivelyListening || isSummarizing ) {
      if(isSummarizing && !isActivelyListening) {
        // Consider removing this toast if it's too noisy during normal summarization updates
        // toast({ title: 'Processing...', description: 'Please wait for the current idea to be summarized.', variant: 'default' });
      }
      return;
    }

    try {
      setIsMicButtonPressed(true); // Set this first so visualizer activates
      recognitionRef.current.start();
    } catch (error: any) {
      console.error("Error starting recognition:", error);
      toast({ title: 'Recognition Error', description: `Could not start listening: ${error.message}`, variant: 'destructive' });
      setIsMicButtonPressed(false); 
      setIsActivelyListening(false);

      if (error.name === 'InvalidStateError') {
        console.warn("SpeechRecognition InvalidStateError on start. Attempting to reset listening state.");
        window.removeEventListener('mouseup', handleUserForceStopRef.current);
        window.removeEventListener('touchend', handleUserForceStopRef.current);
        if (recognitionRef.current) {
            recognitionRef.current.abort(); 
        }
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
    // setGeneratedScript(''); // No need to clear here, as it's set upon successful generation

    let summaryForScript = currentSummary;

    if (!summaryForScript && (fullConversationText.trim() || videoIdeaInput.trim())) {
      // This block ensures a summary exists even if user types and directly hits generate
      setIsSummarizing(true); 
      try {
        const tempSummaryResult = await summarizeVideoIdea({ input: fullConversationText.trim() || videoIdeaInput.trim() });
        summaryForScript = tempSummaryResult.summary;
        setCurrentSummary(summaryForScript); 
      } catch (error) {
        console.error('Error summarizing idea before script generation:', error);
        toast({ title: 'Summarization Failed', description: 'Could not summarize the idea to generate a script. Please try again.', variant: 'destructive' });
        setIsGeneratingScript(false);
        setIsSummarizing(false);
        return;
      } finally {
        setIsSummarizing(false);
      }
    }
    
    if (!summaryForScript) { // Check again after potential summarization
        toast({ title: 'Summary Required', description: 'Could not obtain a summary for script generation.', variant: 'destructive' });
        setIsGeneratingScript(false);
        return;
    }


    try {
      const result = await generateVideoScript({ contextSummary: summaryForScript });
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
        <CardTitle className="text-2xl sm:text-3xl font-normal text-muted-foreground opacity-60">Storyy Idea</CardTitle>
      </CardHeader>
      <CardContent
        className="flex-grow p-4 sm:p-6 flex flex-col items-center justify-center text-center cursor-pointer"
        onMouseDown={isActivelyListening || isSummarizing ? undefined : handleMicButtonInteractionStart}
        onTouchStart={(e) => {
          if (!(isActivelyListening || isSummarizing)) {
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
            const baseTextClasses = "text-xl font-medium whitespace-pre-wrap";
            const gradientTextClasses = "bg-gradient-to-r from-[hsl(220,90%,60%)] to-[hsl(var(--primary))] bg-clip-text text-transparent";
            const placeholderTextClasses = "text-muted-foreground";

            if (isActivelyListening) {
              return <span className={cn(baseTextClasses, gradientTextClasses)}>Listening...</span>;
            }
            if (isSummarizing) { // This implies !isActivelyListening
              return <span className={cn(baseTextClasses, gradientTextClasses)}>Updating...</span>;
            }
            if (currentSummary) {
              return <span className={cn(baseTextClasses, gradientTextClasses)}>{currentSummary}</span>;
            }
            return (
              <span className={cn(baseTextClasses, placeholderTextClasses)}>
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
            disabled={isActivelyListening || isSummarizing}
          />
          <Button
            type="submit"
            size="icon"
            aria-label="Submit text idea"
            disabled={isActivelyListening || isSummarizing || !videoIdeaInput.trim()}
          >
            {(isSummarizing && !isActivelyListening && videoIdeaInput.trim()) ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
          </Button>
        </form>
        <div className="flex items-center justify-end">
          <Button
            onClick={() => {
              const ideaExists = currentSummary || fullConversationText.trim() || videoIdeaInput.trim();
              if (ideaExists) {
                // If an idea exists, always attempt to generate script, which will navigate.
                handleGenerateScript(); 
              } else if (currentView === 'input' && !isGeneratingScript && !isActivelyListening && !isSummarizing){
                // If on input view, no active processes, and no idea, try to generate (which will show toast)
                handleGenerateScript();
              } else if (!ideaExists) { // This case might be redundant due to above, but good fallback.
                toast({title: "No Idea Yet", description: "Please provide an idea first by speaking or typing.", variant: "default"});
              }
            }}
            variant="default"
            className="gap-2 bg-primary hover:bg-primary/90 text-primary-foreground hidden sm:flex"
            disabled={isGeneratingScript || isActivelyListening || isSummarizing}
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

  // Helper components (can be moved to separate files if they grow)
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
        borderColor="black" 
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

