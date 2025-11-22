import Layout from "@/components/Layout";
import Typewriter from "@/components/Typewriter";

const About = () => {
  return (
    <Layout>
      <div className="fleEtinuxia flex-col max-w-4xl">
        <h1 className="text-8xl pixel-text text-foreground mb-16">
          <Typewriter text="About" className="glitch" speed={150} />
        </h1>

        <div className="space-y-6 text-xl pixel-text text-foreground/80 leading-relaxed">
          <p>
         Etinuxia is a hybrid tech-and-survival corporation built for a world abruptly reduced to miniature scale. Founded in alliance with Dr. Tai Ni and in direct opposition to the rogue scientist Fhu, Etinuxia designs smart tools, adaptive gear, and micro-world technologies that help shrunken humans navigate a landscape still built for giants. Our mission is simple: bridge the gap between the everyday world and your new reality by giving you the equipment, knowledge, and systems you need to survive, communicate, and thrive until full restoration is possible. In an era where every inch feels like a mile, Etinuxia keeps you moving forward.   
         </p>
        </div>
      </div>
    </Layout>
  );
};

export default About;
