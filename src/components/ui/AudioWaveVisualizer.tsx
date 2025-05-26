
"use client";

import React, { useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';

interface AudioWaveVisualizerProps {
  isActive: boolean;
  className?: string;
  // borderColor prop is removed, gradient is internal now
  baseBorderThickness?: number;
  amplitudeSensitivity?: number;
  colorStart?: string; // Optional: for gradient start color
  colorEnd?: string;   // Optional: for gradient end color
}

const AudioWaveVisualizer: React.FC<AudioWaveVisualizerProps> = ({
  isActive,
  className,
  baseBorderThickness = 3,
  amplitudeSensitivity = 0.08,
  colorStart = 'hsl(220, 90%, 60%)', // Default blue
  colorEnd = 'hsl(var(--primary))',   // Default theme purple
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

    // Resolve actual color values if they are CSS variables
    const resolvedColorEnd = colorEnd.startsWith('hsl(var(--primary))') 
      ? getComputedStyle(document.documentElement).getPropertyValue('--primary').trim() 
      : colorEnd;
    const finalColorEnd = resolvedColorEnd ? `hsl(${resolvedColorEnd})` : 'purple'; // fallback

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

      // Top border
      let gradient = canvasCtx.createLinearGradient(0, 0, 0, currentBorderThickness);
      gradient.addColorStop(0, colorStart);
      gradient.addColorStop(1, finalColorEnd);
      canvasCtx.fillStyle = gradient;
      canvasCtx.fillRect(0, 0, canvas.width, currentBorderThickness);

      // Bottom border
      gradient = canvasCtx.createLinearGradient(0, canvas.height - currentBorderThickness, 0, canvas.height);
      gradient.addColorStop(0, finalColorEnd);
      gradient.addColorStop(1, colorStart);
      canvasCtx.fillStyle = gradient;
      canvasCtx.fillRect(0, canvas.height - currentBorderThickness, canvas.width, currentBorderThickness);

      // Left border
      gradient = canvasCtx.createLinearGradient(0, 0, currentBorderThickness, 0);
      gradient.addColorStop(0, colorStart);
      gradient.addColorStop(1, finalColorEnd);
      canvasCtx.fillStyle = gradient;
      canvasCtx.fillRect(0, 0, currentBorderThickness, canvas.height);

      // Right border
      gradient = canvasCtx.createLinearGradient(canvas.width - currentBorderThickness, 0, canvas.width, 0);
      gradient.addColorStop(0, finalColorEnd);
      gradient.addColorStop(1, colorStart);
      canvasCtx.fillStyle = gradient;
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
