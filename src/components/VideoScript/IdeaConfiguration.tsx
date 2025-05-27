import React from 'react';
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";

interface IdeaConfigurationProps {
  activeVideoForm: 'long-form' | 'short-form';
  setActiveVideoForm: (value: 'long-form' | 'short-form') => void;
  activeVideoLengthValue: number;
  setActiveVideoLengthValue: (value: number) => void;
  activeVideoLengthLabel: string;
  lengthOptions: Array<{ value: number; label: string }>;
}

export function IdeaConfiguration({
  activeVideoForm,
  setActiveVideoForm,
  activeVideoLengthValue,
  setActiveVideoLengthValue,
  activeVideoLengthLabel,
  lengthOptions,
}: IdeaConfigurationProps) {
  return (
    <div className="space-y-3 mb-3 p-1 border-b pb-3">
      <div>
        <Label htmlFor="video-form" className="text-xs text-muted-foreground">Video Form</Label>
        <Tabs
          id="video-form"
          value={activeVideoForm}
          onValueChange={(value) => setActiveVideoForm(value as 'long-form' | 'short-form')}
          className="w-full mt-1"
        >
          <TabsList className="grid w-full grid-cols-2 h-9">
            <TabsTrigger value="long-form" className="text-xs">Long-form</TabsTrigger>
            <TabsTrigger value="short-form" className="text-xs">Short-form</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>
      <div>
        <div className="flex justify-between items-center mb-1">
          <Label htmlFor="video-length" className="text-xs text-muted-foreground">Video Length</Label>
          <span className="text-xs text-muted-foreground">{activeVideoLengthLabel}</span>
        </div>
        <Slider
          id="video-length"
          min={0}
          max={lengthOptions.length - 1}
          step={1}
          value={[activeVideoLengthValue]}
          onValueChange={(value) => setActiveVideoLengthValue(value[0])}
          className="w-full"
        />
      </div>
    </div>
  );
} 