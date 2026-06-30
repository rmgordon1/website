import { useEffect, useState } from "react";

export const CDN = "https://dx09qkoz6th2f.cloudfront.net";

// Safari/WebKit is the only engine that renders the HEVC alpha channel in the
// .mov/.mp4 (hvc1) files. Chromium-based browsers will happily decode the HEVC
// stream but drop the alpha (showing an opaque video), so they must be served
// the VP9-alpha .webm instead. All browsers on iOS are WebKit under the hood,
// so they also need the .mp4.
export const usePrefersMovAlpha = () => {
  const [prefersMov, setPrefersMov] = useState(false);

  useEffect(() => {
    const ua = navigator.userAgent || "";
    const isIOS =
      /iP(ad|hone|od)/.test(ua) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    const isSafari =
      /^((?!chrome|chromium|crios|fxios|edg|android).)*safari/i.test(ua);
    setPrefersMov(isIOS || isSafari);
  }, []);

  return prefersMov;
};
