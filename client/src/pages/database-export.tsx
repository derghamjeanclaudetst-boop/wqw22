import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Download, Database, FileText, Archive, CheckSquare,
  Table2, Shield, AlertTriangle, CheckCircle2, Loader2, RefreshCw,
  ChevronDown, ChevronUp, Info, HardDrive
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────
type TableStat = {
  name: string;
  label: string;
  group: "core" | "system";
  rowCount: number;
  hasSensitive: boolean;
};

type StatsResponse = { tables: TableStat[] };
type ExportFormat = "sql" | "csv" | "json";

const FORMAT_OPTIONS: { id: ExportFormat; label: string; ext: string; icon: typeof Database; desc: string; color: string }[] = [
  {
    id: "sql",
    label: "SQL Dump",
    ext: ".sql",
    icon: Database,
    desc: "Standard SQL INSERT statements — re-importable into any PostgreSQL or MySQL database.",
    color: "border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/20",
  },
  {
    id: "csv",
    label: "CSV Package",
    ext: ".zip",
    icon: Archive,
    desc: "One .csv file per table, packaged as a ZIP — opens in Excel, Google Sheets, or any BI tool.",
    color: "border-purple-200 bg-purple-50 dark:border-purple-800 dark:bg-purple-950/20",
  },
  {
    id: "json",
    label: "JSON Export",
    ext: ".json",
    icon: FileText,
    desc: "All tables as a single JSON object — ideal for re-importing into NOVIQ or other apps.",
    color: "border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/20",
  },
];

const FORMAT_COLORS: Record<ExportFormat, string> = {
  sql: "text-blue-600 dark:text-blue-400",
  csv: "text-purple-600 dark:text-purple-400",
  json: "text-amber-600 dark:text-amber-400",
};

