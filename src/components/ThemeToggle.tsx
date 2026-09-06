import { MoonStars, Sun } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";

export default function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return <Button size="icon" variant="secondary" aria-label="Toggle theme" className="h-8 w-8" />;
  }

  const isDark = theme === "dark";

  return (
    <Button
      type="button"
      size="icon"
      variant="secondary"
      aria-label="Toggle dark mode"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      className="h-8 w-8"
    >
      {isDark ? <Sun weight="bold" className="h-4 w-4" /> : <MoonStars weight="bold" className="h-4 w-4" />}
    </Button>
  );
}
