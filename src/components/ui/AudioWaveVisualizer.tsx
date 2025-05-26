
"use client";

import React, { useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';

interface ReactiveBorderVisualizerProps {
  isActive: boolean;
  className?: string;
  borderColor?: string;
  baseBorderThickness?: number;
  amplitudeSensitivity?: number; 
}

const AudioWaveVisualizer: React.FC<ReactiveBorderVisualizerProps> = ({
  isActive,
  className,
  borderColor = 'hsl(276 87% 53.3%)', // Default to a theme-like purple/blue
  baseBorderThickness = 3, 
  amplitudeSensitivity = 0.08, 
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const animationFrameIdRef = useRef<number | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const dataArrayRef = useRef<Uint8Array | null>(null);

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
        analyserRef.current.fftSize = 256; 
        analyserRef.current.smoothingTimeConstant = 0.3; // Some smoothing

        sourceRef.current = audioContextRef.current.createMediaStreamSource(mediaStreamRef.current);
        sourceRef.current.connect(analyserRef.current);
        
        dataArrayRef.current = new Uint8Array(analyserRef.current.frequencyBinCount);
        startDrawing();

      } catch (err) {
        console.error('Error initializing audio for visualizer:', err);
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
      dataArrayRef.current = null;
      
      const canvas = canvasRef.current;
      if (canvas) {
        const context = canvas.getContext('2d');
        if (context) {
          context.clearRect(0, 0, canvas.width, canvas.height);
        }
      }
    };

    if (isActive) {
      initializeAudio();
    } else {
      cleanupAudio();
    }

    return () => {
      cleanupAudio(); 
    };
  }, [isActive]); 

  const startDrawing = () => {
    const canvas = canvasRef.current;
    if (!analyserRef.current || !canvas || !audioContextRef.current) {
      return;
    }
    const canvasCtx = canvas.getContext('2d');
    if (!canvasCtx) return;

    const drawBorder = () => {
      animationFrameIdRef.current = requestAnimationFrame(drawBorder);
      if (!analyserRef.current || !dataArrayRef.current || !canvasCtx || !canvasRef.current) return;

      analyserRef.current.getByteTimeDomainData(dataArrayRef.current);

      let sumOfSquares = 0;
      for (let i = 0; i < dataArrayRef.current.length; i++) {
        const value = (dataArrayRef.current[i] - 128) / 128.0; // Normalize to -1 to 1
        sumOfSquares += value * value;
      }
      const rms = Math.sqrt(sumOfSquares / dataArrayRef.current.length); // Root Mean Square
      
      // RMS is 0 to 1. Scale it to affect thickness.
      const dynamicThicknessAddition = rms * baseBorderThickness * amplitudeSensitivity * 100; // Tuned factor
      const currentBorderThickness = Math.max(1, baseBorderThickness + dynamicThicknessAddition); // Ensure minimum thickness

      canvasCtx.clearRect(0, 0, canvas.width, canvas.height);
      canvasCtx.fillStyle = borderColor;

      // Top border
      canvasCtx.fillRect(0, 0, canvas.width, currentBorderThickness);
      // Bottom border
      canvasCtx.fillRect(0, canvas.height - currentBorderThickness, canvas.width, currentBorderThickness);
      // Left border
      canvasCtx.fillRect(0, 0, currentBorderThickness, canvas.height);
      // Right border
      canvasCtx.fillRect(canvas.width - currentBorderThickness, 0, currentBorderThickness, canvas.height);
    };
    drawBorder();
  };
  
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !canvas.parentElement && !document.body) return;

    const parent = canvas.parentElement || document.body; // Fallback to body if no direct parent
    const resizeObserver = new ResizeObserver(() => {
      if(canvas) { // Check if canvas still mounted
        // For fixed full-screen, use window dimensions
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
      }
    });

    if (canvas) { // Only observe if canvas exists
        // Set initial size
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
        // Observe window resize for full-screen canvas
        window.addEventListener('resize', () => {
            if(canvas) {
                canvas.width = window.innerWidth;
                canvas.height = window.innerHeight;
            }
        });
        // Note: ResizeObserver on parent is less relevant for fixed full-screen
        // but kept if className might imply non-fixed parent in other uses.
        // For this specific full-screen use, window resize is key.
        // resizeObserver.observe(parent); 
    }
    
    return () => {
        // resizeObserver.disconnect();
        // Clean up window resize listener if added
        window.removeEventListener('resize', () => {
             if(canvas) {
                canvas.width = window.innerWidth;
                canvas.height = window.innerHeight;
            }
        });
    }
  }, []);


  return <canvas ref={canvasRef} className={cn('w-full h-full', className)} />;
};

export default AudioWaveVisualizer;
