import React, { createContext, useContext, useEffect, useState } from "react";

type Theme = "dark" | "light";

interface ThemeContextType {
  theme: Theme;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // Always default to dark theme regardless of system preference or saved preference
  const [theme, setTheme] = useState<Theme>("dark");

  useEffect(() => {
    const root = window.document.documentElement;
    
    // Force dark mode by removing light class and adding dark
    root.classList.remove("light");
    root.classList.add("dark");
    localStorage.setItem("theme", "dark");
  }, []);

  // Keep toggle functionality but always reset to dark mode
  const toggleTheme = () => {
    // Instead of toggling, always force dark theme
    setTheme("dark");
    localStorage.setItem("theme", "dark");
    window.document.documentElement.classList.remove("light");
    window.document.documentElement.classList.add("dark");
  };

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
};
