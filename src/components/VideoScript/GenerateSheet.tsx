import React, { useRef, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Sparkles, Mic, LogOut } from 'lucide-react';
import { cn } from '@/lib/utils';
import { GenerateSheetState } from '@/hooks/useVideoScriptLogic';
import { IdeaConfiguration } from './IdeaConfiguration';
import { useAuth } from '@/contexts/AuthContext';
import type { Conversation } from '@/services/conversationService';
import { ScriptDisplay } from './ScriptDisplay';

const MINIMIZED_HEIGHT = 80;
const EXPANDED_HEIGHT = 0.9; // 90% of viewport

interface GenerateSheetProps {
  generateSheetState: GenerateSheetState;
  setGenerateSheetState: (state: GenerateSheetState) => void;
  isActivelyListening: boolean;
  isSummarizing: boolean;
  isAttemptingToListen: boolean;
  isGeneratingScript: boolean;
  isLoadingHistory: boolean;
  conversations: Conversation[];
  activeConversationId: string | null;
  currentSummary: string;
  generatedScript: string;
  fullConversationTextRef: React.RefObject<string>;
  activeVideoForm: 'long-form' | 'short-form';
  setActiveVideoForm: (value: 'long-form' | 'short-form') => void;
  activeVideoLengthValue: number;
  setActiveVideoLengthValue: (value: number) => void;
  activeVideoLengthLabel: string;
  lengthOptions: Array<{ value: number; label: string }>;
  handleGenerateScript: () => void;
  handleHistoryItemClick: (conversation: Conversation) => void;
  getScriptPreview: (script: string, lineLimit?: number) => string;
}