export default function DatabaseExport() {
  const { toast } = useToast();
  const [format, setFormat] = useState<ExportFormat>("csv");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [exporting, setExporting] = useState(false);
  const [fullBackupExporting, setFullBackupExporting] = useState(false);
  const [done, setDone] = useState<{ rows: number; format: ExportFormat } | null>(null);
  const [fullBackupDone, setFullBackupDone] = useState(false);
  const [showSystem, setShowSystem] = useState(false);

  // ── Load table stats ────────────────────────────────────────────────────────
  const { data, isLoading, isError, refetch } = useQuery<StatsResponse>({
    queryKey: ["/api/db-export/stats"],
  });

  const coreTables = data?.tables.filter(t => t.group === "core") ?? [];
  const systemTables = data?.tables.filter(t => t.group === "system") ?? [];
  const allTables = data?.tables ?? [];

  // ── Initialise selection when data arrives ─────────────────────────────────
  if (data && selected.size === 0) {
    setSelected(new Set(coreTables.map(t => t.name)));
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────
  function toggle(name: string) {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(name) ? next.delete(name) : next.add(name);
      return next;
    });
  }

  function selectGroup(tables: TableStat[], val: boolean) {
    setSelected(prev => {
      const next = new Set(prev);
      tables.forEach(t => val ? next.add(t.name) : next.delete(t.name));
      return next;
    });
  }

  const totalSelectedRows = allTables
    .filter(t => selected.has(t.name))
    .reduce((s, t) => s + t.rowCount, 0);

  const selectedList = [...selected];

  // ── Full System Backup ───────────────────────────────────────────────────────
  async function handleFullBackup() {
    setFullBackupExporting(true);
    setFullBackupDone(false);
    try {
      const res = await fetch("/api/db-export/full-backup", {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: "Backup failed" }));
        throw new Error(err.message || "Backup failed");
      }
      const blob = await res.blob();
      const stamp = new Date().toISOString().slice(0, 10);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `noviq-full-backup-${stamp}.sql`;
      a.click();
      URL.revokeObjectURL(url);
      setFullBackupDone(true);
    } catch (e: any) {
      toast({ title: e.message, variant: "destructive" });
    } finally {
      setFullBackupExporting(false);
    }
  }

  // ── Export ──────────────────────────────────────────────────────────────────
  async function handleExport() {
    if (!selectedList.length) {
      toast({ title: "Please select at least one table", variant: "destructive" });
      return;
    }
    setExporting(true);
    setDone(null);
    try {
      const res = await fetch("/api/db-export/download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ format, tables: selectedList }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: "Export failed" }));
        throw new Error(err.message || "Export failed");
      }
      const blob = await res.blob();
      const ext = format === "csv" ? "zip" : format;
      const stamp = new Date().toISOString().slice(0, 10);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `noviq-export-${stamp}.${ext}`;
      a.click();
      URL.revokeObjectURL(url);
      setDone({ rows: totalSelectedRows, format });
    } catch (e: any) {
      toast({ title: e.message, variant: "destructive" });
    } finally {
      setExporting(false);
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex items-center gap-3 mb-8">
        <div className="p-2.5 bg-emerald-600 rounded-xl">
          <Download className="h-6 w-6 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Database Export</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Export your complete NOVIQ database — all tables, all data, any format
          </p>
        </div>
      </div>

      <div className="space-y-6">

        {/* ── Full System Backup Banner ─────────────────────────── */}
        <div className="relative overflow-hidden rounded-2xl border-2 border-gray-800 dark:border-gray-600 bg-gray-900 dark:bg-gray-950 p-6">
          {/* subtle grid bg */}
          <div className="pointer-events-none absolute inset-0 opacity-10"
            style={{ backgroundImage: "linear-gradient(rgba(255,255,255,.1) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.1) 1px,transparent 1px)", backgroundSize: "24px 24px" }} />

          <div className="relative flex flex-col sm:flex-row sm:items-center gap-5">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <HardDrive className="h-5 w-5 text-white" />
                <span className="text-white font-bold text-base tracking-tight">Full System Backup</span>
                <span className="ml-1 text-xs font-mono font-bold px-2 py-0.5 rounded bg-white/10 text-gray-200">.sql</span>
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">VPS Ready</span>
              </div>
              <p className="text-gray-300 text-sm leading-relaxed max-w-xl">
                Exports the <strong className="text-white">complete database</strong> — every table, every row,
                full schema <span className="text-gray-400">(CREATE TABLE)</span>, all foreign key relations,
                indexes, and sequence resets. Drop this file into&nbsp;
                <code className="text-emerald-300 text-xs bg-white/10 px-1 py-0.5 rounded">psql -f noviq-full-backup.sql</code>&nbsp;
                on your VPS to restore everything.
              </p>
              <div className="flex flex-wrap gap-3 mt-3 text-xs text-gray-400">
                <span className="flex items-center gap-1"><CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" /> Full schema DDL</span>
                <span className="flex items-center gap-1"><CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" /> All foreign keys</span>
                <span className="flex items-center gap-1"><CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" /> All indexes</span>
                <span className="flex items-center gap-1"><CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" /> Sequence resets</span>
                <span className="flex items-center gap-1"><CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" /> All permissions &amp; roles</span>
                <span className="flex items-center gap-1"><CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" /> Conflict-safe (ON CONFLICT DO NOTHING)</span>
              </div>
            </div>

            <div className="flex flex-col items-stretch sm:items-end gap-2 shrink-0">
              <Button
                onClick={handleFullBackup}
                disabled={fullBackupExporting}
                size="lg"
                className="gap-2 bg-white text-gray-900 hover:bg-gray-100 font-semibold min-w-[210px] justify-center shadow-lg"
              >
                {fullBackupExporting ? (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin" />
                    Building backup…
                  </>
                ) : (
                  <>
                    <HardDrive className="h-5 w-5" />
                    Download Full Backup
                  </>
                )}
              </Button>
              {fullBackupDone && (
                <span className="flex items-center gap-1.5 text-emerald-300 text-xs justify-end">
                  <CheckCircle2 className="h-3.5 w-3.5" /> Backup downloaded
                </span>
              )}
              <span className="text-gray-500 text-xs text-center sm:text-right">
                PostgreSQL 14+ compatible
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex-1 border-t border-gray-200 dark:border-gray-700" />
          <span className="text-xs text-gray-400 dark:text-gray-600 uppercase tracking-wider font-medium">or export specific tables</span>
          <div className="flex-1 border-t border-gray-200 dark:border-gray-700" />
        </div>

        {/* ── Format Selection ──────────────────────────────────── */}
        <div>
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider mb-3">
            Export Format
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {FORMAT_OPTIONS.map(f => {
              const Icon = f.icon;
              const active = format === f.id;
              return (
                <button
                  key={f.id}
                  onClick={() => setFormat(f.id)}
                  className={cn(
                    "relative text-left rounded-xl border-2 p-4 transition-all",
                    active
                      ? f.color + " ring-2 " + (f.id === "sql" ? "ring-blue-400 dark:ring-blue-600" : f.id === "csv" ? "ring-purple-400 dark:ring-purple-600" : "ring-amber-400 dark:ring-amber-600")
                      : "border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 bg-white dark:bg-gray-900"
                  )}
                >
                  {active && (
                    <span className="absolute top-2 right-2">
                      <CheckCircle2 className={cn("h-4 w-4", FORMAT_COLORS[f.id])} />
                    </span>
                  )}
                  <div className={cn(
                    "w-9 h-9 rounded-lg flex items-center justify-center mb-3",
                    f.id === "sql" && "bg-blue-600 text-white",
                    f.id === "csv" && "bg-purple-600 text-white",
                    f.id === "json" && "bg-amber-500 text-white",
                  )}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className="font-semibold text-gray-900 dark:text-white text-sm">{f.label}</span>
                    <span className={cn("text-xs font-mono font-bold px-1 py-0.5 rounded",
                      f.id === "sql" && "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
                      f.id === "csv" && "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300",
                      f.id === "json" && "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
                    )}>{f.ext}</span>
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">{f.desc}</p>
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Table Selection ───────────────────────────────────── */}
        <div>
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider mb-3">
            Tables to Export
          </h2>

          {isLoading && (
            <div className="flex items-center gap-3 text-gray-500 py-8 justify-center">
              <Loader2 className="h-5 w-5 animate-spin" />
              Loading table info…
            </div>
          )}

          {isError && (
            <Alert variant="destructive">
              <AlertDescription className="flex items-center justify-between">
                Failed to load table statistics
                <Button size="sm" variant="outline" onClick={() => refetch()} className="gap-1.5">
                  <RefreshCw className="h-3.5 w-3.5" /> Retry
                </Button>
              </AlertDescription>
            </Alert>
          )}

          {data && (
            <div className="space-y-4">
              {/* Core Data */}
              <Card>
                <CardHeader className="py-3 px-4 border-b border-gray-100 dark:border-gray-800">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Table2 className="h-4 w-4 text-blue-500" />
                      <CardTitle className="text-sm font-semibold">Core Data</CardTitle>
                      <Badge variant="secondary" className="text-xs">
                        {coreTables.filter(t => selected.has(t.name)).length} / {coreTables.length}
                      </Badge>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => selectGroup(coreTables, true)}
                        className="text-xs text-blue-600 dark:text-blue-400 hover:underline font-medium"
                      >
                        All
                      </button>
                      <span className="text-gray-300 dark:text-gray-700">|</span>
                      <button
                        onClick={() => selectGroup(coreTables, false)}
                        className="text-xs text-gray-500 hover:underline"
                      >
                        None
                      </button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="divide-y divide-gray-100 dark:divide-gray-800">
                    {coreTables.map(t => (
                      <TableRow key={t.name} table={t} checked={selected.has(t.name)} onToggle={() => toggle(t.name)} />
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* System Tables */}
              <Card>
                <CardHeader
                  className="py-3 px-4 border-b border-gray-100 dark:border-gray-800 cursor-pointer select-none"
                  onClick={() => setShowSystem(p => !p)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Shield className="h-4 w-4 text-slate-500" />
                      <CardTitle className="text-sm font-semibold">System Tables</CardTitle>
                      <Badge variant="secondary" className="text-xs">
                        {systemTables.filter(t => selected.has(t.name)).length} / {systemTables.length}
                      </Badge>
                      <Badge className="text-xs bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 border-amber-200 dark:border-amber-800">
                        Sensitive
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2">
                      {showSystem && (
                        <>
                          <button
                            onClick={e => { e.stopPropagation(); selectGroup(systemTables, true); }}
                            className="text-xs text-blue-600 dark:text-blue-400 hover:underline font-medium"
                          >All</button>
                          <span className="text-gray-300 dark:text-gray-700">|</span>
                          <button
                            onClick={e => { e.stopPropagation(); selectGroup(systemTables, false); }}
                            className="text-xs text-gray-500 hover:underline"
                          >None</button>
                        </>
                      )}
                      {showSystem
                        ? <ChevronUp className="h-4 w-4 text-gray-400" />
                        : <ChevronDown className="h-4 w-4 text-gray-400" />
                      }
                    </div>
                  </div>
                </CardHeader>

                {showSystem && (
                  <>
                    <Alert className="mx-4 mt-3 mb-1 border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/20 py-2">
                      <Info className="h-4 w-4 text-amber-600 shrink-0" />
                      <AlertDescription className="text-amber-700 dark:text-amber-300 text-xs">
                        User passwords are automatically excluded. Role and permission structure is included for reference.
                      </AlertDescription>
                    </Alert>
                    <CardContent className="p-0">
                      <div className="divide-y divide-gray-100 dark:divide-gray-800">
                        {systemTables.map(t => (
                          <TableRow key={t.name} table={t} checked={selected.has(t.name)} onToggle={() => toggle(t.name)} />
                        ))}
                      </div>
                    </CardContent>
                  </>
                )}
              </Card>
            </div>
          )}
        </div>

        {/* ── Summary + Export Button ───────────────────────────── */}
        {data && (
          <Card className={cn(
            "border-2 transition-colors",
            selected.size > 0
              ? "border-emerald-200 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-950/10"
              : "border-gray-200 dark:border-gray-700"
          )}>
            <CardContent className="p-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <p className="font-semibold text-gray-900 dark:text-white">
                    {selected.size === 0
                      ? "No tables selected"
                      : `${selected.size} table${selected.size !== 1 ? "s" : ""} · ${totalSelectedRows.toLocaleString()} rows`}
                  </p>
                  <p className="text-sm text-gray-500 mt-0.5">
                    {selected.size > 0
                      ? `Will be exported as ${FORMAT_OPTIONS.find(f => f.id === format)?.label} (${FORMAT_OPTIONS.find(f => f.id === format)?.ext})`
                      : "Select at least one table above"}
                  </p>
                </div>

                <Button
                  onClick={handleExport}
                  disabled={exporting || selected.size === 0}
                  className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white min-w-[180px] justify-center"
                  size="lg"
                >
                  {exporting ? (
                    <>
                      <Loader2 className="h-5 w-5 animate-spin" />
                      Generating…
                    </>
                  ) : (
                    <>
                      <Download className="h-5 w-5" />
                      Export Database
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* ── Success Banner ────────────────────────────────────── */}
        {done && (
          <div className="flex items-start gap-3 p-4 bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800 rounded-xl">
            <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-emerald-800 dark:text-emerald-200">Export downloaded successfully</p>
              <p className="text-sm text-emerald-700 dark:text-emerald-300 mt-0.5">
                {done.rows.toLocaleString()} rows exported as{" "}
                {FORMAT_OPTIONS.find(f => f.id === done.format)?.label}{" "}
                ({FORMAT_OPTIONS.find(f => f.id === done.format)?.ext}).
                Check your downloads folder.
              </p>
            </div>
          </div>
        )}

        {/* ── Info Footer ───────────────────────────────────────── */}
        <div className="flex flex-col sm:flex-row gap-3 text-xs text-gray-400 dark:text-gray-600 border-t border-gray-100 dark:border-gray-800 pt-4">
          <span className="flex items-center gap-1.5">
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" /> Passwords never exported
          </span>
          <span className="flex items-center gap-1.5">
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" /> All data exported as-is, no transformation
          </span>
          <span className="flex items-center gap-1.5">
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" /> Re-importable via Database Import page
          </span>
        </div>
      </div>
    </div>
  );
}

// ─── Table Row Component ──────────────────────────────────────────────────────
function TableRow({ table, checked, onToggle }: { table: TableStat; checked: boolean; onToggle: () => void }) {
  return (
    <label className="flex items-center gap-4 px-4 py-3 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors select-none">
      <button
        type="button"
        onClick={onToggle}
        className={cn(
          "w-5 h-5 rounded flex items-center justify-center shrink-0 border-2 transition-colors",
          checked
            ? "bg-emerald-500 border-emerald-500 text-white"
            : "border-gray-300 dark:border-gray-600 hover:border-emerald-400"
        )}
      >
        {checked && <CheckSquare className="h-3.5 w-3.5" />}
      </button>

      <span className="font-mono text-sm text-gray-800 dark:text-gray-200 flex-1 truncate">{table.name}</span>
      <span className="text-sm text-gray-500 shrink-0 hidden sm:inline">{table.label}</span>

      <div className="flex items-center gap-2 shrink-0 ml-auto">
        {table.hasSensitive && (
          <Badge className="text-xs bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400 border-amber-200 dark:border-amber-800 gap-1">
            <AlertTriangle className="h-2.5 w-2.5" /> passwords excluded
          </Badge>
        )}
        <Badge variant="secondary" className="text-xs tabular-nums">
          {table.rowCount.toLocaleString()} rows
        </Badge>
      </div>
    </label>
  );
}
