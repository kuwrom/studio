import React from 'react';
import { cn } from '@/lib/utils';
import { useVideoScriptLogic } from '@/hooks/useVideoScriptLogic';
import AudioWaveVisualizer from '@/components/ui/AudioWaveVisualizer';
import { DescribeArea } from './DescribeArea';
import { GenerateSheet } from './GenerateSheet';

export function VideoScriptAI() {
  const {
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
  } = useVideoScriptLogic();

  return (
    <main className="relative w-full h-screen overflow-hidden bg-background">
      {/* Audio Wave Visualizer */}
      <AudioWaveVisualizer
        isActive={isMicButtonPressed}
        baseBorderThickness={3}
        amplitudeSensitivity={0.1}
        className="fixed inset-0 z-[1000] pointer-events-none"
        borderColor="black"
      />

      {/* Main Content Area - Always visible */}
      <div className="h-full flex flex-col pb-20">
        <DescribeArea
          generateSheetState={generateSheetState}
          videoIdeaInput={videoIdeaInput}
          setVideoIdeaInput={setVideoIdeaInput}
          currentSummary={currentSummary}
          isActivelyListening={isActivelyListening}
          isSummarizing={isSummarizing}
          isAttemptingToListen={isAttemptingToListen}
          handleTextInputSubmit={handleTextInputSubmit}
          handleMicButtonInteractionStart={handleMicButtonInteractionStart}
          handleNewIdea={handleNewIdea}
        />
      </div>

      {/* Bottom Sheet */}
      <GenerateSheet
        generateSheetState={generateSheetState}
        setGenerateSheetState={setGenerateSheetState}
        isActivelyListening={isActivelyListening}
        isSummarizing={isSummarizing}
        isAttemptingToListen={isAttemptingToListen}
        isGeneratingScript={isGeneratingScript}
        isLoadingHistory={isLoadingHistory}
        conversations={conversations}
        activeConversationId={activeConversationId}
        currentSummary={currentSummary}
        generatedScript={generatedScript}
        fullConversationTextRef={fullConversationTextRef}
        activeVideoForm={activeVideoForm}
        setActiveVideoForm={setActiveVideoForm}
        activeVideoLengthValue={activeVideoLengthValue}
        setActiveVideoLengthValue={setActiveVideoLengthValue}
        activeVideoLengthLabel={activeVideoLengthLabel}
        lengthOptions={lengthOptions}
        handleGenerateScript={handleGenerateScript}
        handleHistoryItemClick={handleHistoryItemClick}
        getScriptPreview={getScriptPreview}
      />
    </main>
  );
} 