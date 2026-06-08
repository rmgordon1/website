import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";

const VALID_SECTIONS = ["home", "about", "services", "work", "contactus"];

const PageContext = createContext({
  active: "home",
  setActive: () => {},
});

export const PageProvider = ({ children }) => {
  const [active, setActiveState] = useState("home");

  const setActive = (id) => {
    if (!VALID_SECTIONS.includes(id)) return;
    setActiveState(id);
    if (typeof window !== "undefined") {
      window.history.replaceState(null, "", `#${id}`);
      window.scrollTo({ top: 0, behavior: "auto" });
    }
  };

  useEffect(() => {
    const syncFromHash = () => {
      const hash = window.location.hash.replace("#", "");
      if (VALID_SECTIONS.includes(hash)) {
        setActiveState(hash);
      }
    };
    syncFromHash();
    window.addEventListener("hashchange", syncFromHash);
    return () => window.removeEventListener("hashchange", syncFromHash);
  }, []);

  return (
    <PageContext.Provider value={{ active, setActive }}>
      {children}
    </PageContext.Provider>
  );
};

export const usePage = () => useContext(PageContext);
