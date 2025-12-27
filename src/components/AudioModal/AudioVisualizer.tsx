'use client';

import { useEffect, useRef, useState } from 'react';

interface AudioVisualizerProps {
  audioRef: React.RefObject<HTMLAudioElement | null>;
  isPlaying: boolean;
  theme?: 'dark' | 'light';
  fullSize?: boolean;
}

export default function AudioVisualizer({ audioRef, isPlaying, theme = 'dark', fullSize = false }: AudioVisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const animationIdRef = useRef<number | undefined>(undefined);
  const [isInitialized, setIsInitialized] = useState(false);

  const peaksRef = useRef<number[]>([]);

  useEffect(() => {
    if (!audioRef.current || !canvasRef.current) return;

    const audio = audioRef.current;

    const initAudioContext = () => {
      if (audioContextRef.current) return;

      try {
        const audioContext = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
        const source = audioContext.createMediaElementSource(audio);
        const analyser = audioContext.createAnalyser();

        analyser.fftSize = 256;
        analyser.smoothingTimeConstant = 0.8;

        source.connect(analyser);
        analyser.connect(audioContext.destination);

        audioContextRef.current = audioContext;
        analyserRef.current = analyser;
        peaksRef.current = new Array(analyser.frequencyBinCount).fill(0);

        setIsInitialized(true);
      } catch (error) {
        console.error('Failed to initialize audio visualizer:', error);
      }
    };

    const handlePlay = () => {
      if (audioContextRef.current?.state === 'suspended') {
        audioContextRef.current.resume();
      }
      if (!isInitialized) {
        initAudioContext();
      }
    };

    if (isPlaying) {
      handlePlay();
    }

    audio.addEventListener('play', handlePlay);

    return () => {
      audio.removeEventListener('play', handlePlay);
    };
  }, [audioRef, isPlaying, isInitialized]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !analyserRef.current) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
    const peaks = peaksRef.current;

    const barColor = theme === 'dark' ? '#ffffff' : '#000000';
    const peakColor = '#22c55e';
    const bgColor = theme === 'dark' ? 'rgba(0, 0, 0, 0.3)' : 'rgba(255, 255, 255, 0.3)';

    const animate = () => {
      if (!analyserRef.current) return;

      analyserRef.current.getByteFrequencyData(dataArray);

      ctx.fillStyle = bgColor;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const barWidth = canvas.width / dataArray.length;
      const barGap = 1;

      for (let i = 0; i < dataArray.length; i++) {
        const value = dataArray[i];
        const percent = value / 255;
        const barHeight = percent * (canvas.height * 0.9);

        if (value > peaks[i]) {
          peaks[i] = value;
        } else {
          peaks[i] *= 0.98;
        }

        const peakPercent = peaks[i] / 255;
        const peakHeight = peakPercent * (canvas.height * 0.9);

        const gradient = ctx.createLinearGradient(0, canvas.height - barHeight, 0, canvas.height);
        gradient.addColorStop(0, '#f97316');
        gradient.addColorStop(1, barColor);

        ctx.fillStyle = gradient;
        ctx.fillRect(i * barWidth + barGap / 2, canvas.height - barHeight, barWidth - barGap, barHeight);

        if (peaks[i] > 0) {
          ctx.fillStyle = peakColor;
          ctx.fillRect(i * barWidth + barGap / 2, canvas.height - peakHeight, barWidth - barGap, 2);
        }
      }

      animationIdRef.current = requestAnimationFrame(animate);
    };

    if (isPlaying && isInitialized) {
      animate();
    }

    return () => {
      if (animationIdRef.current) {
        cancelAnimationFrame(animationIdRef.current);
      }
    };
  }, [isPlaying, theme, isInitialized]);

  if (fullSize) {
    return (
      <canvas
        ref={canvasRef}
        className={`w-full flex-1 rounded-lg cursor-pointer ${
          theme === 'dark' ? 'bg-gray-900 border border-gray-700' : 'bg-gray-50 border border-gray-300'
        }`}
        style={{ minHeight: '300px' }}
      />
    );
  }

  return (
    <canvas
      ref={canvasRef}
      width={400}
      height={60}
      className={`w-full h-16 rounded-lg ${
        theme === 'dark' ? 'bg-gray-800 border border-gray-700' : 'bg-gray-100 border border-gray-300'
      }`}
      style={{ marginBottom: '1rem' }}
    />
  );
}
