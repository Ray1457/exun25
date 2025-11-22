const CyberpunkBackground = () => {
  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden">
      {/* Main grid background with vignette */}
      <div className="absolute inset-0 bg-black">
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: 'url("/bg.png"), url("#file:bg.png")',
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            opacity: 0.95,
          }}
        />
        {/* Fine orthogonal grid */}
        <div 
          className="absolute inset-0 opacity-40"
          style={{
            backgroundImage: `
              linear-gradient(to right, hsl(120 80% 25% / 0.3) 1px, transparent 1px),
              linear-gradient(to bottom, hsl(120 80% 25% / 0.3) 1px, transparent 1px)
            `,
            backgroundSize: '20px 20px',
          }}
        />
        
        {/* Glowing grid lines with bloom effect */}
        <div 
          className="absolute inset-0 opacity-20"
          style={{
            backgroundImage: `
              linear-gradient(to right, hsl(120 100% 50% / 0.6) 1px, transparent 1px),
              linear-gradient(to bottom, hsl(120 100% 50% / 0.6) 1px, transparent 1px)
            `,
            backgroundSize: '100px 100px',
            filter: 'blur(1px)',
          }}
        />
        
        {/* Vignette effect */}
        <div 
          className="absolute inset-0"
          style={{
            background: 'radial-gradient(circle at center, transparent 0%, rgba(0,0,0,0.7) 100%)',
          }}
        />
        
        {/* Noise texture overlay */}
        <div 
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 400 400' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`,
          }}
        />
      </div>

      {/* Ambient scanning figures - left side */}
      <div className="absolute left-0 top-1/4 w-96 h-96 opacity-[0.07]">
        <svg viewBox="0 0 200 200" className="w-full h-full">
          <defs>
            <filter id="glow">
              <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
              <feMerge>
                <feMergeNode in="coloredBlur"/>
                <feMergeNode in="SourceGraphic"/>
              </feMerge>
            </filter>
          </defs>
          {/* Abstract human silhouette */}
          <ellipse cx="100" cy="60" rx="25" ry="30" fill="hsl(120 100% 50%)" filter="url(#glow)" />
          <rect x="80" y="85" width="40" height="60" rx="5" fill="hsl(120 100% 50%)" filter="url(#glow)" />
          <rect x="70" y="90" width="15" height="50" rx="7" fill="hsl(120 100% 50%)" filter="url(#glow)" />
          <rect x="115" y="90" width="15" height="50" rx="7" fill="hsl(120 100% 50%)" filter="url(#glow)" />
          <rect x="85" y="145" width="12" height="50" rx="6" fill="hsl(120 100% 50%)" filter="url(#glow)" />
          <rect x="103" y="145" width="12" height="50" rx="6" fill="hsl(120 100% 50%)" filter="url(#glow)" />
        </svg>
      </div>

      {/* Ambient scanning figures - bottom right */}
      <div className="absolute right-1/4 bottom-1/4 w-64 h-64 opacity-[0.05] rotate-12">
        <svg viewBox="0 0 200 200" className="w-full h-full">
          <ellipse cx="100" cy="60" rx="25" ry="30" fill="hsl(120 100% 50%)" filter="url(#glow)" />
          <rect x="80" y="85" width="40" height="60" rx="5" fill="hsl(120 100% 50%)" filter="url(#glow)" />
          <rect x="70" y="90" width="15" height="50" rx="7" fill="hsl(120 100% 50%)" filter="url(#glow)" />
          <rect x="115" y="90" width="15" height="50" rx="7" fill="hsl(120 100% 50%)" filter="url(#glow)" />
          <rect x="85" y="145" width="12" height="50" rx="6" fill="hsl(120 100% 50%)" filter="url(#glow)" />
          <rect x="103" y="145" width="12" height="50" rx="6" fill="hsl(120 100% 50%)" filter="url(#glow)" />
        </svg>
      </div>

      {/* Scanning line effect */}
      <div 
        className="absolute inset-0 opacity-10"
        style={{
          background: 'linear-gradient(to bottom, transparent 0%, hsl(120 100% 50% / 0.1) 50%, transparent 100%)',
          animation: 'scan 8s linear infinite',
        }}
      />

      <style>{`
        @keyframes scan {
          0% { transform: translateY(-100%); }
          100% { transform: translateY(200%); }
        }
      `}</style>
    </div>
  );
};

export default CyberpunkBackground;
