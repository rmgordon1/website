import { useCallback, useLayoutEffect, useRef, useState } from "react";

const LOBSTER_SRC = "/static/img/bert/lobsterphone.jpg";

/** Same vertical budget as CSS: min-height: clamp(360px, 68vh, 760px) */
function lobsterStageHeightBudget() {
  if (typeof window === "undefined") return 560;
  return Math.min(760, Math.max(360, Math.round(window.innerHeight * 0.68)));
}

const Contact = () => {
  const sectionRef = useRef(null);
  const imgRef = useRef(null);
  const [drawn, setDrawn] = useState({ w: 0, h: 0 });

  const measure = useCallback(() => {
    const section = sectionRef.current;
    const img = imgRef.current;
    if (!section || !img?.naturalWidth) return;
    const W = section.clientWidth;
    if (W < 1) return;
    const H = lobsterStageHeightBudget();
    const iw = img.naturalWidth;
    const ih = img.naturalHeight;
    const scale = Math.min(W / iw, H / ih);
    setDrawn({
      w: Math.round(iw * scale),
      h: Math.round(ih * scale),
    });
  }, []);

  useLayoutEffect(() => {
    measure();
    const section = sectionRef.current;
    if (!section) return undefined;
    const ro = new ResizeObserver(() => measure());
    ro.observe(section);
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [measure]);

  const contactBgStyle = {
    backgroundImage: "url('/static/img/bert/matrix-code_02.gif')",
    backgroundSize: "cover",
    backgroundPosition: "center",
    backgroundRepeat: "no-repeat",
  };

  const columnStyle = {
    width: drawn.w > 0 ? drawn.w : "100%",
    maxWidth: "100%",
  };

  const stageStyle =
    drawn.h > 0
      ? {
          minHeight: drawn.h,
          height: drawn.h,
        }
      : undefined;

  return (
    <section
      ref={sectionRef}
      id="contactus"
      data-nav-tooltip="Contact Me"
      className="pp-section pp-scrollable section contact-lobster-bg"
      style={contactBgStyle}
    >
      <div className="contact-lobster-column" style={columnStyle}>
        <div className="contact-lobster-heading-bar">
          <div className="title contact-lobster-heading">
            <h3>Get in touch</h3>
          </div>
        </div>

        <div
          className="contact-lobster-stage"
          style={stageStyle}
        >
          <img
            ref={imgRef}
            className="contact-lobster-img"
            src={LOBSTER_SRC}
            alt=""
            onLoad={measure}
            draggable={false}
            style={drawn.w > 0 ? { width: drawn.w, height: drawn.h } : undefined}
          />
        </div>

        <div className="contact-lobster-footer-bar">
          <address className="contact-lobster-contact-lines">
            <div className="contact-lobster-row">
              <i className="ti-email" aria-hidden="true" />
              <a href="mailto:robertmgordon15@gmail.com">robertmgordon15@gmail.com</a>
              <i className="ti-email" aria-hidden="true" />
            </div>
            <div className="contact-lobster-row">
              <i className="ti-mobile" aria-hidden="true" />
              <a href="tel:+19084479562">+1 908 447 9562</a>
              <i className="ti-mobile" aria-hidden="true" />
            </div>
          </address>
        </div>
      </div>
    </section>
  );
};
export default Contact;
