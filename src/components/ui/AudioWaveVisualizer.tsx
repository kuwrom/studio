
"use client";

import React, { useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';

interface AudioWaveVisualizerProps {
  isActive: boolean;
  className?: string;
  baseBorderThickness?: number;
  amplitudeSensitivity?: number;
  borderColor?: string; // Changed from colorStart/colorEnd to a single borderColor
}

const AudioWaveVisualizer: React.FC<AudioWaveVisualizerProps> = ({
  isActive,
  className,
  baseBorderThickness = 3,
  amplitudeSensitivity = 0.08,
  borderColor = 'black', // Default to black
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
        analyserRef.current.smoothingTimeConstant = 0.3;

        sourceRef.current = audioContextRef.current.createMediaStreamSource(mediaStreamRef.current);
        sourceRef.current.connect(analyserRef.current);

        dataArrayRef.current = new Uint8Array(analyserRef.current.frequencyBinCount);
        startDrawing();

      } catch (err) {
        console.error('Error initializing audio for visualizer:', err);
        // If initialization fails, ensure isActive visual cues are also reset from parent if necessary
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
  }, [isActive]); // Only re-run if isActive changes

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
        const value = (dataArrayRef.current[i] - 128) / 128.0;
        sumOfSquares += value * value;
      }
      const rms = Math.sqrt(sumOfSquares / dataArrayRef.current.length);
      const dynamicThicknessAddition = rms * baseBorderThickness * amplitudeSensitivity * 100;
      const currentBorderThickness = Math.max(1, baseBorderThickness + dynamicThicknessAddition);

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
    if (!canvas) return;

    const handleResize = () => {
      if (canvasRef.current) {
        canvasRef.current.width = window.innerWidth;
        canvasRef.current.height = window.innerHeight;
      }
    };

    window.addEventListener('resize', handleResize);
    handleResize(); // Initial size set

    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  return <canvas ref={canvasRef} className={cn('w-full h-full', className)} />;
};

export default AudioWaveVisualizer;
