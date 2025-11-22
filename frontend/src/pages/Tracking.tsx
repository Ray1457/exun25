import Layout from "@/components/Layout";
import CrowdMap from "@/components/LiveMap";
import Typewriter from "@/components/Typewriter";

const Tracking = () => {
  return (
    <Layout>
      <div className="flex flex-col gap-8">
        <h1 className="text-8xl pixel-text text-foreground mb-8">
          <Typewriter text="Tracking" className="glitch" speed={150} />
        </h1>

        <div className="relative w-full">
          <CrowdMap />
        </div>
      </div>
    </Layout>
  );
};

export default Tracking;
