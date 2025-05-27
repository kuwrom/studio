import React from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { CardHeader, CardTitle } from '@/components/ui/card';
import { Send, RotateCcw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { GenerateSheetState } from '@/hooks/useVideoScriptLogic';

interface DescribeAreaProps {
  generateSheetState: GenerateSheetState;
  videoIdeaInput: string;
  setVideoIdeaInput: (value: string) => void;
  currentSummary: string;
  isActivelyListening: boolean;
  isSummarizing: boolean;
  isAttemptingToListen: boolean;
  handleTextInputSubmit: (e: React.FormEvent) => void;
  handleMicButtonInteractionStart: () => void;
  handleNewIdea: () => void;
}

export function DescribeArea({
  generateSheetState,
  videoIdeaInput,
  setVideoIdeaInput,
  currentSummary,
  isActivelyListening,
  isSummarizing,
  isAttemptingToListen,
  handleTextInputSubmit,
  handleMicButtonInteractionStart,
  handleNewIdea,
}: DescribeAreaProps) {
  const isDisabled = isAttemptingToListen || isActivelyListening || isSummarizing || generateSheetState === 'expanded';

  return (
    <div className="flex-grow flex flex-col p-4 sm:p-6 bg-transparent relative h-full">
      <CardHeader className="p-0 mb-4 flex flex-row items-center justify-between">
        <CardTitle className="text-2xl sm:text-3xl font-normal text-muted-foreground opacity-60">
          Storyy Idea
        </CardTitle>
        <Button
          variant="ghost"
          size="icon"
          onClick={handleNewIdea}
          aria-label="Start new idea"
          className="text-muted-foreground hover:text-foreground"
        >
          <RotateCcw className="h-5 w-5" />
        </Button>
      </CardHeader>

      <div
        className={cn(
          "flex-grow flex flex-col items-center justify-center text-center min-h-[200px] sm:min-h-[300px] select-none",
          !isDisabled && "cursor-pointer"
        )} 
        onMouseDown={(e) => {
          if (!isDisabled) {
            e.preventDefault();
            handleMicButtonInteractionStart();
          }
        }}
        onTouchStart={(e) => {
          if (!isDisabled) {
            e.preventDefault();
            // Prevent the touch from triggering mouse events
            e.stopPropagation();
            handleMicButtonInteractionStart();
          }
        }}
        onContextMenu={(e) => {
          e.preventDefault(); // Prevent right-click menu
        }}
        aria-label="Press and hold in this area to speak your video idea, or type below"
        role="button"
        tabIndex={!isDisabled ? 0 : -1}
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

      <form onSubmit={handleTextInputSubmit} className="mt-auto p-2 bg-card shadow-lg rounded-lg relative">
        <div className="flex items-center gap-2 sm:gap-3">
          <Textarea
            value={videoIdeaInput}
            onChange={(e) => setVideoIdeaInput(e.target.value)}
            placeholder="Type your video idea chunk here..."
            className="flex-grow text-base border-0 focus-visible:ring-0 focus-visible:ring-offset-0 resize-none min-h-[40px] max-h-[120px] pr-12"
            rows={1}
            disabled={isDisabled}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleTextInputSubmit(e as any);
              }
            }}
          />
          {videoIdeaInput.trim() && !isDisabled && (
            <Button
              type="submit"
              size="icon"
              variant="ghost"
              className="absolute right-3 bottom-3 h-8 w-8 text-primary hover:bg-primary/10"
              aria-label="Submit text idea"
              disabled={isDisabled || !videoIdeaInput.trim()}
            >
              <Send className="h-5 w-5" />
            </Button>
          )}
        </div>
      </form>
    </div>
  );
} 