import dynamic from "next/dynamic";
import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import About from "../src/components/About";
import Contact from "../src/components/Contact";
import Services from "../src/components/Services";
import { usePage } from "../src/PageContext";
import Layout from "../src/layout/Layout";


const Portfolio = dynamic(() => import("../src/components/Portfolio"), {
  ssr: false,
});

const LOOP_RESTART_TIME = 9.06;
// landing_page video is 1920x1080 (16:9)
const VIDEO_ASPECT = 1080 / 1920;
// Auto-scroll speed once the intro video has played through (pixels per second)
const SCROLL_SPEED = 28;

const Home = () => {
  const sectionRef = useRef(null);
  const trackRef = useRef(null);
  const tileHeightRef = useRef(0);
  const offsetRef = useRef(0);
  const rafRef = useRef(null);
  const lastTsRef = useRef(0);
  const [aspect, setAspect] = useState(VIDEO_ASPECT);
  const [tileCount, setTileCount] = useState(2);
  const [scrolling, setScrolling] = useState(false);

  const computeTiles = useCallback(() => {
    const section = sectionRef.current;
    if (!section || !aspect) return;
    const width = section.clientWidth;
    const tileHeight = width * aspect;
    if (tileHeight < 1) return;
    tileHeightRef.current = tileHeight;
    // +2 so the column always covers the viewport plus one tile for seamless looping
    const needed = Math.ceil(section.clientHeight / tileHeight) + 2;
    setTileCount(Math.max(2, needed));
  }, [aspect]);

  useEffect(() => {
    computeTiles();
    window.addEventListener("resize", computeTiles);
    return () => window.removeEventListener("resize", computeTiles);
  }, [computeTiles]);

  useEffect(() => {
    if (!scrolling) return undefined;
    const step = (ts) => {
      if (!lastTsRef.current) lastTsRef.current = ts;
      const dt = (ts - lastTsRef.current) / 1000;
      lastTsRef.current = ts;
      const tileHeight = tileHeightRef.current || 1;
      offsetRef.current += SCROLL_SPEED * dt;
      // Wrap at one tile height so the repeated tiles loop seamlessly
      if (offsetRef.current >= tileHeight) {
        offsetRef.current -= tileHeight;
      }
      if (trackRef.current) {
        trackRef.current.style.transform = `translateY(${-offsetRef.current}px)`;
      }
      rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      lastTsRef.current = 0;
    };
  }, [scrolling]);

  const handleLoadedMetadata = (event) => {
    const video = event.currentTarget;
    if (video.videoWidth) {
      setAspect(video.videoHeight / video.videoWidth);
    }
  };

  const handleEnded = (event) => {
    const video = event.currentTarget;
    video.currentTime = LOOP_RESTART_TIME;
    video.play();
    // Begin the slow downward scroll once the intro has played through
    setScrolling(true);
  };

  return (
    <section
      ref={sectionRef}
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
      <div
        ref={trackRef}
        style={{
          display: "flex",
          flexDirection: "column",
          width: "100%",
          willChange: "transform",
        }}
      >
        {Array.from({ length: tileCount }).map((_, index) => (
          <video
            key={index}
            autoPlay
            muted
            playsInline
            onLoadedMetadata={index === 0 ? handleLoadedMetadata : undefined}
            onEnded={handleEnded}
            style={{
              width: "100%",
              height: "auto",
              display: "block",
              flexShrink: 0,
            }}
          >
            <source src="/static/video/landing_page.webm" type="video/webm" />
            <source src="/static/video/landing_page.mp4" type="video/mp4" />
          </video>
        ))}
      </div>
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
