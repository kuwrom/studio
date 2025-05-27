import { useState, useEffect, useRef, useCallback } from 'react';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { summarizeVideoIdea } from '@/ai/flows/summarize-video-idea';
import { generateVideoScript } from '@/ai/flows/generate-video-script';
import { 
  saveOrUpdateConversation, 
  getConversations, 
  updateLastOpened,
  type Conversation
} from '@/services/conversationService';

export type GenerateSheetState = 'minimized' | 'expanded';

const lengthOptions = [
  { value: 0, label: "Very Short (Under 1 min)" },
  { value: 1, label: "Short (1-3 mins)" },
  { value: 2, label: "Medium (3-5 mins)" },
  { value: 3, label: "Long (5-10 mins)" },
  { value: 4, label: "Very Long (10+ mins)" },
];
const defaultVideoLengthValue = 2; // "Medium (3-5 mins)"

interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList;
  resultIndex: number;
}

interface SpeechRecognitionError extends Event {
  error: string;
  message?: string;
}

interface SpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  abort(): void;
  onstart: ((this: SpeechRecognition, ev: Event) => any) | null;
  onresult: ((this: SpeechRecognition, ev: SpeechRecognitionEvent) => any) | null;
  onerror: ((this: SpeechRecognition, ev: SpeechRecognitionError) => any) | null;
  onend: ((this: SpeechRecognition, ev: Event) => any) | null;
}

interface SpeechRecognitionResult {
  isFinal: boolean;
  [index: number]: SpeechRecognitionAlternative;
}

interface SpeechRecognitionAlternative {
  transcript: string;
  confidence: number;
}

interface SpeechRecognitionResultList {
  length: number;
  [index: number]: SpeechRecognitionResult;
}

declare global {
  interface Window {
    SpeechRecognition: new () => SpeechRecognition;
    webkitSpeechRecognition: new () => SpeechRecognition;
  }
}

