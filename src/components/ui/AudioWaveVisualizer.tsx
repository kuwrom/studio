
"use client";

import React, { useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';

interface AudioWaveVisualizerProps {
  isListening: boolean;
  className?: string;
  waveColor?: string; 
  amplitudeFactor?: number;
}

const AudioWaveVisualizer: React.FC<AudioWaveVisualizerProps> = ({
  isListening,
  className,
  waveColor = 'hsl(200 100% 70%)', // Light blue
  amplitudeFactor = 0.6,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const animationFrameIdRef = useRef<number | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    const initializeAudio = async () => {
      try {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          console.warn('getUserMedia not supported on this browser.');
          return;
        }

        mediaStreamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
        analyserRef.current = audioContextRef.current.createAnalyser();
        analyserRef.current.fftSize = 256; // Controls detail, 256 is good for simple waves

        sourceRef.current = audioContextRef.current.createMediaStreamSource(mediaStreamRef.current);
        sourceRef.current.connect(analyserRef.current);
        // No need to connect analyser to destination if only visualizing

        startDrawing();
      } catch (err) {
        console.error('Error initializing audio for visualizer:', err);
        // Optionally, inform the user via a toast or message
      }
    };

    const cleanupAudio = () => {
      if (animationFrameIdRef.current) {
        cancelAnimationFrame(animationFrameIdRef.current);
        animationFrameIdRef.current = null;
      }
      if (sourceRef.current) {
        sourceRef.current.disconnect();
        sourceRef.current = null;
      }
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach(track => track.stop());
        mediaStreamRef.current = null;
      }
      if (analyserRef.current) {
        analyserRef.current = null;
      }
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        audioContextRef.current.close().catch(console.error);
        audioContextRef.current = null;
      }
      // Clear canvas
      const canvas = canvasRef.current;
      if (canvas) {
        const context = canvas.getContext('2d');
        if (context) {
          context.clearRect(0, 0, canvas.width, canvas.height);
        }
      }
    };

    if (isListening) {
      initializeAudio();
    } else {
      cleanupAudio();
    }

    return () => {
      cleanupAudio(); // Ensure cleanup on unmount
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isListening]); // Dependency: isListening starts/stops visualization

  const startDrawing = () => {
    if (!analyserRef.current || !canvasRef.current || !audioContextRef.current) {
      return;
    }

    const analyser = analyserRef.current;
    const canvas = canvasRef.current;
    const canvasCtx = canvas.getContext('2d');

    if (!canvasCtx) return;

    const bufferLength = analyser.frequencyBinCount; // fftSize / 2
    const dataArray = new Uint8Array(bufferLength);

    const drawWave = () => {
      animationFrameIdRef.current = requestAnimationFrame(drawWave);
      if (!analyserRef.current) return; // Check if analyser still exists

      analyserRef.current.getByteTimeDomainData(dataArray);

      canvasCtx.clearRect(0, 0, canvas.width, canvas.height);
      canvasCtx.lineWidth = 3; // Bold line for the wave
      canvasCtx.strokeStyle = waveColor;
      canvasCtx.beginPath();

      const sliceWidth = (canvas.width * 1.0) / bufferLength;
      let x = 0;

      for (let i = 0; i < bufferLength; i++) {
        const v = dataArray[i] / 128.0; // dataArray values are 0-255
        const yOffset = (canvas.height * (1 - amplitudeFactor)) / 2;
        const y = (v * canvas.height * amplitudeFactor) / 2 + yOffset;

        if (i === 0) {
          canvasCtx.moveTo(x, y);
        } else {
          canvasCtx.lineTo(x, y);
        }
        x += sliceWidth;
      }
      canvasCtx.stroke();
    };
    drawWave();
  };
  
  // Resize canvas with its parent
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !canvas.parentElement) return;

    const parent = canvas.parentElement;
    const resizeObserver = new ResizeObserver(() => {
      if(canvas && parent) {
        canvas.width = parent.offsetWidth;
        canvas.height = parent.offsetHeight;
      }
    });
    resizeObserver.observe(parent);
    canvas.width = parent.offsetWidth;
    canvas.height = parent.offsetHeight;
    
    return () => resizeObserver.disconnect();
  }, []);


  return <canvas ref={canvasRef} className={cn('w-full h-full', className)} />;
};

export default AudioWaveVisualizer;
