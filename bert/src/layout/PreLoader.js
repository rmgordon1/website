import { useEffect, useRef } from "react";
import { CDN, usePrefersMovAlpha } from "../video";

const PreLoader = () => {
  const prefersMov = usePrefersMovAlpha();
  const videoRef = useRef(null);
  const canvasRef = useRef(null);

  useEffect(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    const ctx = canvas.getContext("2d");
    // Offscreen buffer: the video is drawn here once per frame, then every
    // cell samples from this canvas. Copying canvas->canvas is far cheaper
    // than re-uploading the <video> frame on every cell, which is what made
    // the effect look like a slideshow.
    const buffer = document.createElement("canvas");
    const bctx = buffer.getContext("2d");
    // Second offscreen buffer holding a color-inverted copy of the frame.
    // Cells near the cursor blend toward this to invert their colors.
    const invBuffer = document.createElement("canvas");
    const ictx = invBuffer.getContext("2d");

    // Size (CSS px) of each rotating cell. Smaller = denser grid, heavier.
    const CELL = 28;
    // Radius (px) of the cursor's influence on surrounding cells.
    const INFLUENCE_RADIUS = 440;
    // Cells are drawn slightly larger than their slot so rotated corners
    // don't reveal gaps between neighbors.
    const OVERSCAN = 1.5;
    // Per-cell rotation easing (lower = smoother/laggier).
    const EASE = 0.12;

    let dpr = 1;
    let cssW = 0;
    let cssH = 0;
    let cellPx = 0;
    let cols = 0;
    let rows = 0;
    let rotations = new Float32Array(0);
    let inverts = new Float32Array(0);
    let mouseX = -99999;
    let mouseY = -99999;
    let rafId = null;

    const resize = () => {
      cssW = canvas.clientWidth;
      cssH = canvas.clientHeight;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(cssW * dpr);
      canvas.height = Math.round(cssH * dpr);
      buffer.width = canvas.width;
      buffer.height = canvas.height;
      invBuffer.width = canvas.width;
      invBuffer.height = canvas.height;
      // Work entirely in device pixels for speed (no per-frame setTransform).
      cellPx = CELL * dpr;
      cols = Math.max(1, Math.ceil(canvas.width / cellPx));
      rows = Math.max(1, Math.ceil(canvas.height / cellPx));
      rotations = new Float32Array(cols * rows);
      inverts = new Float32Array(cols * rows);
    };

    const handlePointerMove = (e) => {
      const rect = canvas.getBoundingClientRect();
      mouseX = e.clientX - rect.left;
      mouseY = e.clientY - rect.top;
    };

    const handlePointerLeave = () => {
      mouseX = -99999;
      mouseY = -99999;
    };

    // Compute the source rect to sample so the video maps like objectFit: cover.
    const getCoverRect = (vw, vh) => {
      const canvasAspect = canvas.width / canvas.height;
      const videoAspect = vw / vh;
      if (videoAspect > canvasAspect) {
        const sh = vh;
        const sw = vh * canvasAspect;
        return { sx: (vw - sw) / 2, sy: 0, sw, sh };
      }
      const sw = vw;
      const sh = vw / canvasAspect;
      return { sx: 0, sy: (vh - sh) / 2, sw, sh };
    };

    const draw = () => {
      rafId = requestAnimationFrame(draw);

      const vw = video.videoWidth;
      const vh = video.videoHeight;
      if (video.readyState < 2 || !vw || !vh) return;

      // 1) Draw the current video frame into the offscreen buffer once,
      //    cover-fitted to fill the whole buffer.
      const { sx, sy, sw, sh } = getCoverRect(vw, vh);
      bctx.drawImage(video, sx, sy, sw, sh, 0, 0, buffer.width, buffer.height);

      // Build the inverted copy of the current frame once per frame.
      ictx.clearRect(0, 0, invBuffer.width, invBuffer.height);
      ictx.filter = "invert(1)";
      ictx.drawImage(buffer, 0, 0);
      ictx.filter = "none";

      // 2) Re-tile the buffer onto the visible canvas, rotating each cell.
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const mx = mouseX * dpr;
      const my = mouseY * dpr;
      const radius = INFLUENCE_RADIUS * dpr;
      const dSize = cellPx * OVERSCAN;
      const half = dSize / 2;

      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const idx = r * cols + c;
          const cx = c * cellPx + cellPx / 2;
          const cy = r * cellPx + cellPx / 2;

          // Target rotation: cells point toward the cursor, scaled by how
          // close they are to it (a flow-field-like swirl around the pointer).
          let target = 0;
          let invTarget = 0;
          const dx = mx - cx;
          const dy = my - cy;
          const dist = Math.hypot(dx, dy);
          if (dist < radius) {
            const influence = 1 - dist / radius;
            target = Math.atan2(dy, dx) * influence;
            invTarget = influence;
          }
          rotations[idx] += (target - rotations[idx]) * EASE;
          inverts[idx] += (invTarget - inverts[idx]) * EASE;
          const rot = rotations[idx];
          const inv = inverts[idx];

          ctx.save();
          ctx.translate(cx, cy);
          if (rot) ctx.rotate(rot);
          // Source region on the buffer matches this cell's slot (overscanned).
          ctx.drawImage(
            buffer,
            cx - half,
            cy - half,
            dSize,
            dSize,
            -half,
            -half,
            dSize,
            dSize
          );
          // Blend the inverted version on top, fading in with cursor proximity.
          if (inv > 0.01) {
            ctx.globalAlpha = inv;
            ctx.drawImage(
              invBuffer,
              cx - half,
              cy - half,
              dSize,
              dSize,
              -half,
              -half,
              dSize,
              dSize
            );
            ctx.globalAlpha = 1;
          }
          ctx.restore();
        }
      }
    };

    resize();
    const playPromise = video.play();
    if (playPromise && playPromise.catch) playPromise.catch(() => {});

    window.addEventListener("resize", resize);
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerleave", handlePointerLeave);
    rafId = requestAnimationFrame(draw);

    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerleave", handlePointerLeave);
    };
  }, [prefersMov]);

  return (
    <div
      id="loading"
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: "#000",
        zIndex: 99999,
        overflow: "hidden",
      }}
    >
      {/* Source video for the effect. It is intentionally NOT hidden with
          opacity:0 / visibility:hidden / display:none, because browsers
          throttle frame decoding of videos with no visible pixels (which made
          the sampled output look like a low-fps slideshow). Instead it stays
          fully visible but is physically covered by the opaque canvas above
          it (occlusion does not trigger decode throttling), so it keeps
          decoding at its native frame rate while never being seen directly. */}
      <video
        ref={videoRef}
        key={prefersMov ? "mov" : "webm"}
        autoPlay
        muted
        loop
        playsInline
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: "100%",
          height: "100%",
          objectFit: "cover",
          objectPosition: "center",
          pointerEvents: "none",
          zIndex: 0,
        }}
      >
        {prefersMov ? (
          <source src={`${CDN}/preloader/tar_tile.mp4`} type="video/mp4" codecs="hvc1" />
        ) : (
          <source src={`${CDN}/preloader/tar_tile.webm`} type="video/webm" />
        )}
      </video>
      <canvas
        ref={canvasRef}
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: "100%",
          height: "100%",
          zIndex: 1,
        }}
      />
      <video
        key={prefersMov ? "mov-skull" : "webm-skull"}
        autoPlay
        muted
        loop
        playsInline
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: "100%",
          height: "100%",
          objectFit: "cover",
          objectPosition: "center",
          zIndex: 2,
        }}
      >
        {prefersMov ? (
          <source src={`${CDN}/preloader/skull_nodither.mp4`} type="video/mp4" codecs="hvc1" />
        ) : (
          <source src={`${CDN}/preloader/skull_nodither.webm`} type="video/webm" />
        )}
      </video>
      <div className="load-circle" style={{ zIndex: 3 }}>
        <span className="one" />
      </div>
    </div>
  );
};
export default PreLoader;
