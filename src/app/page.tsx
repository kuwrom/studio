
"use client";

import { useState, useEffect, useRef, FormEvent, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Send, Sparkles, Mic, RotateCcw, LogOut } from 'lucide-react';
import { summarizeVideoIdea } from '@/ai/flows/summarize-video-idea';
import { generateVideoScript } from '@/ai/flows/generate-video-script';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import AudioWaveVisualizer from '@/components/ui/AudioWaveVisualizer';
import { useAuth, SignInScreen } from '@/contexts/AuthContext';
import { 
  saveOrUpdateConversation, 
  getConversations, 
  updateLastOpened,
  type Conversation
} from '@/services/conversationService';

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
const SWIPE_DOWN_THRESHOLD = 50;


function VideoScriptAIPageContent() {
  const { user, signOut } = useAuth();
  const [generateSheetState, setGenerateSheetState] = useState<GenerateSheetState>('minimized');
  const [videoIdeaInput, setVideoIdeaInput] = useState('');
  
  const [fullConversationText, setFullConversationText] = useState('');
  const fullConversationTextRef = useRef(fullConversationText);
  useEffect(() => {
    fullConversationTextRef.current = fullConversationText;
  }, [fullConversationText]);

  const [currentSummary, setCurrentSummary] = useState('');
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [isActivelyListening, setIsActivelyListening] = useState(false);
  const [isMicButtonPressed, setIsMicButtonPressed] = useState(false);
  const [isGeneratingScript, setIsGeneratingScript] = useState(false);
  const [isAttemptingToListen, setIsAttemptingToListen] = useState(false);
  const [generatedScript, setGeneratedScript] = useState('');

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const { toast } = useToast();
  
  const handleSummarizeIdeaRef = useRef<(text: string) => Promise<void>>(async () => {});
  const handleUserForceStopRef = useRef<() => void>(() => {});

  const scriptSheetContentRef = useRef<HTMLDivElement>(null);
  const touchStartRef = useRef<{ y: number; scrollTop: number } | null>(null);


  const fetchConversationsCallback = useCallback(async () => {
    if (!user) return;
    setIsLoadingHistory(true);
    try {
      const convos = await getConversations(user.uid);
      setConversations(convos);
      if (!activeConversationId && convos.length > 0 && !fullConversationTextRef.current && !currentSummary && !generatedScript) {
        const mostRecentConvo = convos.sort((a, b) => b.lastOpenedAt - a.lastOpenedAt)[0];
        if (mostRecentConvo) {
            setActiveConversationId(mostRecentConvo.id);
            setCurrentSummary(mostRecentConvo.summary);
            setGeneratedScript(mostRecentConvo.script);
            setFullConversationText(mostRecentConvo.fullConversation || mostRecentConvo.summary); 
        }
      }
    } catch (error) {
      console.error("Error fetching conversations:", error);
      toast({ title: "Error", description: "Could not load conversation history.", variant: "destructive" });
    } finally {
      setIsLoadingHistory(false);
    }
  }, [user, activeConversationId, currentSummary, generatedScript, toast]);


  useEffect(() => {
    if (user && generateSheetState === 'expanded') {
      fetchConversationsCallback();
    }
  }, [user, generateSheetState, fetchConversationsCallback]);

  const handleSummarizeIdea = useCallback(async (newIdeaChunk: string) => {
    let textThatWillBeSummarized: string;

    // Use the ref to get the most current fullConversationText
    const currentTextFromRef = fullConversationTextRef.current;

    if (newIdeaChunk.trim()) {
      setActiveConversationId(null); 
      setGeneratedScript('');     
      textThatWillBeSummarized = currentTextFromRef
        ? `${currentTextFromRef}\n\n${newIdeaChunk}`
        : newIdeaChunk;
    } else {
      // If newIdeaChunk is empty, summarize the existing conversation if any
      textThatWillBeSummarized = currentTextFromRef;
    }
    
    // Update the state for the UI
    setFullConversationText(textThatWillBeSummarized);

    if (!textThatWillBeSummarized.trim()) {
      setCurrentSummary('');
      setIsSummarizing(false);
      return;
    }
    
    setIsSummarizing(true);
    try {
      const result = await summarizeVideoIdea({ input: textThatWillBeSummarized });
      setCurrentSummary(result.summary || "Could not get a summary. Try rephrasing or adding more details.");
    } catch (error) {
      console.error('Error summarizing idea:', error);
      toast({ title: 'Error Summarizing', description: 'Could not process your input. Please try again.', variant: 'destructive' });
      setCurrentSummary('Failed to get summary. Please try again.');
    } finally {
      setIsSummarizing(false);
    }
  }, [
    toast, 
    setFullConversationText, // Keep setFullConversationText as a dep
    setCurrentSummary, 
    setActiveConversationId, 
    setGeneratedScript, 
    setIsSummarizing
    // fullConversationTextRef is not needed as a dep for useCallback
  ]);


  useEffect(() => {
    handleSummarizeIdeaRef.current = handleSummarizeIdea;
  }, [handleSummarizeIdea]);

  const handleUserForceStop = useCallback(() => {
    window.removeEventListener('mouseup', handleUserForceStopRef.current);
    window.removeEventListener('touchend', handleUserForceStopRef.current);
    
    // Immediate UI state reset for responsiveness
    setIsMicButtonPressed(false);
    setIsActivelyListening(false); 
    // setIsAttemptingToListen(false); // Let onend/onerror handle this for SpeechAPI state

    if (recognitionRef.current) {
      recognitionRef.current.stop(); 
    }
  }, [setIsMicButtonPressed, setIsActivelyListening]); // Add setIsActivelyListening

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
  }, [toast, handleUserForceStop]); // handleUserForceStop is stable


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

    try {
      setIsAttemptingToListen(true);
      setIsMicButtonPressed(true); 
      window.addEventListener('mouseup', handleUserForceStopRef.current);
      window.addEventListener('touchend', handleUserForceStopRef.current);
      recognitionRef.current.start();
    } catch (error: any) {
      console.error("Error starting recognition:", error);
      toast({ title: 'Recognition Error', description: `Could not start listening: ${error.message}`, variant: 'destructive' });
      
      // Robust cleanup if start() fails
      setIsMicButtonPressed(false);
      setIsActivelyListening(false); 
      setIsAttemptingToListen(false);
      window.removeEventListener('mouseup', handleUserForceStopRef.current);
      window.removeEventListener('touchend', handleUserForceStopRef.current);
       if (error.name === 'InvalidStateError' && recognitionRef.current) { 
          console.warn("SpeechRecognition InvalidStateError on start. Attempting to abort.");
          recognitionRef.current.abort(); // Try to abort if it's in a weird state
      }
    }
  };

  const handleGenerateScript = async () => {
    if (!user) {
      toast({ title: 'Authentication Required', description: 'Please sign in to generate and save scripts.', variant: 'destructive' });
      return;
    }

    let ideaToUseForScript = currentSummary || fullConversationTextRef.current.trim();
    if (!ideaToUseForScript && fullConversationTextRef.current.trim()) { 
      ideaToUseForScript = fullConversationTextRef.current.trim();
    }
    
    if (!ideaToUseForScript) {
      toast({ title: 'Idea Required', description: 'First, provide an idea by speaking or typing.', variant: 'destructive' });
      return;
    }
    setIsGeneratingScript(true);
    let summaryForScript = currentSummary;

    if (!summaryForScript && fullConversationTextRef.current.trim()) {
      setIsSummarizing(true); 
      try {
        const tempSummaryResult = await summarizeVideoIdea({ input: fullConversationTextRef.current.trim() });
        summaryForScript = tempSummaryResult.summary;
        if (summaryForScript) setCurrentSummary(summaryForScript); 
      } catch (error) {
        console.error('Error summarizing idea before script generation:', error);
        toast({ title: 'Summarization Failed', description: 'Could not summarize the idea. Please try again.', variant: 'destructive' });
        setIsGeneratingScript(false);
        setIsSummarizing(false);
        return;
      } finally {
        setIsSummarizing(false);
      }
    }
    
    if (!summaryForScript) { 
        toast({ title: 'Summary Required', description: 'Could not obtain a summary for script generation.', variant: 'destructive' });
        setIsGeneratingScript(false);
        return;
    }

    try {
      const result = await generateVideoScript({ contextSummary: summaryForScript });
      const newScript = result.script;
      setGeneratedScript(newScript);
      
      const savedId = await saveOrUpdateConversation(user.uid, summaryForScript, newScript, fullConversationTextRef.current, activeConversationId);
      setActiveConversationId(savedId); 
      await fetchConversationsCallback(); 
      
    } catch (error) {
      console.error('Error generating or saving script:', error);
      toast({ title: 'Error Generating Script', description: 'Could not generate or save the script. Please try again.', variant: 'destructive' });
    } finally {
      setIsGeneratingScript(false);
    }
  };
  
  const handleNewIdea = () => {
    setFullConversationText('');
    setCurrentSummary('');
    setGeneratedScript('');
    setActiveConversationId(null);
    setVideoIdeaInput('');
    if (generateSheetState === 'expanded') {
        setGenerateSheetState('minimized');
    }
  };

  const handleHistoryItemClick = async (conversation: Conversation) => {
    if (!user) return;
    setCurrentSummary(conversation.summary);
    setGeneratedScript(conversation.script);
    setFullConversationText(conversation.fullConversation || conversation.summary);
    setActiveConversationId(conversation.id);
    setVideoIdeaInput('');

    try {
      await updateLastOpened(user.uid, conversation.id);
    } catch (error) {
      console.error("Error updating last opened:", error);
      toast({title: "Error", description: "Could not update conversation timestamp.", variant: "destructive"});
    }
  };
  
  const getScriptPreview = (script: string, lineLimit = 2) => {
    if (!script) return "";
    const lines = script.split('\n');
    return lines.slice(0, lineLimit).join('\n') + (lines.length > lineLimit ? '...' : '');
  };


  const renderDescribeArea = () => (
    <div className="flex-grow flex flex-col p-4 sm:p-6 bg-transparent relative h-full">
      <CardHeader className="p-0 mb-4 flex flex-row items-center justify-between">
        <CardTitle className="text-2xl sm:text-3xl font-normal text-muted-foreground opacity-60">Storyy Idea</CardTitle>
        {generateSheetState === 'minimized' && (
            <Button
            variant="ghost"
            size="icon"
            onClick={handleNewIdea}
            aria-label="Start new idea"
            className="text-muted-foreground hover:text-foreground"
            >
            <RotateCcw className="h-5 w-5" />
            </Button>
        )}
      </CardHeader>

      <div
        className="flex-grow flex flex-col items-center justify-center text-center cursor-pointer min-h-[200px] sm:min-h-[300px] select-none" // Added select-none
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
              disabled={isAttemptingToListen || isActivelyListening || isSummarizing || generateSheetState === 'expanded'}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleTextInputSubmit(e as any);
                }
              }}
            />
            {videoIdeaInput.trim() && !(isAttemptingToListen || isActivelyListening || isSummarizing || generateSheetState === 'expanded') && (
              <Button
                type="submit"
                size="icon"
                variant="ghost"
                className="absolute right-3 bottom-3 h-8 w-8 text-primary hover:bg-primary/10"
                aria-label="Submit text idea"
                disabled={isAttemptingToListen || isActivelyListening || isSummarizing || !videoIdeaInput.trim()}
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
             <span className="text-2xl sm:text-3xl font-normal text-muted-foreground opacity-60">Generate</span>
          </div>
        ) : (
          <div className="flex flex-col h-full">
            <CardHeader
              className="p-4 sm:p-6 flex flex-row items-center justify-between relative"
            >
              <div className="w-10 h-10"></div> {/* Placeholder for symmetry */}
              <CardTitle 
                className="text-2xl sm:text-3xl font-normal text-muted-foreground opacity-60 text-center flex-grow cursor-pointer"
                onClick={() => setGenerateSheetState('minimized')}
                role="button"
                aria-label="Minimize script view"
              >
                Generate
              </CardTitle>
              <Button 
                variant="ghost" 
                size="icon" 
                onClick={async (e) => { 
                  e.stopPropagation(); 
                  if (signOut) await signOut(); 
                }} 
                aria-label="Sign out" 
                className="text-muted-foreground hover:text-foreground"
              >
                <LogOut className="h-5 w-5" />
              </Button>
            </CardHeader>
            <CardContent
              ref={scriptSheetContentRef}
              className="flex-grow p-4 sm:p-6 overflow-y-auto space-y-4"
              onTouchStart={handleSheetTouchStart}
              onTouchMove={handleSheetTouchMove}
              onTouchEnd={handleSheetTouchEnd}
            >
              {isLoadingHistory && <p className="text-muted-foreground text-center">Loading history...</p>}
              {!isLoadingHistory && conversations.length === 0 && !activeConversationId && !currentSummary && !generatedScript && (
                 <p className="text-muted-foreground text-center">
                    No past scripts found. Describe your idea first or generate a new script.
                 </p>
              )}
              {(!activeConversationId && (currentSummary || generatedScript)) && (
                <Card className="mb-4 border-primary ring-2 ring-primary shadow-lg">
                  <CardHeader>
                    <CardTitle className="text-lg">{currentSummary || "New Idea In Progress"}</CardTitle>
                  </CardHeader>
                  <CardContent>
                     <div className="w-full text-base bg-background text-foreground shadow-sm whitespace-pre-wrap p-3 rounded-md border border-input min-h-[80px]">
                        {generatedScript || <span className="text-muted-foreground">Script will appear here after generation.</span>}
                    </div>
                  </CardContent>
                </Card>
              )}

              {conversations.map((convo) => (
                <Card 
                  key={convo.id} 
                  onClick={() => handleHistoryItemClick(convo)} 
                  className={cn(
                    "cursor-pointer hover:shadow-md transition-shadow",
                    activeConversationId === convo.id && "border-primary ring-2 ring-primary shadow-lg"
                  )}
                >
                  <CardHeader>
                    <CardTitle className="text-lg">{convo.summary}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-sm text-muted-foreground whitespace-pre-wrap">
                      {activeConversationId === convo.id ? convo.script : getScriptPreview(convo.script)}
                    </div>
                  </CardContent>
                </Card>
              ))}
              
            </CardContent>
            <div className="p-4 border-t border-border bg-card">
              <Button
                onClick={handleGenerateScript}
                disabled={isGeneratingScript || isSheetContentDisabled || (!currentSummary.trim() && !fullConversationTextRef.current.trim())}
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
