import { useEffect, useRef, useState } from "react";
import { Button } from "./ui/button";
import { Slider } from "./ui/slider";
import Typewriter from "./Typewriter";
import { envConfig } from "@/lib/env";

interface AudioWaveformProps {
  onTranscript?: (text: string) => void;
  onLog?: (log: string[]) => void;
}

const AudioWaveform = ({ onTranscript, onLog }: AudioWaveformProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [sessionLog, setSessionLog] = useState<string[]>([]);
  const [dangerLevel, setDangerLevel] = useState<"none" | "medium" | "high">("none");
  const [freqModifier, setFreqModifier] = useState(1.0);
  
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const dataArrayRef = useRef<Uint8Array | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const recognitionRef = useRef<any>(null);
  const animationIdRef = useRef<number | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const modifiedAudioContextRef = useRef<AudioContext | null>(null);
  const audioQueueRef = useRef<AudioBuffer[]>([]);
  const isPlayingModifiedRef = useRef(false);

  const AUDIO_WS_URL = envConfig.buildWsPath("/ws/audio");

  useEffect(() => {
    // Connect to audio WebSocket
    const ws = new WebSocket(AUDIO_WS_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log("✅ Connected to audio WebSocket");
    };

    ws.onmessage = async (event) => {
      const data = JSON.parse(event.data);
      
      if (data.type === "danger_alert") {
        setDangerLevel(data.level);
        setTimeout(() => setDangerLevel("none"), 2000);
      } else if (data.type === "modified_audio_stream") {
        // Play back modified audio in real-time
        await playModifiedAudioStream(data.audio_data, data.sample_rate);
      }
    };
    
    const playModifiedAudioStream = async (audioData: number[], sampleRate: number) => {
      if (!modifiedAudioContextRef.current) {
        modifiedAudioContextRef.current = new AudioContext();
      }
      
      const audioContext = modifiedAudioContextRef.current;
      
      // Convert Int16 array back to Float32
      const float32Data = new Float32Array(audioData.length);
      for (let i = 0; i < audioData.length; i++) {
        float32Data[i] = audioData[i] / 32768;
      }
      
      // Create audio buffer
      const audioBuffer = audioContext.createBuffer(1, float32Data.length, sampleRate);
      audioBuffer.getChannelData(0).set(float32Data);
      
      // Play the buffer
      const source = audioContext.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(audioContext.destination);
      source.start();
    };

    ws.onerror = (error) => {
      console.error("❌ WebSocket error:", error);
    };

    ws.onclose = () => {
      console.log("🔌 WebSocket closed");
    };

    return () => {
      ws.close();
      stopRecording();
    };
  }, []);

  const startRecording = async () => {
    try {
      // Get microphone access
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      // Setup Web Audio API
      const audioContext = new AudioContext();
      audioContextRef.current = audioContext;

      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 2048;
      
      // Setup ScriptProcessorNode for real-time audio streaming
      const processor = audioContext.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;
      
      processor.onaudioprocess = (e) => {
        // Get audio data
        const inputData = e.inputBuffer.getChannelData(0);
        
        // Convert to Int16Array for transmission
        const int16Data = new Int16Array(inputData.length);
        for (let i = 0; i < inputData.length; i++) {
          int16Data[i] = Math.max(-32768, Math.min(32767, inputData[i] * 32768));
        }
        
        // Send to backend via WebSocket
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify({
            type: "audio_stream",
            audio_data: Array.from(int16Data),
            sample_rate: audioContext.sampleRate,
            frequency_modifier: freqModifier
          }));
        }
      };
      
      source.connect(processor);
      processor.connect(audioContext.destination);
      
      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength) as Uint8Array;
      
      analyserRef.current = analyser;
      dataArrayRef.current = dataArray;
      
      source.connect(analyser);

      // Setup Web Speech API for STT
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechRecognition) {
        const recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = 'en-US';

        recognition.onresult = (event: any) => {
          let interimTranscript = '';
          let finalTranscript = '';

          for (let i = event.resultIndex; i < event.results.length; i++) {
            const transcriptPiece = event.results[i][0].transcript;
            if (event.results[i].isFinal) {
              finalTranscript += transcriptPiece + ' ';
              // Add to session log
              const timestamp = new Date().toLocaleTimeString();
              const logEntry = `[${timestamp}] ${transcriptPiece}`;
              setSessionLog(prev => {
                const newLog = [...prev, logEntry];
                if (onLog) onLog(newLog);
                return newLog;
              });
            } else {
              interimTranscript += transcriptPiece;
            }
          }

          const fullTranscript = finalTranscript + interimTranscript;
          setTranscript(fullTranscript);
          if (onTranscript) {
            onTranscript(fullTranscript);
          }
        };

        recognition.onerror = (event: any) => {
          console.error('Speech recognition error:', event.error);
          // Auto-restart on error to prevent hanging
          if (event.error === 'no-speech' || event.error === 'network') {
            if (recognitionRef.current && isRecording) {
              setTimeout(() => {
                try {
                  recognition.start();
                } catch (e) {
                  console.log('Recognition already started');
                }
              }, 100);
            }
          }
        };

        recognition.onend = () => {
          // Auto-restart when recognition ends to prevent hanging
          if (recognitionRef.current && isRecording) {
            try {
              recognition.start();
            } catch (e) {
              console.log('Recognition already started');
            }
          }
        };

        recognition.start();
        recognitionRef.current = recognition;
      }

      setIsRecording(true);
      drawWaveform();
    } catch (error) {
      console.error("Error accessing microphone:", error);
      alert("Could not access microphone. Please grant permission.");
    }
  };

  const stopRecording = () => {
    setIsRecording(false);
    
    if (animationIdRef.current) {
      cancelAnimationFrame(animationIdRef.current);
    }

    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
    
    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current = null;
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }

    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    
    if (modifiedAudioContextRef.current) {
      modifiedAudioContextRef.current.close();
      modifiedAudioContextRef.current = null;
    }
  };

  const drawWaveform = () => {
    const canvas = canvasRef.current;
    const analyser = analyserRef.current;
    const dataArray = dataArrayRef.current;

    if (!canvas || !analyser || !dataArray) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const draw = () => {
      animationIdRef.current = requestAnimationFrame(draw);

      // @ts-ignore - Web Audio API typing issue
      analyser.getByteTimeDomainData(dataArray);

      // Clear canvas with fade effect
      ctx.fillStyle = "rgba(0, 0, 0, 0.1)";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Calculate amplitude and frequency data
      let sum = 0;
      let lowFreqSum = 0;
      
      for (let i = 0; i < dataArray.length; i++) {
        const value = (dataArray[i] - 128) / 128;
        sum += Math.abs(value);
        
        // Low frequency range (first 20% of spectrum)
        if (i < dataArray.length * 0.2) {
          lowFreqSum += Math.abs(value);
        }
      }
      
      const amplitude = sum / dataArray.length;
      const lowFreq = lowFreqSum / (dataArray.length * 0.2);

      // Send amplitude data to backend for danger detection
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({
          type: "amplitude",
          amplitude: amplitude,
          low_freq: lowFreq,
          timestamp: Date.now()
        }));
      }

      // Draw waveform
      ctx.lineWidth = 2;
      ctx.strokeStyle = dangerLevel === "high" ? "#ff0000" : 
                        dangerLevel === "medium" ? "#ff8800" : 
                        "#00ff00";
      ctx.shadowBlur = 20;
      ctx.shadowColor = ctx.strokeStyle;

      ctx.beginPath();

      const sliceWidth = canvas.width / dataArray.length;
      let x = 0;

      for (let i = 0; i < dataArray.length; i++) {
        const v = dataArray[i] / 128.0;
        const y = (v * canvas.height) / 2;

        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }

        x += sliceWidth;
      }

      ctx.lineTo(canvas.width, canvas.height / 2);
      ctx.stroke();

      // Draw frequency bars
      // @ts-ignore - Web Audio API typing issue
      analyser.getByteFrequencyData(dataArray);
      
      const barWidth = canvas.width / dataArray.length * 2.5;
      let barX = 0;

      for (let i = 0; i < dataArray.length / 4; i++) {
        const barHeight = (dataArray[i] / 255) * canvas.height * 0.8;
        
        const hue = (i / (dataArray.length / 4)) * 120;
        ctx.fillStyle = `hsla(${hue}, 100%, 50%, 0.3)`;
        
        ctx.fillRect(barX, canvas.height - barHeight, barWidth, barHeight);
        barX += barWidth + 1;
      }
    };

    draw();
  };

  return (
    <div className="space-y-6">
      {/* Controls */}
      <div className="flex gap-4 items-center flex-wrap">
        <Button
          onClick={isRecording ? stopRecording : startRecording}
          className={`pixel-text text-lg px-8 py-6 ${
            isRecording 
              ? "bg-red-500 hover:bg-red-600" 
              : "bg-primary hover:bg-primary/80"
          }`}
        >
          {isRecording ? "● STOP" : "○ START RECORDING"}
        </Button>

        {dangerLevel !== "none" && (
          <div 
            className={`pixel-text px-4 py-2 rounded border-2 animate-pulse ${
              dangerLevel === "high" 
                ? "bg-red-500/20 border-red-500 text-red-500" 
                : "bg-orange-500/20 border-orange-500 text-orange-500"
            }`}
          >
            ⚠ {dangerLevel.toUpperCase()} DANGER DETECTED
          </div>
        )}
      </div>
      
      {/* Frequency Modifier */}
      <div className="space-y-3 border-2 border-primary/30 rounded-lg p-6 bg-background/50">
        <div className="flex items-center justify-between">
          <h3 className="pixel-text text-lg text-primary glow">
            <Typewriter text="FREQUENCY MODIFIER (REAL-TIME):" speed={50} />
          </h3>
          <span className="pixel-text text-xl text-foreground">{freqModifier.toFixed(1)}x</span>
        </div>
        <Slider
          value={[freqModifier]}
          onValueChange={(value) => setFreqModifier(value[0])}
          min={1.0}
          max={2.0}
          step={0.1}
          className="w-full"
        />
        <p className="text-xs pixel-text text-foreground/50">
          Adjust slider while recording to modify audio frequency in real-time
        </p>
      </div>

      {/* Waveform visualization */}
      <div className="border-2 border-primary/30 rounded-lg overflow-hidden bg-background">
        <canvas
          ref={canvasRef}
          width={800}
          height={300}
          className="w-full"
          style={{ imageRendering: "crisp-edges" }}
        />
      </div>

      {/* Transcript display */}
      <div className="space-y-2">
        <h3 className="pixel-text text-lg text-primary glow">
          <Typewriter text="LIVE TRANSCRIPT:" speed={60} />
        </h3>
        <div className="text-lg pixel-text text-foreground/80 leading-relaxed p-4 border-2 border-primary/30 rounded-lg bg-background/50 min-h-[60px]">
          {transcript || "Waiting for speech..."}
        </div>
      </div>
      
      {/* Session Log */}
      {sessionLog.length > 0 && (
        <div className="space-y-2">
          <h3 className="pixel-text text-lg text-primary glow">
            <Typewriter text="SESSION LOG:" speed={60} delay={300} />
          </h3>
          <div className="max-h-64 overflow-y-auto p-4 border-2 border-primary/30 rounded-lg bg-background/50 space-y-1">
            {sessionLog.map((entry, idx) => (
              <div key={idx} className="text-sm pixel-text text-foreground/70">
                {entry}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Status indicators */}
      <div className="flex gap-4 pixel-text text-sm text-foreground/60">
        <div className={`px-3 py-1 rounded border ${
          isRecording 
            ? "bg-primary/20 border-primary text-primary" 
            : "bg-muted/20 border-muted text-muted"
        }`}>
          {isRecording ? "● RECORDING" : "○ IDLE"}
        </div>
        <div className={`px-3 py-1 rounded border ${
          wsRef.current?.readyState === WebSocket.OPEN
            ? "bg-primary/20 border-primary text-primary" 
            : "bg-red-500/20 border-red-500 text-red-500"
        }`}>
          {wsRef.current?.readyState === WebSocket.OPEN ? "● CONNECTED" : "○ OFFLINE"}
        </div>
      </div>
    </div>
  );
};

export default AudioWaveform;
