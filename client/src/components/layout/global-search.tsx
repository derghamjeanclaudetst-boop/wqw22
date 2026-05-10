import { useState, useEffect, useRef, useCallback } from "react";
import { Search, X, ClipboardList, Users, Wrench, Receipt, CreditCard, Loader2 } from "lucide-react";
import { useLocation } from "wouter";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface SearchResult {
  id: string;
  type: string;
  title: string;
  subtitle: string;
  href: string;
  badge?: string;
}

const TYPE_CONFIG: Record<string, { icon: any; color: string; bg: string }> = {
  "Work Order":  { icon: ClipboardList, color: "text-blue-600",   bg: "bg-blue-100"  },
  "User":        { icon: Users,         color: "text-purple-600", bg: "bg-purple-100" },
  "Technician":  { icon: Wrench,        color: "text-orange-600", bg: "bg-orange-100" },
  "Invoice":     { icon: Receipt,       color: "text-green-600",  bg: "bg-green-100"  },
  "Payment":     { icon: CreditCard,    color: "text-pink-600",   bg: "bg-pink-100"   },
};

const STATUS_COLOR: Record<string, string> = {
  active:      "bg-green-100 text-green-800",
  pending:     "bg-yellow-100 text-yellow-800",
  completed:   "bg-blue-100 text-blue-800",
  approved:    "bg-blue-100 text-blue-800",
  paid:        "bg-green-100 text-green-800",
  rejected:    "bg-red-100 text-red-800",
  cancelled:   "bg-gray-100 text-gray-700",
  in_progress: "bg-orange-100 text-orange-800",
};

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

export function GlobalSearch() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [, navigate] = useLocation();

  const debouncedQuery = useDebounce(query, 280);

  // Fetch results
  useEffect(() => {
    if (debouncedQuery.length < 2) {
      setResults([]);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    fetch(`/api/search?q=${encodeURIComponent(debouncedQuery)}`)
      .then(r => r.json())
      .then((data: SearchResult[]) => { setResults(data); setActiveIndex(-1); })
      .catch(() => setResults([]))
      .finally(() => setIsLoading(false));
  }, [debouncedQuery]);

  // Close on outside click
  useEffect(() => {
    function handle(e: MouseEvent) {
      if (
        dropdownRef.current && !dropdownRef.current.contains(e.target as Node) &&
        inputRef.current && !inputRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, []);

  // Keyboard shortcut: Ctrl+K / Cmd+K
  useEffect(() => {
    function handle(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        inputRef.current?.focus();
        setIsOpen(true);
      }
      if (e.key === "Escape") {
        setIsOpen(false);
        inputRef.current?.blur();
      }
    }
    document.addEventListener("keydown", handle);
    return () => document.removeEventListener("keydown", handle);
  }, []);

  const handleSelect = useCallback((result: SearchResult) => {
    navigate(result.href);
    setQuery("");
    setResults([]);
    setIsOpen(false);
    inputRef.current?.blur();
  }, [navigate]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen || results.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex(i => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex(i => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && activeIndex >= 0) {
      handleSelect(results[activeIndex]);
    }
  };

  // Group results by type
  const grouped = results.reduce((acc, r) => {
    if (!acc[r.type]) acc[r.type] = [];
    acc[r.type].push(r);
    return acc;
  }, {} as Record<string, SearchResult[]>);

  const showDropdown = isOpen && (query.length >= 2);
  const hasResults = results.length > 0;

  return (
    <div className="relative flex-1 max-w-xl">
      {/* Input */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
        <Input
          ref={inputRef}
          type="text"
          placeholder="Search work orders, users, technicians… (Ctrl+K)"
          value={query}
          onChange={e => { setQuery(e.target.value); setIsOpen(true); }}
          onFocus={() => setIsOpen(true)}
          onKeyDown={handleKeyDown}
          className="pl-9 pr-8 h-9 bg-gray-50 border-gray-200 text-sm focus:bg-white transition-colors"
        />
        {query && (
          <button
            onClick={() => { setQuery(""); setResults([]); inputRef.current?.focus(); }}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
        {isLoading && (
          <Loader2 className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400 animate-spin" />
        )}
      </div>

      {/* Dropdown */}
      {showDropdown && (
        <div
          ref={dropdownRef}
          className="absolute top-full left-0 right-0 mt-1.5 bg-white rounded-xl border border-gray-200 shadow-2xl z-[9999] overflow-hidden"
          style={{ maxHeight: "480px", overflowY: "auto" }}
        >
          {!hasResults && !isLoading && (
            <div className="px-4 py-8 text-center">
              <Search className="h-8 w-8 text-gray-300 mx-auto mb-2" />
              <p className="text-sm text-gray-500">No results for "<strong>{query}</strong>"</p>
            </div>
          )}

          {hasResults && Object.entries(grouped).map(([type, items]) => {
            const cfg = TYPE_CONFIG[type] || { icon: Search, color: "text-gray-600", bg: "bg-gray-100" };
            const Icon = cfg.icon;
            return (
              <div key={type}>
                {/* Group header */}
                <div className="px-3 py-1.5 bg-gray-50 border-b border-gray-100 flex items-center gap-2">
                  <div className={cn("w-5 h-5 rounded flex items-center justify-center", cfg.bg)}>
                    <Icon className={cn("h-3 w-3", cfg.color)} />
                  </div>
                  <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{type}s</span>
                  <span className="text-xs text-gray-400 ml-auto">{items.length}</span>
                </div>
                {/* Results */}
                {items.map((result, idx) => {
                  const globalIdx = results.indexOf(result);
                  const isActive = globalIdx === activeIndex;
                  return (
                    <button
                      key={result.id}
                      className={cn(
                        "w-full text-left px-4 py-2.5 flex items-center gap-3 hover:bg-blue-50 transition-colors border-b border-gray-50 last:border-0",
                        isActive && "bg-blue-50"
                      )}
                      onMouseEnter={() => setActiveIndex(globalIdx)}
                      onClick={() => handleSelect(result)}
                    >
                      <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0", cfg.bg)}>
                        <Icon className={cn("h-4 w-4", cfg.color)} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{result.title}</p>
                        <p className="text-xs text-gray-500 truncate">{result.subtitle}</p>
                      </div>
                      {result.badge && (
                        <Badge className={cn("text-xs flex-shrink-0 capitalize border-0",
                          STATUS_COLOR[result.badge] || "bg-gray-100 text-gray-700"
                        )}>
                          {result.badge.replace(/_/g, " ")}
                        </Badge>
                      )}
                    </button>
                  );
                })}
              </div>
            );
          })}

          {hasResults && (
            <div className="px-4 py-2 bg-gray-50 border-t text-center">
              <p className="text-xs text-gray-400">
                {results.length} result{results.length !== 1 ? "s" : ""} · Press <kbd className="px-1 py-0.5 bg-gray-200 rounded text-xs font-mono">↑↓</kbd> to navigate · <kbd className="px-1 py-0.5 bg-gray-200 rounded text-xs font-mono">Enter</kbd> to go
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
