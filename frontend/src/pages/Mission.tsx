import Layout from "@/components/Layout";
import Typewriter from "@/components/Typewriter";

const Mission = () => {
  return (
    <Layout>
      <div className="flex flex-col max-w-4xl">
        <h1 className="text-8xl pixel-text text-foreground mb-16">
          <Typewriter text="Mission" className="glitch" speed={150} />
        </h1>

        <div className="space-y-6 text-xl pixel-text text-foreground/80 leading-relaxed">
          <p>
            We offer the most practical and advanced way of espionage that is possible with the existing technology of etinuxE. We have everything the etinuxE need to spy over the humans, defeat Dr. Fhu and take their first step in the way of the conquest of the earth.
          </p>
        </div>
      </div>
    </Layout>
  );
};

export default Mission;