export function GenerateSheet({
  generateSheetState,
  setGenerateSheetState,
  isActivelyListening,
  isSummarizing,
  isAttemptingToListen,
  isGeneratingScript,
  isLoadingHistory,
  conversations,
  activeConversationId,
  currentSummary,
  generatedScript,
  fullConversationTextRef,
  activeVideoForm,
  setActiveVideoForm,
  activeVideoLengthValue,
  setActiveVideoLengthValue,
  activeVideoLengthLabel,
  lengthOptions,
  handleGenerateScript,
  handleHistoryItemClick,
  getScriptPreview,
}: GenerateSheetProps) {
  const { signOut } = useAuth();
  const [isDragging, setIsDragging] = useState(false);
  const [dragStartY, setDragStartY] = useState(0);
  const [currentY, setCurrentY] = useState(0);
  const sheetRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  const isSheetContentDisabled = isActivelyListening || isSummarizing || isAttemptingToListen;

  // Auto-expand when no content
  // useEffect(() => {
  //   if (!isLoadingHistory && conversations.length === 0 && !activeConversationId && !currentSummary && !generatedScript) {
  //     setGenerateSheetState('expanded');
  //   }
  // }, [isLoadingHistory, conversations.length, activeConversationId, currentSummary, generatedScript, setGenerateSheetState]);

  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.target instanceof Element && e.target.closest('[data-scrollable]')) {
      return; // Don't handle if touching scrollable content
    }
    setIsDragging(true);
    setDragStartY(e.touches[0].clientY);
    setCurrentY(0);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging) return;
    
    const deltaY = e.touches[0].clientY - dragStartY;
    setCurrentY(deltaY);
    
    // Live preview of drag
    if (sheetRef.current) {
      sheetRef.current.style.transition = 'none';
      sheetRef.current.style.transform = `translateY(${Math.max(0, deltaY)}px)`;
    }
  };

  const handleTouchEnd = () => {
    if (!isDragging) return;
    setIsDragging(false);
    
    // Snap to expanded or minimized based on drag distance
    const threshold = window.innerHeight * 0.2;
    if (currentY > threshold) {
      setGenerateSheetState('minimized');
    }
    
    // Reset transform
    if (sheetRef.current) {
      sheetRef.current.style.transition = '';
      sheetRef.current.style.transform = '';
    }
    
    setCurrentY(0);
  };

  const sheetHeight = generateSheetState === 'expanded' 
    ? `${EXPANDED_HEIGHT * 100}vh` 
    : `${MINIMIZED_HEIGHT}px`;

  return (
    <>
      {/* Backdrop */}
      {generateSheetState === 'expanded' && (
        <div 
          className="fixed inset-0 bg-black/50 z-40 transition-opacity duration-300"
          onClick={() => setGenerateSheetState('minimized')}
        />
      )}
      
      {/* Bottom Sheet */}
      <div
        ref={sheetRef}
        className={cn(
          "fixed bottom-0 left-0 right-0 bg-card shadow-2xl rounded-t-2xl z-50 transition-all duration-300",
          "will-change-transform"
        )}
        style={{
          height: sheetHeight,
          transform: generateSheetState === 'minimized' ? 'translateY(0)' : 'translateY(0)',
        }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {/* Drag Handle */}
        <div className="flex justify-center py-2 cursor-grab active:cursor-grabbing">
          <div className="w-10 h-1 bg-muted-foreground/30 rounded-full" />
        </div>

        {generateSheetState === 'minimized' ? (
          <div
            onClick={() => !isSheetContentDisabled && setGenerateSheetState('expanded')}
            className="flex items-center justify-center h-[calc(100%-16px)] cursor-pointer"
            role="button"
            aria-label="Expand to view and generate script"
          >
            <span className="text-2xl sm:text-3xl font-normal text-muted-foreground opacity-60">Generate</span>
          </div>
        ) : (
          <div className="flex flex-col h-[calc(100%-16px)]">
            <div className="flex items-center justify-between px-4 py-2 border-b">
              <div className="w-10" />
              <h2 className="text-xl font-normal text-muted-foreground">Generate</h2>
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
            </div>

            {/* Scrollable Content */}
            <div 
              ref={contentRef}
              className="flex-1 overflow-y-auto px-4 py-4 space-y-4"
              data-scrollable="true"
            >
              {isLoadingHistory && (
                <p className="text-muted-foreground text-center">Loading history...</p>
              )}
              
              {!isLoadingHistory && conversations.length === 0 && !activeConversationId && !currentSummary && !generatedScript && (
                <p className="text-muted-foreground text-center">
                  No past scripts found. Describe your idea first or generate a new script.
                </p>
              )}
              
              {(!activeConversationId && (currentSummary || generatedScript)) && (
                <Card className="mb-4 border-primary ring-2 ring-primary shadow-lg">
                  <CardHeader>
                    <IdeaConfiguration
                      activeVideoForm={activeVideoForm}
                      setActiveVideoForm={setActiveVideoForm}
                      activeVideoLengthValue={activeVideoLengthValue}
                      setActiveVideoLengthValue={setActiveVideoLengthValue}
                      activeVideoLengthLabel={activeVideoLengthLabel}
                      lengthOptions={lengthOptions}
                    />
                    <CardTitle className="text-lg">{currentSummary || "New Idea In Progress"}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="w-full text-base bg-background text-foreground shadow-sm p-3 rounded-md border border-input min-h-[80px] relative">
                      {generatedScript ? (
                        <ScriptDisplay content={generatedScript} />
                      ) : (
                        isGeneratingScript ? "" : <span className="text-muted-foreground">Script will appear here after generation.</span>
                      )}
                      {isGeneratingScript && (
                        <span className="inline-flex">
                          <span className="animate-pulse">▊</span>
                        </span>
                      )}
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
                    {activeConversationId === convo.id && (
                      <IdeaConfiguration
                        activeVideoForm={activeVideoForm}
                        setActiveVideoForm={setActiveVideoForm}
                        activeVideoLengthValue={activeVideoLengthValue}
                        setActiveVideoLengthValue={setActiveVideoLengthValue}
                        activeVideoLengthLabel={activeVideoLengthLabel}
                        lengthOptions={lengthOptions}
                      />
                    )}
                    <CardTitle className="text-lg">{convo.summary}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-sm text-muted-foreground">
                      {activeConversationId === convo.id ? (
                        <>
                          <ScriptDisplay content={convo.script} />
                          {isGeneratingScript && (
                            <span className="inline-flex">
                              <span className="animate-pulse">▊</span>
                            </span>
                          )}
                        </>
                      ) : (
                        <div className="line-clamp-2">
                          <ScriptDisplay content={getScriptPreview(convo.script)} />
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Fixed Generate Button */}
            <div className="p-4 border-t border-border bg-card">
              <Button
                onClick={handleGenerateScript}
                disabled={isGeneratingScript || isSheetContentDisabled || (!currentSummary.trim() && !fullConversationTextRef.current?.trim())}
                className="w-full gap-2 bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white text-lg py-3"
              >
                {isGeneratingScript ? <Mic className="h-5 w-5 animate-spin" /> : <Sparkles className="h-5 w-5" />}
                Generate
              </Button>
              {fullConversationTextRef.current && (
                <p className="text-xs text-muted-foreground text-center mt-2">
                  Using full context including all details and links
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </>
  );
} 