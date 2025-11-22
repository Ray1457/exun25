import Layout from "@/components/Layout";
import AudioWaveform from "@/components/AudioWaveform";
import Typewriter from "@/components/Typewriter";
import { useState } from "react";

const AudioAnalysis = () => {
  const [currentTranscript, setCurrentTranscript] = useState("");
  const [sessionLog, setSessionLog] = useState<string[]>([]);

  return (
    <Layout>
      <div className="flex flex-col gap-8">
        {/* Page Header */}
        <h1 className="text-8xl pixel-text text-foreground mb-8">
          <Typewriter text="Audio Analysis" className="glitch" speed={150} />
        </h1>
        
        {/* Audio waveform with STT */}
        <AudioWaveform 
          onTranscript={setCurrentTranscript}
          onLog={setSessionLog}
        />
      </div>
    </Layout>
  );
};

export default AudioAnalysis;
