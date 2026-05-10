import { Menu, Sun, Moon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NotificationDropdown } from "@/components/notifications/notification-dropdown";
import { GlobalSearch } from "./global-search";
import { useTheme } from "@/hooks/use-theme";

interface HeaderProps {
  onMenuClick: () => void;
}

export function Header({ onMenuClick }: HeaderProps) {
  const { theme, toggleTheme } = useTheme();

  return (
    <div className="relative z-10 flex-shrink-0 flex h-14 sm:h-16 bg-white dark:bg-gray-900 shadow-sm border-b border-gray-200 dark:border-gray-700">
      <Button
        variant="ghost"
        size="sm"
        className="px-3 sm:px-4 border-r border-gray-200 dark:border-gray-700 text-gray-500 lg:hidden"
        onClick={onMenuClick}
      >
        <Menu className="h-4 w-4 sm:h-5 sm:w-5" />
      </Button>

      <div className="flex-1 px-3 sm:px-4 md:px-6 flex items-center gap-3">
        <GlobalSearch />
        <div className="flex items-center ml-auto gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={toggleTheme}
            className="text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100"
            title={theme === "light" ? "Switch to dark mode" : "Switch to light mode"}
          >
            {theme === "light" ? (
              <Moon className="h-4 w-4 sm:h-5 sm:w-5" />
            ) : (
              <Sun className="h-4 w-4 sm:h-5 sm:w-5" />
            )}
          </Button>
          <NotificationDropdown />
        </div>
      </div>
    </div>
  );
}
