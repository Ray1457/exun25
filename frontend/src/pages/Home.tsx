import Layout from "@/components/Layout";
import Typewriter from "@/components/Typewriter";

const Home = () => {
  return (
    <Layout>
      <div className="flex flex-col max-w-4xl">
        {/* Page Header */}
        <h1 className="text-8xl pixel-text text-foreground mb-16">
          <Typewriter text="Welcome" className="glitch" speed={150} />
        </h1>
        
        {/* Content */}
        <div className="space-y-4 mb-16 text-xl pixel-text text-foreground/80 leading-relaxed">
          <p>Etinuxia is a one-step solution to the surveillance needs of the etinuxE.</p>
        </div>

        {/* Alien figures at bottom */}
        <div className="absolute bottom-16 left-8 flex gap-8 opacity-30">
          <div className="w-16 h-32 bg-primary/20 rounded-t-full" style={{ clipPath: "polygon(50% 0%, 80% 20%, 90% 40%, 85% 60%, 70% 80%, 50% 100%, 30% 80%, 15% 60%, 10% 40%, 20% 20%)" }} />
          <div className="w-20 h-40 bg-primary/20 rounded-t-full" style={{ clipPath: "polygon(50% 0%, 80% 20%, 90% 40%, 85% 60%, 70% 80%, 50% 100%, 30% 80%, 15% 60%, 10% 40%, 20% 20%)" }} />
          <div className="w-24 h-48 bg-primary/20 rounded-t-full" style={{ clipPath: "polygon(50% 0%, 80% 20%, 90% 40%, 85% 60%, 70% 80%, 50% 100%, 30% 80%, 15% 60%, 10% 40%, 20% 20%)" }} />
        </div>
      </div>
    </Layout>
  );
};

export default Home;