export function useVideoScriptLogic() {
  const { user } = useAuth();
  const { toast } = useToast();

  // Sheet state
  const [generateSheetState, setGenerateSheetState] = useState<GenerateSheetState>('minimized');
  
  // Input and conversation state
  const [videoIdeaInput, setVideoIdeaInput] = useState('');
  const [fullConversationText, setFullConversationText] = useState('');
  const fullConversationTextRef = useRef(fullConversationText);
  const [currentSummary, setCurrentSummary] = useState('');
  const [generatedScript, setGeneratedScript] = useState('');

  // Loading states
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [isGeneratingScript, setIsGeneratingScript] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  // Speech recognition states
  const [isActivelyListening, setIsActivelyListening] = useState(false);
  const [isMicButtonPressed, setIsMicButtonPressed] = useState(false);
  const [isAttemptingToListen, setIsAttemptingToListen] = useState(false);

  // Conversation management
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [hasExplicitlyReset, setHasExplicitlyReset] = useState(false);

  // Video configuration
  const [activeVideoForm, setActiveVideoForm] = useState<'long-form' | 'short-form'>('long-form');
  const [activeVideoLengthValue, setActiveVideoLengthValue] = useState<number>(defaultVideoLengthValue);
  const [activeVideoLengthLabel, setActiveVideoLengthLabel] = useState<string>(lengthOptions[defaultVideoLengthValue].label);

  // Refs
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const handleSummarizeIdeaRef = useRef<(text: string) => Promise<void>>(async () => {});
  const handleUserForceStopRef = useRef<() => void>(() => {});
  const isRecognitionActiveRef = useRef(false);

  // Add abort controller ref for streaming
  const abortControllerRef = useRef<AbortController | null>(null);

  // Update fullConversationTextRef when state changes
  useEffect(() => {
    fullConversationTextRef.current = fullConversationText;
  }, [fullConversationText]);

  // Update video length label when value changes
  useEffect(() => {
    const selectedOption = lengthOptions.find(opt => opt.value === activeVideoLengthValue);
    if (selectedOption) {
      setActiveVideoLengthLabel(selectedOption.label);
    }
  }, [activeVideoLengthValue]);

  // Fetch conversations callback
  const fetchConversationsCallback = useCallback(async () => {
    if (!user) return;
    setIsLoadingHistory(true);
    try {
      const convos = await getConversations(user.uid);
      setConversations(convos);
      // Only auto-load the most recent conversation if the user hasn't explicitly reset
      if (!hasExplicitlyReset && !activeConversationId && convos.length > 0 && !fullConversationTextRef.current && !currentSummary && !generatedScript) {
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
    } finally {
      setIsLoadingHistory(false);
    }
  }, [user, activeConversationId, generatedScript, currentSummary, hasExplicitlyReset]);

  // Always fetch conversations when user is available and we navigate to generate page
  useEffect(() => {
    if (user) {
      fetchConversationsCallback();
    }
  }, [user, fetchConversationsCallback]);

  // Additional fetch when sheet is expanded to ensure fresh data
  useEffect(() => {
    if (user && generateSheetState === 'expanded') {
      fetchConversationsCallback();
    }
  }, [user, generateSheetState, fetchConversationsCallback]);

  // Summarize idea function
  const handleSummarizeIdea = useCallback(async (newIdeaChunk: string) => {
    let textThatWillBeSummarized: string;
  
    if (newIdeaChunk.trim()) {
      setActiveConversationId(null);
      setGeneratedScript('');
      setHasExplicitlyReset(false);
      textThatWillBeSummarized = fullConversationTextRef.current
        ? `${fullConversationTextRef.current}\n\n${newIdeaChunk}`
        : newIdeaChunk;
    } else {
      textThatWillBeSummarized = fullConversationTextRef.current;
    }
    
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
      setCurrentSummary('Failed to get summary. Please try again.');
    } finally {
      setIsSummarizing(false);
    }
  }, [setFullConversationText, setCurrentSummary, setActiveConversationId, setGeneratedScript, setIsSummarizing]);

  // Update ref when callback changes
  useEffect(() => {
    handleSummarizeIdeaRef.current = handleSummarizeIdea;
  }, [handleSummarizeIdea]);

  // Force stop speech recognition
  const handleUserForceStop = useCallback(() => {
    // Remove all event listeners
    window.removeEventListener('mouseup', handleUserForceStopRef.current);
    window.removeEventListener('touchend', handleUserForceStopRef.current);
    window.removeEventListener('mouseleave', handleUserForceStopRef.current);
    window.removeEventListener('contextmenu', handleUserForceStopRef.current);
    
    // Reset all states
    setIsMicButtonPressed(false);
    setIsActivelyListening(false);
    setIsAttemptingToListen(false);
    isRecognitionActiveRef.current = false;

    // Stop recognition if it's running
    if (recognitionRef.current) {
      try {
        recognitionRef.current.abort(); // Use abort instead of stop for immediate termination
      } catch (error) {
        console.log("Recognition already stopped");
      }
    }
  }, []);

  // Update ref when callback changes
  useEffect(() => {
    handleUserForceStopRef.current = handleUserForceStop;
  }, [handleUserForceStop]);

  // Initialize speech recognition
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const SpeechRecognitionAPI = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (SpeechRecognitionAPI) {
        const recognitionInstance = new SpeechRecognitionAPI();
        recognitionInstance.continuous = false;
        recognitionInstance.interimResults = false; 
        recognitionInstance.lang = 'en-US';

        recognitionInstance.onstart = () => {
          console.log("Speech recognition started");
          setIsActivelyListening(true);
          setIsAttemptingToListen(false);
          isRecognitionActiveRef.current = true;
        };

        recognitionInstance.onresult = async (event) => {
          let transcript = '';
          if (event.results && event.results[0] && event.results[0][0]) {
            transcript = event.results[0][0].transcript;
          }
          console.log("Speech result:", transcript);
          
          // Immediately stop listening after getting result
          handleUserForceStopRef.current();
          
          // Then process the transcript
          if (transcript) {
            await handleSummarizeIdeaRef.current(transcript);
          }
        };

        recognitionInstance.onerror = (event) => {
          console.log("Speech recognition error:", event.error);
          if (event.error !== 'no-speech' && event.error !== 'aborted') {
             console.error('Speech recognition error', event.error);
          }
          handleUserForceStopRef.current();
        };

        recognitionInstance.onend = () => {
          console.log("Speech recognition ended");
          handleUserForceStopRef.current();
        };
        recognitionRef.current = recognitionInstance;
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
      handleUserForceStopRef.current();
    };
  }, []);

  // Handle text input submit
  const handleTextInputSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const currentInput = videoIdeaInput.trim();
    if (currentInput) {
      setVideoIdeaInput('');
      await handleSummarizeIdea(currentInput);
    }
  };

  // Handle mic button interaction start
  const handleMicButtonInteractionStart = () => {
    if (!recognitionRef.current) {
      console.log("No speech recognition available");
      return;
    }
    
    // Check if we should allow starting
    if (isRecognitionActiveRef.current || isAttemptingToListen || isActivelyListening || isSummarizing || generateSheetState === 'expanded') {
      console.log("Cannot start - already in progress or disabled");
      return;
    }

    try {
      console.log("Starting speech recognition");
      setIsAttemptingToListen(true);
      setIsMicButtonPressed(true);
      
      // Add multiple event listeners to ensure we catch the release
      const stopListening = () => {
        console.log("Stop event triggered");
        handleUserForceStopRef.current();
      };
      
      window.addEventListener('mouseup', stopListening);
      window.addEventListener('touchend', stopListening);
      window.addEventListener('mouseleave', stopListening);
      window.addEventListener('contextmenu', stopListening); // Right-click also stops
      
      // Update the ref to use our local stopListening function
      handleUserForceStopRef.current = () => {
        window.removeEventListener('mouseup', stopListening);
        window.removeEventListener('touchend', stopListening);
        window.removeEventListener('mouseleave', stopListening);
        window.removeEventListener('contextmenu', stopListening);
        
        setIsMicButtonPressed(false);
        setIsActivelyListening(false);
        setIsAttemptingToListen(false);
        isRecognitionActiveRef.current = false;

        if (recognitionRef.current) {
          try {
            recognitionRef.current.abort();
          } catch (error) {
            console.log("Recognition already stopped");
          }
        }
      };
      
      recognitionRef.current.start();
    } catch (error: any) {
      console.error("Error starting recognition:", error);
      handleUserForceStopRef.current();
    }
  };

  // Handle script generation with streaming
  const handleGenerateScript = async () => {
    if (!user) {
      return;
    }

    // Cancel any existing generation
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    let ideaToUseForScript = currentSummary || fullConversationTextRef.current.trim();
    if (!ideaToUseForScript && fullConversationTextRef.current.trim()) { 
      ideaToUseForScript = fullConversationTextRef.current.trim();
    }
    
    if (!ideaToUseForScript) {
      return;
    }
    
    // Clear existing script immediately for reactive generation
    setGeneratedScript('');
    setActiveConversationId(null);
    setIsGeneratingScript(true);
    
    let summaryForScript = currentSummary;

    if (!summaryForScript && fullConversationTextRef.current.trim()) {
      setIsSummarizing(true); 
      try {
        const tempSummaryResult = await summarizeVideoIdea({ input: fullConversationTextRef.current.trim() });
        summaryForScript = tempSummaryResult.summary || "Could not get a summary. Try rephrasing or adding more details.";
        if (summaryForScript) setCurrentSummary(summaryForScript); 
      } catch (error) {
        console.error('Error summarizing idea before script generation:', error);
        setIsGeneratingScript(false);
        setIsSummarizing(false);
        return;
      } finally {
        setIsSummarizing(false);
      }
    }
    
    if (!summaryForScript) { 
        setIsGeneratingScript(false);
        return;
    }

    try {
      // Create new abort controller for this generation
      abortControllerRef.current = new AbortController();
      
      // Call the streaming API
      const response = await fetch('/api/generate-script/stream', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contextSummary: summaryForScript,
          videoForm: activeVideoForm,
          videoLength: activeVideoLengthLabel,
        }),
        signal: abortControllerRef.current.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('No reader available');
      }

      const decoder = new TextDecoder();
      let accumulatedScript = '';

      // Read the stream
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        const chunk = decoder.decode(value, { stream: true });
        accumulatedScript += chunk;
        
        // Update the script in real-time as chunks arrive
        setGeneratedScript(accumulatedScript);
      }

      // Save the completed script
      const savedId = await saveOrUpdateConversation(
        user.uid, 
        summaryForScript, 
        accumulatedScript, 
        fullConversationTextRef.current, 
        null // Always create new conversation for reactive generation
      );
      setActiveConversationId(savedId); 
      await fetchConversationsCallback(); 
      
    } catch (error: any) {
      if (error.name === 'AbortError') {
        console.log('Script generation was cancelled');
      } else {
        console.error('Error generating or saving script:', error);
        toast({
          title: 'Error',
          description: 'Failed to generate script. Please try again.',
          variant: 'destructive',
        });
      }
    } finally {
      setIsGeneratingScript(false);
      abortControllerRef.current = null;
    }
  };

  // Clean up abort controller on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  // Handle new idea
  const handleNewIdea = () => {
    setFullConversationText('');
    setCurrentSummary('');
    setGeneratedScript('');
    setActiveConversationId(null);
    setVideoIdeaInput('');
    setActiveVideoForm('long-form');
    setActiveVideoLengthValue(defaultVideoLengthValue);
    setHasExplicitlyReset(true);
    if (generateSheetState === 'expanded') {
        setGenerateSheetState('minimized');
    }
  };

  // Handle history item click
  const handleHistoryItemClick = async (conversation: Conversation) => {
    if (!user) return;
    setCurrentSummary(conversation.summary);
    setGeneratedScript(conversation.script);
    setFullConversationText(conversation.fullConversation || conversation.summary);
    setActiveConversationId(conversation.id);
    setVideoIdeaInput('');
    setHasExplicitlyReset(false);

    try {
      await updateLastOpened(user.uid, conversation.id);
    } catch (error) {
      console.error("Error updating last opened:", error);
    }
  };

  // Get script preview
  const getScriptPreview = (script: string, lineLimit = 2) => {
    if (!script) return "";
    const lines = script.split('\n');
    return lines.slice(0, lineLimit).join('\n') + (lines.length > lineLimit ? '...' : '');
  };

  return {
    // State
    generateSheetState,
    setGenerateSheetState,
    videoIdeaInput,
    setVideoIdeaInput,
    fullConversationText,
    currentSummary,
    generatedScript,
    isSummarizing,
    isGeneratingScript,
    isLoadingHistory,
    isActivelyListening,
    isMicButtonPressed,
    isAttemptingToListen,
    conversations,
    activeConversationId,
    activeVideoForm,
    setActiveVideoForm,
    activeVideoLengthValue,
    setActiveVideoLengthValue,
    activeVideoLengthLabel,
    lengthOptions,
    
    // Handlers
    handleTextInputSubmit,
    handleMicButtonInteractionStart,
    handleGenerateScript,
    handleNewIdea,
    handleHistoryItemClick,
    getScriptPreview,
    
    // Refs
    fullConversationTextRef,
  };
} 