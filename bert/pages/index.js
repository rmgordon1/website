import dynamic from "next/dynamic";
import { Fragment, useEffect, useRef } from "react";
import About from "../src/components/About";
import Contact from "../src/components/Contact";
import Services from "../src/components/Services";
import { usePage } from "../src/PageContext";
import Layout from "../src/layout/Layout";


const Portfolio = dynamic(() => import("../src/components/Portfolio"), {
  ssr: false,
});

const LOOP_RESTART_TIME = 9.06;

const Home = () => {
  const landingVideoRef = useRef(null);

  const handleEnded = (event) => {
    const video = event.currentTarget;
    video.currentTime = LOOP_RESTART_TIME;
    video.play();
  };

  useEffect(() => {
    const video = landingVideoRef.current;
    if (!video) return;

    const start = () => {
      video.play();
      ["click", "keydown", "touchstart", "pointerdown"].forEach((evt) =>
        window.removeEventListener(evt, start)
      );
    };

    ["click", "keydown", "touchstart", "pointerdown"].forEach((evt) =>
      window.addEventListener(evt, start, { once: true })
    );

    return () => {
      ["click", "keydown", "touchstart", "pointerdown"].forEach((evt) =>
        window.removeEventListener(evt, start)
      );
    };
  }, []);

  return (
    <section
      id="home"
      data-nav-tooltip="Home"
      className="pp-section pp-scrollable"
      style={{
        position: "relative",
        width: "100%",
        height: "100vh",
        overflow: "hidden",
        background: "#000",
      }}
    >
      <video
        autoPlay
        muted
        loop
        playsInline
        style={{
          position: "absolute",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          width: "100%",
          height: "100%",
          objectFit: "cover",
          zIndex: 0,
        }}
      >
        <source src="https://dx09qkoz6th2f.cloudfront.net/static_box.webm" type="video/webm" />
      </video>
      <video
        ref={landingVideoRef}
        muted
        playsInline
        onEnded={handleEnded}
        style={{
          position: "absolute",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          width: "82%",
          height: "82%",
          objectFit: "contain",
          zIndex: 1,
        }}
      >
        <source src="https://dx09qkoz6th2f.cloudfront.net/skull_final.webm" type="video/webm" />
      </video>
      <video
        autoPlay
        muted
        loop
        playsInline
        style={{
          position: "absolute",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          width: "100%",
          height: "100%",
          objectFit: "contain",
          zIndex: 10,
          pointerEvents: "none",
        }}
      >
        <source src="https://dx09qkoz6th2f.cloudfront.net/videodrome_tv_transp_unc.webm" type="video/webm" />
      </video>
    </section>
  );
};

const PageContent = () => {
  const { active } = usePage();
  return (
    <Fragment>
      {active === "home" && <Home />}
      {active === "about" && <About />}
      {active === "services" && <Services />}
      {active === "work" && <Portfolio />}
      {active === "contactus" && <Contact />}
    </Fragment>
  );
};

const Index = () => {
  return (
    <Layout>
      <PageContent />
    </Layout>
  );
};
export default Index;
