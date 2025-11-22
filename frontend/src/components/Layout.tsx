import { ReactNode } from "react";
import CurvedNav from "./Nav";
import CyberpunkBackground from "./Background";
import Typewriter from "./Typewriter";

interface LayoutProps {
  children: ReactNode;
}

const Layout = ({ children }: LayoutProps) => {
  return (
    <div className="min-h-screen relative">
      {/* Cyberpunk Grid Background */}
      <CyberpunkBackground />

      {/* Logo */}
      <div className="fixed top-8 right-8 z-50 text-right">
        <h1 className="pixel-text text-3xl text-primary/60 tracking-wider glow">
          <Typewriter text="ETINUXIA" speed={120} />
        </h1>
        <p className="pixel-text text-xs text-primary/40 mt-1 tracking-widest">
          <Typewriter text="THE CITY OF THE SMALL" speed={80} delay={1000} />
        </p>
      </div>

      {/* Curved Navigation */}
      <CurvedNav />

      {/* Main Content */}
      <main className="relative min-h-screen flex items-center px-8 z-10">
        <div className="w-full max-w-5xl">
          {children}
        </div>
      </main>
    </div>
  );
};

export default Layout;
