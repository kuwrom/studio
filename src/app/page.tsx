
"use client";

import { useState, useEffect, useRef, FormEvent, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Mic, Send, Sparkles, ArrowLeft, ArrowRight, Loader2 } from 'lucide-react';
import { summarizeVideoIdea } from '@/ai/flows/summarize-video-idea';
import { generateVideoScript } from '@/ai/flows/generate-video-script';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

type View = 'input' | 'script';

// Extend Window interface for SpeechRecognition
declare global {
  interface Window {
    SpeechRecognition: typeof SpeechRecognition;
    webkitSpeechRecognition: typeof SpeechRecognition;
  }
}

export default function VideoScriptAIPage() {
  const [currentView, setCurrentView] = useState<View>('input');
  const [videoIdeaInput, setVideoIdeaInput] = useState('');
  const [fullConversationText, setFullConversationText] = useState('');
  const [currentSummary, setCurrentSummary] = useState('');
  const [generatedScript, setGeneratedScript] = useState('');
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [isGeneratingScript, setIsGeneratingScript] = useState(false);
  const [isListening, setIsListening] = useState(false);
  
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const { toast } = useToast();

  const handleSummarizeIdea = useCallback(async (newIdeaChunk: string) => {
    if (!newIdeaChunk.trim()) {
      toast({ title: 'Input Required', description: 'Please provide some input.', variant: 'destructive' });
      return;
    }
    setIsSummarizing(true);
    
    // `fullConversationText` here is from the closure of the useCallback, 
    // which is updated whenever fullConversationText state changes.
    const updatedConversation = fullConversationText
      ? `${fullConversationText}\n\n${newIdeaChunk}`
      : newIdeaChunk;
    
    setFullConversationText(updatedConversation);

    try {
      const result = await summarizeVideoIdea({ input: updatedConversation });
      setCurrentSummary(result.summary);
      toast({ title: 'Understanding Updated!', description: 'AI has processed your latest input and updated the summary.' });
    } catch (error) {
      console.error('Error summarizing idea:', error);
      toast({ title: 'Error Summarizing', description: 'Could not process your input. Please try again.', variant: 'destructive' });
    } finally {
      setIsSummarizing(false);
    }
  }, [fullConversationText, toast]); // Dependencies for useCallback

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const SpeechRecognitionAPI = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (SpeechRecognitionAPI) {
        const recognitionInstance = new SpeechRecognitionAPI();
        recognitionInstance.continuous = false;
        recognitionInstance.interimResults = false;
        recognitionInstance.lang = 'en-US';

        recognitionInstance.onstart = () => {
          setIsListening(true);
          toast({ title: "Listening...", description: "Speak your video idea." });
        };

        // This onresult will now use the latest `handleSummarizeIdea`
        // because `useEffect` re-runs when `handleSummarizeIdea` changes.
        recognitionInstance.onresult = async (event) => {
          const transcript = event.results[0][0].transcript;
          await handleSummarizeIdea(transcript);
        };

        recognitionInstance.onerror = (event) => {
          console.error('Speech recognition error', event.error);
          toast({
            title: 'Speech Recognition Error',
            description: event.error === 'no-speech' ? 'No speech detected. Try again.' : `Error: ${event.error}`,
            variant: 'destructive',
          });
          setIsListening(false); 
        };

        recognitionInstance.onend = () => {
          setIsListening(false);
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
        recognitionRef.current.stop();
        // Clean up event handlers to prevent memory leaks or calls on stale instances
        recognitionRef.current.onstart = null;
        recognitionRef.current.onresult = null;
        recognitionRef.current.onerror = null;
        recognitionRef.current.onend = null;
      }
    };
  }, [toast, handleSummarizeIdea]); // Added handleSummarizeIdea as a dependency

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

  const toggleListening = () => {
    if (!recognitionRef.current) {
        toast({ title: 'Speech API not ready', description: 'Speech recognition is not available.', variant: 'destructive' });
        return;
    }
    if (isListening) {
      recognitionRef.current.stop();
    } else {
      if (isSummarizing) {
        toast({ title: 'Processing...', description: 'Please wait for the current idea to be summarized.', variant: 'default' });
        return;
      }
      recognitionRef.current.start();
    }
  };

  const handleGenerateScript = async () => {
    if (!currentSummary.trim()) {
      toast({ title: 'Summary Required', description: 'First, provide an idea for summarization.', variant: 'destructive' });
      return;
    }
    setIsGeneratingScript(true);
    setGeneratedScript(''); 
    try {
      const result = await generateVideoScript({ contextSummary: currentSummary });
      setGeneratedScript(result.script);
      toast({ title: 'Script Generated!', description: result.progress || 'Your video script is ready.' });
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
        <CardTitle className="text-2xl sm:text-3xl font-bold text-primary">Video Idea Input</CardTitle>
        <CardDescription>Describe your video idea using text or voice. The AI will update its understanding as you add more details.</CardDescription>
      </CardHeader>
      <CardContent className="flex-grow p-4 sm:p-6 overflow-y-auto">
        <Label htmlFor="aiSummary" className="text-lg font-semibold mb-2 block">AI's Cumulative Understanding:</Label>
        <div
          id="aiSummary"
          className="w-full min-h-[200px] p-3 rounded-md border bg-card text-card-foreground shadow-sm text-lg whitespace-pre-wrap"
          aria-live="polite"
        >
          {isSummarizing && !currentSummary ? <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto my-4" /> : (currentSummary || "Your cumulative idea summary will appear here after you provide some input...")}
          {isSummarizing && currentSummary && <span className="text-sm text-muted-foreground block mt-2">Updating summary...</span>}
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
            disabled={isListening || isSummarizing}
          />
          <Button type="submit" size="icon" aria-label="Submit text idea" disabled={isListening || isSummarizing || !videoIdeaInput.trim()}>
            {isSummarizing && !isListening ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
          </Button>
        </form>
        <div className="flex items-center justify-between">
           <Button onClick={toggleListening} variant={isListening ? "destructive" : "outline"} className="gap-2" disabled={isSummarizing}>
            {isListening ? <Loader2 className="h-5 w-5 animate-spin" /> : <Mic className="h-5 w-5" />}
            {isListening ? 'Stop Listening' : 'Speak Idea'}
          </Button>
          <Button 
            onClick={() => {
              if (currentSummary) {
                navigateTo('script');
              } else {
                toast({title: "No Summary Yet", description: "Please provide an idea first, or generate the script directly if you have a summary.", variant: "default"});
              }
            }} 
            variant="default" 
            className="gap-2 bg-primary hover:bg-primary/90 text-primary-foreground"
            disabled={isGeneratingScript || !currentSummary.trim()} 
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
        <Button onClick={handleGenerateScript} disabled={isGeneratingScript || !currentSummary.trim()} className="gap-2 bg-accent hover:bg-accent/90 text-accent-foreground">
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

  return (
    <main className="relative w-full h-screen overflow-hidden bg-background">
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
    
    
