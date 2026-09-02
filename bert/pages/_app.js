import Head from "next/head";
import { Fragment, useEffect, useState } from "react";
import PreLoader from "../src/layout/PreLoader";
import "../styles/glitch.css";
import "../styles/globals.css";
function MyApp({ Component, pageProps }) {
  const [load, setLoad] = useState(true);
  useEffect(() => {
    let minTimePassed = false;
    let contentLoaded = false;

    const maybeHide = () => {
      if (minTimePassed && contentLoaded) {
        setLoad(false);
      }
    };

    // Stay visible for at least 5 seconds.
    const timer = setTimeout(() => {
      minTimePassed = true;
      maybeHide();
    }, 5000);

    // Keep showing until all page assets (images, fonts, etc.) finish loading.
    const handleLoad = () => {
      contentLoaded = true;
      maybeHide();
    };

    if (document.readyState === "complete") {
      handleLoad();
    } else {
      window.addEventListener("load", handleLoad);
    }

    return () => {
      clearTimeout(timer);
      window.removeEventListener("load", handleLoad);
    };
  }, []);

  return (
    <Fragment>
      <Head>
        <title>Bert&apos;s Blog</title>
        {/* <!-- Favicon --> */}

        <link rel="shortcut icon" type="image/x-icon" href="/favicon.ico" />
        {/* <!-- plugin CSS --> */}
        <link
          href="/static/plugin/bootstrap/css/bootstrap.min.css"
          rel="stylesheet"
        />
        <link
          href="/static/plugin/font-awesome/css/all.min.css"
          rel="stylesheet"
        />
        <link href="/static/plugin/et-line/style.css" rel="stylesheet" />
        <link
          href="static/plugin/themify-icons/themify-icons.css"
          rel="stylesheet"
        />
        <link
          href="/static/plugin/owl-carousel/css/owl.carousel.min.css"
          rel="stylesheet"
        />
        <link
          href="/static/plugin/magnific/magnific-popup.css"
          rel="stylesheet"
        />
        <link
          href="/static/plugin/scroll/jquery.mCustomScrollbar.min.css"
          rel="stylesheet"
        />
        {/* <!-- theme css --> */}
        <link href="/static/css/style.css" rel="stylesheet" />

        <link
          href="https://fonts.googleapis.com/css2?family=Rubik:ital,wght@0,300;0,400;0,500;0,700;0,900;1,300;1,400;1,500;1,700;1,900&display=swap"
          rel="stylesheet"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,500;0,600;0,700;0,800;0,900;1,400;1,500;1,600;1,700;1,800;1,900&display=swap"
          rel="stylesheet"
        />
      </Head>
      {load && <PreLoader />}
      <Component {...pageProps} isPreloading={load} />
    </Fragment>
  );
}

export default MyApp;
