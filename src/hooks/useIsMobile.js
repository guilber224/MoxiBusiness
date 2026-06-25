import { useState, useEffect } from "react";

// Hook responsive — retorna true si la pantalla es menor al breakpoint
export function useIsMobile(breakpoint = 768) {
  const [is, setIs] = useState(() => typeof window !== "undefined" ? window.innerWidth < breakpoint : false);
  useEffect(() => {
    const h = () => setIs(window.innerWidth < breakpoint);
    window.addEventListener("resize", h);
    return () => window.removeEventListener("resize", h);
  }, [breakpoint]);
  return is;
}
