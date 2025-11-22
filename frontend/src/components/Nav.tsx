import { Link, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";

const CurvedNav = () => {
  const location = useLocation();
  
  const navItems = [
    { name: "HOME", path: "/" },
    { name: "MISSION", path: "/mission" },
    { name: "TRACKING", path: "/tracking" },
    { name: "AUDIO ANALYSIS", path: "/audio-analysis" },
    { name: "ABOUT", path: "/about" },
  ];

  return (
    <nav className="fixed right-0 top-0 h-screen w-[400px] flex items-center justify-end z-50 pointer-events-none">
      <div className="relative w-full h-full flex items-center justify-end translate-x-[50px]">
        {/* SVG Arc */}
        <svg
          className="absolute right-0 top-0 h-full w-full pointer-events-none"
          viewBox="0 0 400 800"
          preserveAspectRatio="xMaxYMid meet"
        >
          <defs>
            <filter id="arcGlow">
              <feGaussianBlur stdDeviation="4" result="coloredBlur"/>
              <feMerge>
                <feMergeNode in="coloredBlur"/>
                <feMergeNode in="SourceGraphic"/>
              </feMerge>
            </filter>
            <linearGradient id="arcGradient" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="hsl(120 100% 50%)" stopOpacity="0.5" />
              <stop offset="50%" stopColor="hsl(120 100% 50%)" stopOpacity="0.7" />
              <stop offset="100%" stopColor="hsl(120 100% 50%)" stopOpacity="0.5" />
            </linearGradient>
          </defs>
          
          {/* Quarter circle arc - centered vertically, on the right edge */}
          <path
            d="M 350 200 A 200 200 0 0 1 350 600"
            fill="none"
            stroke="url(#arcGradient)"
            strokeWidth="3"
            filter="url(#arcGlow)"
          />
        </svg>

        {/* Central pivot point */}
        <div className="absolute right-[50px] top-1/2 -translate-y-1/2 pointer-events-none z-50">
          <div className="relative">
            <div className="absolute inset-0 w-8 h-8 -left-1 -top-1 rounded-full bg-white/30 blur-lg" />
            <div className="w-6 h-6 rounded-full bg-white shadow-[0_0_25px_rgba(255,255,255,1)]" />
          </div>
        </div>

        {/* Navigation items container */}
        <div className="absolute right-0 top-0 h-full w-full pointer-events-none">
          {navItems.map((item, index) => {
            const isActive = location.pathname === item.path;
            
            // Calculate angle for radial positioning
            // Distribute items from -70° to +70° (140° total spread)
            const totalItems = navItems.length;
            const startAngle = -70;
            const endAngle = 70;
            const angleRange = endAngle - startAngle;
            const angle = startAngle + (angleRange / (totalItems - 1)) * index;
            
            // Convert to radians for calculation
            const radian = (angle * Math.PI) / 180;
            
            // Arc radius and center position (matching SVG)
            const radius = 200;
            const centerX = 350; // Right edge in viewBox
            const centerY = 400; // Middle in viewBox (800/2)
            
            // Calculate position on arc
            const x = centerX - radius * Math.cos(radian);
            const y = centerY + radius * Math.sin(radian);
            
            // Convert from viewBox coordinates (400x800) to percentages
            const rightPx = 400 - x;
            const topPercent = (y / 800) * 100;
            
            return (
              <div
                key={item.path}
                className="absolute pointer-events-auto"
                style={{
                  right: `${rightPx}px`,
                  top: `${topPercent}%`,
                }}
              >
                <Link
                  to={item.path}
                  className="group block"
                >
                  <div className="relative flex items-center justify-end">
                    {/* Glow layer for active state */}
                    {isActive && (
                      <div
                        className="absolute inset-0 -right-8 blur-xl opacity-60"
                        style={{
                          background: 'linear-gradient(135deg, hsl(120 100% 50%), hsl(120 100% 35%))',
                        }}
                      />
                    )}
                    
                    {/* Trapezoidal wedge button */}
                    <div
                      className={cn(
                        "relative px-6 py-2 pixel-text text-lg font-bold transition-all duration-300",
                        "border-2 border-r-0",
                        isActive
                          ? "text-black translate-x-[-12px] scale-110"
                          : "text-primary/70 border-primary/40 hover:text-primary hover:border-primary/70 hover:translate-x-[-6px] hover:scale-105"
                      )}
                      style={{
                        clipPath: 'polygon(12% 0%, 100% 0%, 88% 100%, 0% 100%)',
                        minWidth: '140px',
                        background: isActive
                          ? 'linear-gradient(135deg, hsl(120 100% 60%) 0%, hsl(120 100% 40%) 100%)'
                          : 'linear-gradient(135deg, hsl(120 30% 15% / 0.7) 0%, hsl(120 20% 8% / 0.85) 100%)',
                        boxShadow: isActive
                          ? '0 0 40px hsl(120 100% 50% / 0.8), inset 0 0 30px hsl(120 100% 80% / 0.5)'
                          : '0 0 10px hsl(120 100% 50% / 0.1)',
                      }}
                    >
                      {item.name}
                    </div>
                    
                    {/* Connection line to arc */}
                    <div
                      className={cn(
                        "absolute right-0 top-1/2 -translate-y-1/2 h-[2px] transition-all duration-300",
                        isActive ? "w-16" : "w-10 group-hover:w-12"
                      )}
                      style={{
                        background: isActive
                          ? 'linear-gradient(90deg, hsl(120 100% 50%), hsl(120 100% 50% / 0.3), transparent)'
                          : 'linear-gradient(90deg, hsl(120 100% 50% / 0.4), transparent)',
                      }}
                    />
                    
                    {/* Dot on arc */}
                    <div
                      className="absolute top-1/2 -translate-y-1/2 transition-all duration-300 z-20"
                      style={{
                        right: isActive ? '-64px' : '-40px',
                      }}
                    >
                      <div className="relative">
                        {isActive && (
                          <div className="absolute inset-0 w-6 h-6 -left-1 -top-1 rounded-full bg-white/50 blur-md animate-pulse" />
                        )}
                        <div
                          className={cn(
                            "rounded-full transition-all duration-300",
                            isActive
                              ? "w-4 h-4 bg-white shadow-[0_0_25px_rgba(255,255,255,1)]"
                              : "w-2 h-2 bg-primary/50 group-hover:bg-primary/90 group-hover:w-3 group-hover:h-3"
                          )}
                        />
                      </div>
                    </div>
                  </div>
                </Link>
              </div>
            );
          })}
        </div>
      </div>
    </nav>
  );
};

export default CurvedNav;
