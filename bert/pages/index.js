import dynamic from "next/dynamic";
import { Fragment, useEffect, useRef, useState } from "react";
import About from "../src/components/About";
import Contact from "../src/components/Contact";
import Services from "../src/components/Services";
import { usePage } from "../src/PageContext";
import Layout from "../src/layout/Layout";
import { CDN, usePrefersMovAlpha } from "../src/video";


const Portfolio = dynamic(() => import("../src/components/Portfolio"), {
  ssr: false,
});

const LOOP_RESTART_TIME = 9.06;

const useIsTall = () => {
  const [isTall, setIsTall] = useState(false);

  useEffect(() => {
    // Matches when the viewport is taller than it is wide (width < height).
    const mql = window.matchMedia("(max-aspect-ratio: 1/1)");
    const update = () => setIsTall(mql.matches);
    update();
    mql.addEventListener("change", update);
    return () => mql.removeEventListener("change", update);
  }, []);

  return isTall;
};

const Home = ({ isPreloading }) => {
  const landingVideoRef = useRef(null);
  const isTall = useIsTall();
  const prefersMov = usePrefersMovAlpha();

  const skullName = isTall ? "skull_vertical" : "skull_final";
  const tvName = isTall
    ? "videodrome_tv_vertical"
    : "videodrome_tv_transp_unc";

  // In tall mode we want the vertical videos to be height-bound so their top
  // and bottom edges touch the window edges (width follows the intrinsic
  // aspect ratio). In wide mode each video keeps its original box size. The
  // skull stays at 82% so it remains nested within the full-size TV frame.
  const skullSize = isTall
    ? { width: "auto", height: "70%" }
    : { width: "82%", height: "82%" };
  const tvSize = isTall
    ? { width: "auto", height: "100%" }
    : { width: "100%", height: "100%" };

  const handleEnded = (event) => {
    const video = event.currentTarget;
    video.currentTime = LOOP_RESTART_TIME;
    video.play();
  };

  useEffect(() => {
    const video = landingVideoRef.current;
    if (!video) return;

    // Don't start the landing animation while the full-screen preloader is
    // still covering the page. Otherwise the intro plays (and can finish)
    // behind the loading screen, so the user never sees it. Once the
    // preloader is gone this effect re-runs and playback begins from the top.
    if (isPreloading) return;

    // Try to play immediately (muted, so autoplay is permitted). This also
    // resumes playback after the element remounts on an orientation change.
    const playPromise = video.play();
    if (playPromise && typeof playPromise.catch === "function") {
      playPromise.catch(() => {});
    }

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
  }, [skullName, isPreloading]);

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
        <source src={`${CDN}/landing_page/static_final.mp4`} type="video/mp4"/>
        <source src={`${CDN}/landing_page/static_final.webm`} type="video/webm"/>
      </video>
      <video
        key={`${skullName}-${prefersMov}`}
        ref={landingVideoRef}
        muted
        playsInline
        onEnded={handleEnded}
        style={{
          position: "absolute",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          ...skullSize,
          objectFit: "contain",
          zIndex: 1,
        }}
      >
        {prefersMov ? (
          <source src={`${CDN}/landing_page/${skullName}.mp4`} type="video/mp4" codecs="hvc1" />
        ) : (
          <source src={`${CDN}/landing_page/${skullName}.webm`} type="video/webm" />
        )}
      </video>
      <video
        key={`${tvName}-${prefersMov}`}
        autoPlay
        muted
        loop
        playsInline
        style={{
          position: "absolute",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          ...tvSize,
          objectFit: "contain",
          zIndex: 10,
          pointerEvents: "none",
        }}
      >
        {prefersMov ? (
          <source src={`${CDN}/landing_page/${tvName}.mp4`} type="video/mp4" codecs="hvc1" />
        ) : (
          <source src={`${CDN}/landing_page/${tvName}.webm`} type="video/webm" />
        )}
      </video>
    </section>
  );
};

const PageContent = ({ isPreloading }) => {
  const { active } = usePage();
  return (
    <Fragment>
      {active === "home" && <Home isPreloading={isPreloading} />}
      {active === "about" && <About />}
      {active === "services" && <Services />}
      {active === "work" && <Portfolio />}
      {active === "contactus" && <Contact />}
    </Fragment>
  );
};

const Index = ({ isPreloading }) => {
  return (
    <Layout>
      <PageContent isPreloading={isPreloading} />
    </Layout>
  );
};
export default Index;
