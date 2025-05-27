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
    console.log("=== handleSummarizeIdea called ===");
    console.log("Input chunk:", newIdeaChunk);
    console.log("Current activeConversationId:", activeConversationId);
    
    let textThatWillBeSummarized: string;
  
    if (newIdeaChunk.trim()) {
      // If we have an active conversation, we should update it, not create a new one
      if (!activeConversationId) {
        setGeneratedScript('');
      }
      setHasExplicitlyReset(false);
      textThatWillBeSummarized = fullConversationTextRef.current
        ? `${fullConversationTextRef.current}\n\n${newIdeaChunk}`
        : newIdeaChunk;
    } else {
      textThatWillBeSummarized = fullConversationTextRef.current;
    }
    
    console.log("Text to summarize:", textThatWillBeSummarized);
    setFullConversationText(textThatWillBeSummarized);
  
    if (!textThatWillBeSummarized.trim()) {
      setCurrentSummary('');
      setIsSummarizing(false);
      return;
    }
    
    console.log("Starting summarization...");
    setIsSummarizing(true);
    try {
      const result = await summarizeVideoIdea({ input: textThatWillBeSummarized });
      console.log("Summarization result:", result);
      const newSummary = result.summary || "Could not get a summary. Try rephrasing or adding more details.";
      setCurrentSummary(newSummary);
      
      // Save to Firebase immediately after getting a summary
      if (user && newSummary) {
        console.log("Saving to Firebase...");
        try {
          const savedId = await saveOrUpdateConversation(
            user.uid,
            newSummary,
            generatedScript || '', // Empty script if none exists yet
            textThatWillBeSummarized,
            activeConversationId // Will create new if null
          );
          
          // If this was a new conversation, set it as active
          if (!activeConversationId) {
            console.log("Created new conversation with ID:", savedId);
            setActiveConversationId(savedId);
          } else {
            console.log("Updated existing conversation:", savedId);
          }
          
          await fetchConversationsCallback();
        } catch (saveError) {
          console.error('Error saving conversation:', saveError);
          toast({
            title: 'Error',
            description: 'Failed to save conversation. Please try again.',
            variant: 'destructive',
          });
        }
      }
    } catch (error) {
      console.error('Error summarizing idea:', error);
      setCurrentSummary('Failed to get summary. Please try again.');
    } finally {
      console.log("Summarization complete");
      setIsSummarizing(false);
    }
  }, [activeConversationId, generatedScript, user, fetchConversationsCallback, toast]);

  // Update ref when callback changes
  useEffect(() => {
    handleSummarizeIdeaRef.current = handleSummarizeIdea;
  }, [handleSummarizeIdea]);

  // Force stop speech recognition
  const handleUserForceStop = useCallback(() => {
    console.log("=== FORCE STOP CALLED ===");
    
    // Remove all possible event listeners
    const handleStop = handleUserForceStopRef.current;
    if (handleStop && typeof handleStop === 'function') {
      window.removeEventListener('mouseup', handleStop);
      window.removeEventListener('touchend', handleStop);
      document.removeEventListener('mouseup', handleStop);
      document.removeEventListener('touchend', handleStop);
    }
    
    // Reset all states
    isRecognitionActiveRef.current = false;
    setIsMicButtonPressed(false);
    setIsActivelyListening(false);
    setIsAttemptingToListen(false);

    // Stop recognition if it's running
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
        console.log("Recognition stopped");
      } catch (error) {
        console.log("Recognition already stopped or error:", error);
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
      console.log("SpeechRecognitionAPI available:", !!SpeechRecognitionAPI);
      
      if (SpeechRecognitionAPI) {
        const recognitionInstance = new SpeechRecognitionAPI();
        recognitionInstance.continuous = false;
        recognitionInstance.interimResults = false; 
        recognitionInstance.lang = 'en-US';

        recognitionInstance.onstart = () => {
          console.log("=== Speech recognition STARTED ===");
          setIsActivelyListening(true);
          setIsAttemptingToListen(false);
          isRecognitionActiveRef.current = true;
        };

        recognitionInstance.onresult = async (event) => {
          console.log("=== Speech recognition RESULT ===");
          console.log("Results length:", event.results.length);
          
          let transcript = '';
          if (event.results && event.results[0] && event.results[0][0]) {
            transcript = event.results[0][0].transcript;
            console.log("Transcript:", transcript);
            console.log("Confidence:", event.results[0][0].confidence);
          }
          
          // Process the transcript
          if (transcript && transcript.trim()) {
            console.log("Processing transcript...");
            // First stop the recognition
            handleUserForceStopRef.current();
            // Then process
            await handleSummarizeIdeaRef.current(transcript);
          } else {
            console.log("No valid transcript received");
            handleUserForceStopRef.current();
          }
        };

        recognitionInstance.onerror = (event) => {
          console.log("=== Speech recognition ERROR ===", event.error);
          
          switch (event.error) {
            case 'no-speech':
              console.log("No speech detected");
              break;
            case 'aborted':
              console.log("Recognition aborted");
              break;
            case 'not-allowed':
              console.error('Microphone access denied');
              toast({
                title: 'Microphone Access Required',
                description: 'Please allow microphone access in your browser settings to use voice input.',
                variant: 'destructive',
              });
              break;
            case 'network':
              console.error('Network error');
              toast({
                title: 'Network Error',
                description: 'Please check your internet connection and try again.',
                variant: 'destructive',
              });
              break;
            default:
              console.error('Speech recognition error:', event.error);
              toast({
                title: 'Speech Recognition Error',
                description: `An error occurred: ${event.error}`,
                variant: 'destructive',
              });
          }
          
          handleUserForceStopRef.current();
        };

        recognitionInstance.onend = () => {
          console.log("=== Speech recognition ENDED ===");
          handleUserForceStopRef.current();
        };
        recognitionRef.current = recognitionInstance;
        console.log("Speech recognition initialized successfully");
      } else {
        console.error("Speech Recognition API not available in this browser");
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
      // Pass true to preserve active conversation if one is selected
      await handleSummarizeIdea(currentInput);
    }
  };

  // Handle mic button interaction start
  const handleMicButtonInteractionStart = async () => {
    console.log("=== PUSH TO TALK START ===");
    console.log("1. recognitionRef.current exists:", !!recognitionRef.current);
    console.log("2. Current states:", {
      isRecognitionActiveRef: isRecognitionActiveRef.current,
      isAttemptingToListen,
      isActivelyListening,
      isSummarizing,
      generateSheetState
    });
    
    if (!recognitionRef.current) {
      console.error("No speech recognition available - API not initialized");
      alert("Speech recognition not available in this browser");
      return;
    }
    
    // Simplified check - only prevent if already active
    if (isRecognitionActiveRef.current) {
      console.log("Recognition already active, skipping");
      return;
    }

    // Prevent starting if sheet is expanded
    if (generateSheetState === 'expanded') {
      console.log("Cannot start - sheet is expanded");
      return;
    }

    try {
      // Request microphone permission first
      console.log("3. Requesting microphone permission...");
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        // Stop the stream immediately - we just needed to request permission
        stream.getTracks().forEach(track => track.stop());
        console.log("Microphone permission granted");
      } catch (permissionError) {
        console.error("Microphone permission denied:", permissionError);
        alert("Please allow microphone access to use voice input");
        return;
      }
      
      console.log("4. Setting up recognition...");
      
      // Set flags immediately
      isRecognitionActiveRef.current = true;
      setIsAttemptingToListen(true);
      setIsMicButtonPressed(true);
      
      // Setup stop handler
      const handleStop = (e?: Event) => {
        console.log("=== STOP TRIGGERED ===");
        if (e) {
          e.preventDefault();
          e.stopPropagation();
        }
        
        // Clean up all listeners
        window.removeEventListener('mouseup', handleStop);
        window.removeEventListener('touchend', handleStop);
        document.removeEventListener('mouseup', handleStop);
        document.removeEventListener('touchend', handleStop);
        
        // Reset states
        isRecognitionActiveRef.current = false;
        setIsMicButtonPressed(false);
        setIsActivelyListening(false);
        setIsAttemptingToListen(false);
        
        // Stop recognition
        if (recognitionRef.current) {
          try {
            console.log("5. Stopping recognition");
            recognitionRef.current.stop();
          } catch (error) {
            console.log("Recognition stop error:", error);
          }
        }
      };
      
      // Add listeners to both window and document to ensure we catch the event
      window.addEventListener('mouseup', handleStop);
      window.addEventListener('touchend', handleStop);
      document.addEventListener('mouseup', handleStop);
      document.addEventListener('touchend', handleStop);
      
      // Store the handler for external access
      handleUserForceStopRef.current = handleStop;
      
      // Start recognition
      console.log("6. Starting recognition...");
      recognitionRef.current.start();
      
    } catch (error: any) {
      console.error("Error in handleMicButtonInteractionStart:", error);
      alert(`Error starting speech recognition: ${error.message}`);
      
      // Clean up on error
      isRecognitionActiveRef.current = false;
      setIsMicButtonPressed(false);
      setIsActivelyListening(false);
      setIsAttemptingToListen(false);
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
          fullContext: fullConversationTextRef.current,
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
        activeConversationId // Use existing conversation ID if available
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