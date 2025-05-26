
"use client";

import { useState, useEffect, useRef, FormEvent, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Send, Sparkles, Mic } from 'lucide-react';
import { summarizeVideoIdea } from '@/ai/flows/summarize-video-idea';
import { generateVideoScript } from '@/ai/flows/generate-video-script';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import AudioWaveVisualizer from '@/components/ui/AudioWaveVisualizer';

type GenerateSheetState = 'minimized' | 'expanded';

declare global {
  interface Window {
    SpeechRecognition: typeof SpeechRecognition;
    webkitSpeechRecognition: typeof SpeechRecognition;
    webkitAudioContext: typeof AudioContext;
  }
}

const MINIMIZED_SHEET_HEIGHT = '80px';
const EXPANDED_SHEET_TARGET_VH = '90vh';
const SWIPE_DOWN_THRESHOLD = 50; // Pixels

export default function VideoScriptAIPage() {
  const [generateSheetState, setGenerateSheetState] = useState<GenerateSheetState>('minimized');
  const [videoIdeaInput, setVideoIdeaInput] = useState('');
  const [fullConversationText, setFullConversationText] = useState('');
  const [currentSummary, setCurrentSummary] = useState('');
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [isActivelyListening, setIsActivelyListening] = useState(false);
  const [isMicButtonPressed, setIsMicButtonPressed] = useState(false);
  const [isGeneratingScript, setIsGeneratingScript] = useState(false);
  const [generatedScript, setGeneratedScript] = useState('');
  const [isAttemptingToListen, setIsAttemptingToListen] = useState(false);


  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const { toast } = useToast();

  const handleSummarizeIdeaRef = useRef<(text: string) => Promise<void>>(async () => {});
  const handleUserForceStopRef = useRef<() => void>(() => {});

  const scriptSheetContentRef = useRef<HTMLDivElement>(null);
  const touchStartRef = useRef<{ y: number; scrollTop: number } | null>(null);

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

  useEffect(() => {
    handleSummarizeIdeaRef.current = handleSummarizeIdea;
  }, [handleSummarizeIdea]);

  const handleUserForceStop = useCallback(() => {
    window.removeEventListener('mouseup', handleUserForceStopRef.current);
    window.removeEventListener('touchend', handleUserForceStopRef.current);

    setIsMicButtonPressed(false); // Immediate visual feedback for visualizer
    setIsActivelyListening(false); // Immediate visual feedback for "Listening..." text

    if (recognitionRef.current) {
      recognitionRef.current.stop(); // Use stop to allow onresult to fire
    }
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
          setIsAttemptingToListen(false);
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
          setIsAttemptingToListen(false);
          window.removeEventListener('mouseup', handleUserForceStopRef.current);
          window.removeEventListener('touchend', handleUserForceStopRef.current);
        };

        recognitionInstance.onend = () => {
          setIsActivelyListening(false);
          setIsMicButtonPressed(false);
          setIsAttemptingToListen(false);
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
  }, [toast, handleUserForceStop]);


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
    if (isAttemptingToListen || isActivelyListening || isSummarizing || generateSheetState === 'expanded') {
      return;
    }

    setIsAttemptingToListen(true);
    try {
      setIsMicButtonPressed(true);
      window.addEventListener('mouseup', handleUserForceStopRef.current);
      window.addEventListener('touchend', handleUserForceStopRef.current);
      recognitionRef.current.start();
    } catch (error: any) {
      console.error("Error starting recognition:", error);
       if (error.name === 'InvalidStateError') {
          console.warn("SpeechRecognition InvalidStateError on start. Attempting to reset listening state.");
          if (recognitionRef.current) { 
              recognitionRef.current.abort(); 
          }
      } else {
        toast({ title: 'Recognition Error', description: `Could not start listening: ${error.message}`, variant: 'destructive' });
      }
      setIsMicButtonPressed(false);
      setIsActivelyListening(false);
      setIsAttemptingToListen(false);
      window.removeEventListener('mouseup', handleUserForceStopRef.current);
      window.removeEventListener('touchend', handleUserForceStopRef.current);
    }
  };


  const handleGenerateScript = async () => {
    const ideaToUseForScript = currentSummary || fullConversationText.trim() || videoIdeaInput.trim();
    if (!ideaToUseForScript) {
      toast({ title: 'Idea Required', description: 'First, provide an idea by speaking or typing.', variant: 'destructive' });
      return;
    }
    setIsGeneratingScript(true);
    let summaryForScript = currentSummary;

    if (!summaryForScript && (fullConversationText.trim() || videoIdeaInput.trim())) {
      const oldIsSummarizing = isSummarizing;
      setIsSummarizing(true);
      try {
        const tempSummaryResult = await summarizeVideoIdea({ input: fullConversationText.trim() || videoIdeaInput.trim() });
        summaryForScript = tempSummaryResult.summary;
        setCurrentSummary(summaryForScript);
      } catch (error) {
        console.error('Error summarizing idea before script generation:', error);
        toast({ title: 'Summarization Failed', description: 'Could not summarize the idea to generate a script. Please try again.', variant: 'destructive' });
        setIsGeneratingScript(false);
        setIsSummarizing(oldIsSummarizing);
        return;
      } finally {
        setIsSummarizing(oldIsSummarizing);
      }
    }

    if (!summaryForScript) {
        toast({ title: 'Summary Required', description: 'Could not obtain a summary for script generation.', variant: 'destructive' });
        setIsGeneratingScript(false);
        return;
    }

    try {
      const result = await generateVideoScript({ contextSummary: summaryForScript });
      setGeneratedScript(result.script);
    } catch (error) {
      console.error('Error generating script:', error);
      toast({ title: 'Error Generating Script', description: 'Could not generate the script. Please try again.', variant: 'destructive' });
    } finally {
      setIsGeneratingScript(false);
    }
  };

  const renderDescribeArea = () => (
    <div className="flex-grow flex flex-col p-4 sm:p-6 bg-transparent relative h-full">
      <CardHeader className="p-0 mb-4">
        <CardTitle className="text-2xl sm:text-3xl font-normal text-muted-foreground opacity-60">Storyy Idea</CardTitle>
      </CardHeader>

      <div
        className="flex-grow flex flex-col items-center justify-center text-center cursor-pointer min-h-[200px] sm:min-h-[300px]"
        onMouseDown={!(isAttemptingToListen || isActivelyListening || isSummarizing || generateSheetState === 'expanded') ? handleMicButtonInteractionStart : undefined}
        onTouchStart={(e) => {
          if (!(isAttemptingToListen || isActivelyListening || isSummarizing || generateSheetState === 'expanded')) {
            e.preventDefault(); 
            handleMicButtonInteractionStart();
          }
        }}
        aria-label="Press and hold in this area to speak your video idea, or type below"
        role="button"
        tabIndex={!(isAttemptingToListen || isActivelyListening || isSummarizing || generateSheetState === 'expanded') ? 0 : -1}
      >
        <div
          id="aiSummaryDisplay"
          className="w-full p-3 rounded-md flex flex-col items-center justify-center text-center"
          aria-live="polite"
        >
          {(() => {
            const baseTextClasses = "text-xl font-medium whitespace-pre-wrap";
            const gradientTextClasses = "bg-gradient-to-r from-[hsl(220,90%,60%)] to-[hsl(var(--primary))] bg-clip-text text-transparent";
            const placeholderTextClasses = "text-muted-foreground";

            if (isActivelyListening) {
              return <span className={cn(baseTextClasses, gradientTextClasses)}>Listening...</span>;
            }
            if (isSummarizing && !isActivelyListening) { 
              return <span className={cn(baseTextClasses, gradientTextClasses)}>Updating...</span>;
            }
            if (currentSummary) {
              return <span className={cn(baseTextClasses, gradientTextClasses)}>{currentSummary}</span>;
            }
            return (
              <span className={cn(baseTextClasses, placeholderTextClasses)}>
                Tap anywhere to speak
                <br />
                or type your idea below.
              </span>
            );
          })()}
        </div>
      </div>

      {generateSheetState === 'minimized' && (
        <form onSubmit={handleTextInputSubmit} className="mt-auto p-2 bg-card shadow-lg rounded-lg relative">
          <div className="flex items-center gap-2 sm:gap-3">
            <Textarea
              value={videoIdeaInput}
              onChange={(e) => setVideoIdeaInput(e.target.value)}
              placeholder="Type your video idea chunk here..."
              className="flex-grow text-base border-0 focus-visible:ring-0 focus-visible:ring-offset-0 resize-none min-h-[40px] max-h-[120px] pr-12"
              rows={1}
              disabled={isActivelyListening || isSummarizing || isAttemptingToListen || generateSheetState === 'expanded'}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleTextInputSubmit(e as any);
                }
              }}
            />
            {videoIdeaInput.trim() && !(isActivelyListening || isSummarizing || isAttemptingToListen || generateSheetState === 'expanded') && (
              <Button
                type="submit"
                size="icon"
                variant="ghost"
                className="absolute right-3 bottom-3 h-8 w-8 text-primary hover:bg-primary/10"
                aria-label="Submit text idea"
                disabled={isActivelyListening || isSummarizing || isAttemptingToListen || !videoIdeaInput.trim()}
              >
                <Send className="h-5 w-5" />
              </Button>
            )}
          </div>
        </form>
      )}
    </div>
  );

  const handleSheetTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (scriptSheetContentRef.current) {
      touchStartRef.current = {
        y: e.touches[0].clientY,
        scrollTop: scriptSheetContentRef.current.scrollTop,
      };
    }
  };

  const handleSheetTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (!touchStartRef.current || !scriptSheetContentRef.current) return;

    const deltaY = e.touches[0].clientY - touchStartRef.current.y;

    if (deltaY > SWIPE_DOWN_THRESHOLD && touchStartRef.current.scrollTop === 0) {
      setGenerateSheetState('minimized');
      touchStartRef.current = null; 
    }
  };

  const handleSheetTouchEnd = () => {
    touchStartRef.current = null;
  };


  const renderGenerateSheet = () => {
    const isSheetContentDisabled = isActivelyListening || isSummarizing || isAttemptingToListen;

    return (
      <div
        className={cn(
          "fixed bottom-0 left-0 right-0 bg-card shadow-2xl rounded-t-2xl transition-transform duration-300 ease-in-out z-20 border-t border-border",
          generateSheetState === 'expanded' ? `translate-y-0 h-[${EXPANDED_SHEET_TARGET_VH}]` : `translate-y-[calc(100%_-_var(--minimized-sheet-height))] h-[var(--minimized-sheet-height)]`
        )}
        style={{ '--minimized-sheet-height': MINIMIZED_SHEET_HEIGHT } as React.CSSProperties}
      >
        {generateSheetState === 'minimized' ? (
          <div
            onClick={() => !isSheetContentDisabled && setGenerateSheetState('expanded')}
            className="flex items-center justify-center h-full cursor-pointer p-4"
            role="button"
            aria-label="Expand to view and generate script"
          >
            <span className="text-2xl sm:text-3xl font-normal text-muted-foreground opacity-60">
              Generate
            </span>
          </div>
        ) : (
          <div className="flex flex-col h-full">
            <CardHeader
              className="p-4 sm:p-6 cursor-pointer flex flex-row items-center justify-center relative"
              onClick={() => setGenerateSheetState('minimized')}
              role="button"
              aria-label="Minimize script view"
            >
              <CardTitle className="text-2xl sm:text-3xl font-normal text-muted-foreground opacity-60 text-center flex-grow">Generate</CardTitle>
            </CardHeader>
            <CardContent
              ref={scriptSheetContentRef}
              className="flex-grow p-4 sm:p-6 overflow-y-auto"
              onTouchStart={handleSheetTouchStart}
              onTouchMove={handleSheetTouchMove}
              onTouchEnd={handleSheetTouchEnd}
            >
              <Label htmlFor="generatedScriptArea" className="text-base font-medium mb-2 block text-muted-foreground">Your Script:</Label>
              <div
                id="generatedScriptArea"
                className="w-full text-base bg-background text-foreground shadow-sm whitespace-pre-wrap p-3 rounded-md border border-input min-h-[80px]"
                aria-live="polite"
              >
                {generatedScript ? (
                  generatedScript
                ) : (
                  <span className="text-muted-foreground">
                    {currentSummary ? "Click 'Generate' below to create your video script." : "Please describe your idea first on the screen above."}
                  </span>
                )}
              </div>
            </CardContent>
            <div className="p-4 border-t border-border bg-card">
              <Button
                onClick={handleGenerateScript}
                disabled={isGeneratingScript || isSheetContentDisabled || (!currentSummary.trim() && !fullConversationText.trim() && !videoIdeaInput.trim())}
                className="w-full gap-2 bg-accent hover:bg-accent/90 text-accent-foreground text-lg py-3"
              >
                {isGeneratingScript ? <Mic className="h-5 w-5 animate-spin" /> : <Sparkles className="h-5 w-5" />}
                Generate
              </Button>
            </div>
          </div>
        )}
      </div>
    );
  };

  const Label = ({ htmlFor, className, children }: { htmlFor?: string; className?: string; children: React.ReactNode }) => (
    <label htmlFor={htmlFor} className={cn("block text-sm font-medium text-foreground", className)}>
      {children}
    </label>
  );


  return (
    <main
        className="relative w-full h-screen overflow-hidden bg-background"
        style={{ '--minimized-sheet-height': MINIMIZED_SHEET_HEIGHT, '--expanded-sheet-target-vh': EXPANDED_SHEET_TARGET_VH } as React.CSSProperties}
    >
      <AudioWaveVisualizer
        isActive={isMicButtonPressed}
        baseBorderThickness={3}
        amplitudeSensitivity={0.1}
        className="fixed inset-0 z-[1000] pointer-events-none"
        borderColor="black"
      />

      <div
        className={cn(
          "absolute top-0 left-0 right-0 bg-background",
          "transition-all duration-300 ease-in-out", 
          generateSheetState === 'minimized'
            ? "bottom-[var(--minimized-sheet-height)] z-0" 
            : `bottom-[${EXPANDED_SHEET_TARGET_VH}] z-10 cursor-pointer` 
        )}
        onClick={() => {
          if (generateSheetState === 'expanded') {
            setGenerateSheetState('minimized');
          }
        }}
      >
        {generateSheetState === 'expanded' && (
          <div className="w-full h-full flex items-center justify-center bg-background/50 backdrop-blur-sm">
            <h2 className="text-3xl font-semibold text-muted-foreground opacity-80">Describe</h2>
          </div>
        )}

        {generateSheetState === 'minimized' && (
            <div className="h-full flex flex-col">
                 {renderDescribeArea()}
            </div>
        )}
      </div>

      {renderGenerateSheet()}
    </main>
  );
}
