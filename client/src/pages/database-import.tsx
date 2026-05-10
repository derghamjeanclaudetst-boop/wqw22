import { useState, useCallback, useRef } from "react";
import { useMutation } from "@tanstack/react-query";
import {
  Upload, Database, FileText, Archive, ChevronRight, ChevronLeft,
  CheckCircle2, XCircle, AlertTriangle, RotateCcw, Eye, EyeOff,
  Table2, Zap, Info, ArrowRight, TrendingUp
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { cn } from "@/lib/utils";

// ─── Field Definitions ───────────────────────────────────────────────────────
const WORK_ORDER_FIELDS = [
  { value: "title", label: "Title", required: true },
  { value: "clientWorkOrderNumber", label: "Client WO Number", required: false },
  { value: "description", label: "Description", required: false },
  { value: "clientName", label: "Client Name", required: false },
  { value: "clientPhone", label: "Client Phone", required: false },
  { value: "clientEmail", label: "Client Email", required: false },
  { value: "location", label: "Location / Site Address", required: false },
  { value: "city", label: "City", required: false },
  { value: "country", label: "Country", required: false },
  { value: "street", label: "Street", required: false },
  { value: "zipCode", label: "Zip Code", required: false },
  { value: "category", label: "Category / Service Type", required: false },
  { value: "priority", label: "Priority", required: false },
  { value: "status", label: "Status", required: false },
  { value: "scheduledDate", label: "Scheduled Date", required: false },
  { value: "startDate", label: "Start Date", required: false },
  { value: "endDate", label: "End Date", required: false },
  { value: "nte", label: "NTE / Budget Limit", required: false },
  { value: "estimatedHours", label: "Estimated Hours", required: false },
  { value: "equipmentType", label: "Equipment Type", required: false },
  { value: "problemDescription", label: "Problem Description", required: false },
  { value: "specialInstructions", label: "Special Instructions", required: false },
];

const TECHNICIAN_FIELDS = [
  { value: "fullName", label: "Full Name (auto-split → First + Last)", required: false },
  { value: "firstName", label: "First Name", required: true },
  { value: "lastName", label: "Last Name", required: true },
  { value: "email", label: "Email", required: true },
  { value: "phone", label: "Phone", required: false },
  { value: "specialization", label: "Specialization / Trade", required: false },
  { value: "experience", label: "Experience (years)", required: false },
  { value: "hourlyRate", label: "Hourly Rate", required: false },
  { value: "availability", label: "Availability", required: false },
  { value: "location", label: "Location / Territory", required: false },
  { value: "paymentMethods", label: "Payment Methods", required: false },
  { value: "bankAccount", label: "Bank Account", required: false },
  { value: "routingNumber", label: "Routing Number", required: false },
  { value: "bankName", label: "Bank Name", required: false },
  { value: "paypalEmail", label: "PayPal Email", required: false },
  { value: "venmoHandle", label: "Venmo Handle", required: false },
  { value: "cashappHandle", label: "CashApp Handle", required: false },
  { value: "zelleInfo", label: "Zelle Info", required: false },
  { value: "mailingAddress", label: "Mailing Address", required: false },
];

// ─── Client-side column heuristic (mirrors server-side logic) ────────────────
function guessField(col: string, target: "work_orders" | "technicians"): string | null {
  const c = col.toLowerCase().replace(/[\s_\-\.]/g, "");
  if (target === "work_orders") {
    if (/^(title|subject|jobname|ordertitle|workordertitle|jobtitle|servicetitle)$/.test(c)) return "title";
    if (/^(desc|description|notes|jobdesc|details|summary|jobdescription)$/.test(c)) return "description";
    if (/^(priority|prioritylevel|urgency)$/.test(c)) return "priority";
    if (/^(status|state|workstatus|jobstatus|orderstatus)$/.test(c)) return "status";
    if (/^(category|type|jobtype|worktype|servicetype|service)$/.test(c)) return "category";
    if (/^(location|address|site|jobsite|serviceaddress|sitelocation|siteaddress)$/.test(c)) return "location";
    if (/^(clientname|customername|client|customer|accountname|storename|companyname)$/.test(c)) return "clientName";
    if (/^(clientphone|customerphone|phone|telephone|phonenumber|contactphone)$/.test(c)) return "clientPhone";
    if (/^(clientemail|customeremail|email|emailaddress|contactemail)$/.test(c)) return "clientEmail";
    if (/^(country|countrycode|nation)$/.test(c)) return "country";
    if (/^(city|cityname|town|municipality)$/.test(c)) return "city";
    if (/^(street|streetaddress|address1|addressline1|streetname)$/.test(c)) return "street";
    if (/^(zip|zipcode|postalcode|postcode|postal)$/.test(c)) return "zipCode";
    if (/^(nte|nteamount|nottoexceed|maxcost|budgetlimit|budget)$/.test(c)) return "nte";
    if (/^(scheduledate|scheduleddate|duedate|targetdate|appointmentdate|scheddate)$/.test(c)) return "scheduledDate";
    if (/^(startdate|starttime|begindate|jobstart)$/.test(c)) return "startDate";
    if (/^(enddate|endtime|closedate|completiondate|jobend)$/.test(c)) return "endDate";
    if (/^(estimatedhours|esthours|estimatedtime|laborhours|manhours)$/.test(c)) return "estimatedHours";
    if (/^(equipmenttype|equipment|asset|assettype|machinetype|assetname)$/.test(c)) return "equipmentType";
    if (/^(problemdesc|problemdescription|problem|issue|faultdesc|symptom|fault)$/.test(c)) return "problemDescription";
    if (/^(specialinstructions|specialnotes|instructions|specialreq)$/.test(c)) return "specialInstructions";
    if (/^(clientworkordernumber|clientwon|externalwon|externalid|clientid|workordernumber|won|jobno|jobnumber|ordernumber|ponumber|po|ponum|workorder)$/.test(c)) return "clientWorkOrderNumber";
  } else {
    if (/^(firstname|fname|givenname|first)$/.test(c)) return "firstName";
    if (/^(lastname|lname|surname|familyname|last)$/.test(c)) return "lastName";
    if (/^(fullname|name|technicianname|workername|displayname)$/.test(c)) return "fullName";
    if (/^(email|emailaddress|mail)$/.test(c)) return "email";
    if (/^(phone|phonenumber|telephone|mobile|cell|cellphone|contact)$/.test(c)) return "phone";
    if (/^(specialization|specialty|skill|trade|expertise|department|discipline)$/.test(c)) return "specialization";
    if (/^(experience|yearsofexperience|years|expyears|yrs)$/.test(c)) return "experience";
    if (/^(hourlyrate|rate|payrate|hourly|rateperhr|wagerate)$/.test(c)) return "hourlyRate";
    if (/^(availability|available|availstatus)$/.test(c)) return "availability";
    if (/^(location|city|area|region|territory|zone)$/.test(c)) return "location";
    if (/^(paymentmethods|paymethod|paymentmethod)$/.test(c)) return "paymentMethods";
  }
  return null;
}

function buildAutoMapping(columns: string[], target: "work_orders" | "technicians"): Record<string, string> {
  const mapping: Record<string, string> = {};
  for (const col of columns) {
    const field = guessField(col, target);
    if (field) mapping[col] = field;
  }
  return mapping;
}

// ─── Types ────────────────────────────────────────────────────────────────────
type ParsedTable = {
  columns: string[];
  rowCount: number;
  sampleRows: Record<string, string>[];
  allRows: Record<string, string>[];
  truncated: boolean;
};

type ParseResponse = {
  tables: Record<string, ParsedTable>;
  fileName: string;
};

type ExecuteResponse = {
  totalImported: number;
  totalSkipped: number;
  totalFailed: number;
  tables: Array<{ table: string; imported: number; skipped: number; failed: number; errors: string[] }>;
};

type EntityTarget = "work_orders" | "technicians" | "skip";

type TableConfig = {
  sourceName: string;
  targetEntity: EntityTarget;
  columnMapping: Record<string, string>;
  showSample: boolean;
  showMapping: boolean;
};

// ─── Step Indicator ───────────────────────────────────────────────────────────
const STEPS = ["Upload", "Tables", "Column Mapping", "Results"];

function StepIndicator({ current }: { current: number }) {
  return (
    <div className="flex items-center justify-center gap-0 mb-8">
      {STEPS.map((label, idx) => {
        const state = idx < current ? "done" : idx === current ? "active" : "pending";
        return (
          <div key={label} className="flex items-center">
            <div className="flex flex-col items-center gap-1">
              <div className={cn(
                "w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold transition-all",
                state === "done" && "bg-emerald-500 text-white",
                state === "active" && "bg-blue-600 text-white ring-4 ring-blue-100 dark:ring-blue-900",
                state === "pending" && "bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400",
              )}>
                {state === "done" ? <CheckCircle2 className="h-5 w-5" /> : idx + 1}
              </div>
              <span className={cn(
                "text-xs font-medium hidden sm:block",
                state === "active" ? "text-blue-600 dark:text-blue-400" : "text-gray-400"
              )}>{label}</span>
            </div>
            {idx < STEPS.length - 1 && (
              <div className={cn(
                "h-0.5 w-12 sm:w-20 mb-5 mx-1 transition-colors",
                idx < current ? "bg-emerald-400" : "bg-gray-200 dark:bg-gray-700"
              )} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Format Detection ─────────────────────────────────────────────────────────
function detectFormat(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase();
  if (ext === "sql") return "SQL Dump";
  if (ext === "zip") return "CSV Package";
  if (ext === "json") return "JSON Export";
  return "Unknown";
}

function FormatBadge({ filename }: { filename: string }) {
  const fmt = detectFormat(filename);
  const ext = filename.split(".").pop()?.toLowerCase();
  return (
    <Badge className={cn(
      "gap-1.5 text-xs font-medium",
      ext === "sql" && "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 border-blue-200 dark:border-blue-800",
      ext === "zip" && "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300 border-purple-200 dark:border-purple-800",
      ext === "json" && "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 border-amber-200 dark:border-amber-800",
    )}>
      {ext === "sql" && <Database className="h-3 w-3" />}
      {ext === "zip" && <Archive className="h-3 w-3" />}
      {ext === "json" && <FileText className="h-3 w-3" />}
      {fmt}
    </Badge>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function DatabaseImport() {
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const [step, setStep] = useState(0);
  const [parseResult, setParseResult] = useState<ParseResponse | null>(null);
  const [tableConfigs, setTableConfigs] = useState<TableConfig[]>([]);
  const [executeResult, setExecuteResult] = useState<ExecuteResponse | null>(null);
  const [currentMappingTable, setCurrentMappingTable] = useState(0);

  // ── Parse mutation ──────────────────────────────────────────────────────────
  const parseMutation = useMutation({
    mutationFn: async (file: File) => {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/db-import/parse", {
        method: "POST",
        body: form,
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: "Upload failed" }));
        throw new Error(err.message || "Upload failed");
      }
      return res.json() as Promise<ParseResponse>;
    },
    onSuccess: (data) => {
      setParseResult(data);
      const configs: TableConfig[] = Object.entries(data.tables).map(([name, tbl]) => {
        const guessedTarget: EntityTarget =
          /technician|worker|staff|employee|contractor|crew/.test(name) ? "technicians" :
          /work_order|workorder|job|order|ticket|task|service|request/.test(name) ? "work_orders" :
          "skip";
        return {
          sourceName: name,
          targetEntity: guessedTarget,
          columnMapping: guessedTarget !== "skip" ? buildAutoMapping(tbl.columns, guessedTarget) : {},
          showSample: false,
          showMapping: false,
        };
      });
      setTableConfigs(configs);
      setStep(1);
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  // ── Execute mutation ────────────────────────────────────────────────────────
  const executeMutation = useMutation({
    mutationFn: (payload: object) =>
      apiRequest("POST", "/api/db-import/execute", payload).then(r => r.json()) as Promise<ExecuteResponse>,
    onSuccess: (data) => {
      setExecuteResult(data);
      setStep(3);
      queryClient.invalidateQueries({ queryKey: ["/api/technicians"] });
      queryClient.invalidateQueries({ queryKey: ["/api/work-orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  // ── File handling ───────────────────────────────────────────────────────────
  const handleFile = useCallback((file: File) => {
    const ext = file.name.split(".").pop()?.toLowerCase();
    if (!["sql", "zip", "json"].includes(ext || "")) {
      toast({ title: "Unsupported format. Please use .sql, .zip, or .json", variant: "destructive" });
      return;
    }
    parseMutation.mutate(file);
  }, [parseMutation, toast]);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const onFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    e.target.value = "";
  }, [handleFile]);

  // ── Config helpers ──────────────────────────────────────────────────────────
  function setTarget(idx: number, target: EntityTarget) {
    setTableConfigs(prev => prev.map((c, i) => {
      if (i !== idx) return c;
      const autoMap = target !== "skip"
        ? buildAutoMapping(parseResult!.tables[c.sourceName].columns, target)
        : {};
      return { ...c, targetEntity: target, columnMapping: autoMap };
    }));
  }

  function setMapping(tableIdx: number, srcCol: string, noviqField: string) {
    setTableConfigs(prev => prev.map((c, i) => {
      if (i !== tableIdx) return c;
      return { ...c, columnMapping: { ...c.columnMapping, [srcCol]: noviqField } };
    }));
  }

  function toggleSample(idx: number) {
    setTableConfigs(prev => prev.map((c, i) => i === idx ? { ...c, showSample: !c.showSample } : c));
  }

  function toggleMapping(idx: number) {
    setTableConfigs(prev => prev.map((c, i) => i === idx ? { ...c, showMapping: !c.showMapping } : c));
  }

  // ── Execute ─────────────────────────────────────────────────────────────────
  function doExecute() {
    if (!parseResult) return;
    const tables = tableConfigs
      .filter(c => c.targetEntity !== "skip")
      .map(c => ({
        sourceName: c.sourceName,
        targetEntity: c.targetEntity,
        columnMapping: c.columnMapping,
        rows: parseResult.tables[c.sourceName].allRows,
      }));
    if (!tables.length) {
      toast({ title: "No tables selected for import", variant: "destructive" });
      return;
    }
    executeMutation.mutate({ tables });
  }

  // ── Reset ───────────────────────────────────────────────────────────────────
  function reset() {
    setStep(0);
    setParseResult(null);
    setTableConfigs([]);
    setExecuteResult(null);
    setCurrentMappingTable(0);
  }

  const selectedTables = tableConfigs.filter(c => c.targetEntity !== "skip");
  const totalRows = selectedTables.reduce(
    (s, c) => s + (parseResult?.tables[c.sourceName].rowCount || 0), 0
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // Render
  // ═══════════════════════════════════════════════════════════════════════════
  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <div className="p-2.5 bg-blue-600 rounded-xl">
            <Database className="h-6 w-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Database Import</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Import full databases with tables and relations — SQL dumps, CSV packages, or JSON exports
            </p>
          </div>
        </div>
      </div>

      <StepIndicator current={step} />

      {/* ── STEP 0: Upload ── */}
      {step === 0 && (
        <div className="space-y-6">
          {/* Format cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[
              {
                ext: "sql", icon: <Database className="h-7 w-7" />, label: "SQL Dump",
                desc: "MySQL / PostgreSQL export files. Supports both INSERT INTO and COPY FROM stdin formats.",
                color: "border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/20",
                badge: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
              },
              {
                ext: "zip", icon: <Archive className="h-7 w-7" />, label: "CSV Package",
                desc: "A ZIP file containing multiple CSV files — each CSV becomes one table.",
                color: "border-purple-200 bg-purple-50 dark:border-purple-800 dark:bg-purple-950/20",
                badge: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300",
              },
              {
                ext: "json", icon: <FileText className="h-7 w-7" />, label: "JSON Export",
                desc: "JSON file with table data — supports single arrays or multi-table objects.",
                color: "border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/20",
                badge: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
              },
            ].map(f => (
              <div key={f.ext} className={cn("rounded-xl border-2 p-5 flex flex-col gap-3", f.color)}>
                <div className={cn("w-12 h-12 rounded-lg flex items-center justify-center text-white", {
                  "bg-blue-600": f.ext === "sql",
                  "bg-purple-600": f.ext === "zip",
                  "bg-amber-500": f.ext === "json",
                })}>
                  {f.icon}
                </div>
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <p className="font-semibold text-gray-900 dark:text-white">{f.label}</p>
                    <span className={cn("text-xs font-mono font-bold px-1.5 py-0.5 rounded", f.badge)}>.{f.ext}</span>
                  </div>
                  <p className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed">{f.desc}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Drop zone */}
          <div
            className={cn(
              "relative border-2 border-dashed rounded-2xl p-16 flex flex-col items-center justify-center gap-4 cursor-pointer transition-all",
              dragging
                ? "border-blue-500 bg-blue-50 dark:bg-blue-950/20 scale-[1.01]"
                : "border-gray-300 dark:border-gray-600 hover:border-blue-400 hover:bg-gray-50 dark:hover:bg-gray-800/50"
            )}
            onDragOver={e => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            onClick={() => fileRef.current?.click()}
          >
            <input ref={fileRef} type="file" accept=".sql,.zip,.json" className="hidden" onChange={onFileChange} />

            {parseMutation.isPending ? (
              <>
                <div className="w-14 h-14 rounded-full border-4 border-blue-200 border-t-blue-600 animate-spin" />
                <div className="text-center">
                  <p className="font-semibold text-gray-800 dark:text-gray-200">Parsing your file…</p>
                  <p className="text-sm text-gray-500">Detecting tables, columns and rows</p>
                </div>
              </>
            ) : (
              <>
                <div className="p-4 bg-gray-100 dark:bg-gray-800 rounded-full">
                  <Upload className="h-10 w-10 text-gray-400" />
                </div>
                <div className="text-center">
                  <p className="text-lg font-semibold text-gray-800 dark:text-gray-200">Drop your database file here</p>
                  <p className="text-sm text-gray-500 mt-1">or click to browse — .sql, .zip, .json up to 50 MB</p>
                </div>
                <Button variant="outline" className="pointer-events-none">Choose File</Button>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── STEP 1: Table Selection ── */}
      {step === 1 && parseResult && (
        <div className="space-y-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <FormatBadge filename={parseResult.fileName} />
              <span className="text-sm text-gray-600 dark:text-gray-400 font-medium">{parseResult.fileName}</span>
            </div>
            <span className="text-sm text-gray-500">
              {Object.keys(parseResult.tables).length} table{Object.keys(parseResult.tables).length !== 1 ? "s" : ""} detected
            </span>
          </div>

          <Alert className="border-blue-200 bg-blue-50 dark:bg-blue-950/20 dark:border-blue-800">
            <Info className="h-4 w-4 text-blue-600" />
            <AlertDescription className="text-blue-700 dark:text-blue-300 text-sm">
              For each detected table, choose which NOVIQ entity to import it into. Tables set to <strong>Skip</strong> will not be imported.
            </AlertDescription>
          </Alert>

          <div className="space-y-3">
            {tableConfigs.map((config, idx) => {
              const tbl = parseResult.tables[config.sourceName];
              const mappedCount = Object.values(config.columnMapping).filter(Boolean).length;
              return (
                <Card key={config.sourceName} className={cn(
                  "border transition-colors",
                  config.targetEntity === "skip" && "opacity-60",
                  config.targetEntity === "work_orders" && "border-blue-200 dark:border-blue-800",
                  config.targetEntity === "technicians" && "border-emerald-200 dark:border-emerald-800",
                )}>
                  <CardContent className="p-0">
                    {/* Table header row */}
                    <div className="flex items-center gap-4 p-4 flex-wrap">
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <Table2 className="h-4 w-4 text-gray-400 shrink-0" />
                        <span className="font-mono font-semibold text-gray-900 dark:text-white truncate">{config.sourceName}</span>
                        <Badge variant="secondary" className="shrink-0 text-xs">
                          {tbl.rowCount.toLocaleString()} rows
                        </Badge>
                        <Badge variant="outline" className="shrink-0 text-xs text-gray-400">
                          {tbl.columns.length} cols
                        </Badge>
                        {tbl.truncated && (
                          <Badge className="shrink-0 text-xs bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
                            Capped at 10k rows
                          </Badge>
                        )}
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <Select
                          value={config.targetEntity}
                          onValueChange={v => setTarget(idx, v as EntityTarget)}
                        >
                          <SelectTrigger className="w-44 h-8 text-sm">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="work_orders">→ Work Orders</SelectItem>
                            <SelectItem value="technicians">→ Technicians</SelectItem>
                            <SelectItem value="skip">Skip this table</SelectItem>
                          </SelectContent>
                        </Select>

                        <Button
                          size="sm" variant="ghost"
                          className="h-8 gap-1.5 text-xs"
                          onClick={() => toggleSample(idx)}
                        >
                          {config.showSample ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                          Preview
                        </Button>
                      </div>
                    </div>

                    {/* Column pills */}
                    <div className="px-4 pb-3 flex flex-wrap gap-1.5">
                      {tbl.columns.slice(0, 12).map(col => {
                        const mapped = config.columnMapping[col];
                        return (
                          <span key={col} className={cn(
                            "px-2 py-0.5 rounded text-xs font-mono",
                            mapped
                              ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"
                              : "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400"
                          )}>
                            {col}{mapped ? ` → ${mapped}` : ""}
                          </span>
                        );
                      })}
                      {tbl.columns.length > 12 && (
                        <span className="px-2 py-0.5 rounded text-xs text-gray-400">
                          +{tbl.columns.length - 12} more
                        </span>
                      )}
                    </div>

                    {/* Auto-mapping summary */}
                    {config.targetEntity !== "skip" && (
                      <div className="px-4 pb-3 flex items-center gap-2">
                        <Zap className="h-3.5 w-3.5 text-amber-500" />
                        <span className="text-xs text-gray-500">
                          {mappedCount} of {tbl.columns.length} columns auto-matched
                          {mappedCount < tbl.columns.length && " — adjust in Column Mapping step"}
                        </span>
                      </div>
                    )}

                    {/* Sample data */}
                    {config.showSample && tbl.sampleRows.length > 0 && (
                      <div className="border-t border-gray-100 dark:border-gray-800 p-4 overflow-x-auto">
                        <p className="text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wider">Sample Data (first 5 rows)</p>
                        <table className="text-xs w-full">
                          <thead>
                            <tr className="border-b border-gray-200 dark:border-gray-700">
                              {tbl.columns.slice(0, 8).map(col => (
                                <th key={col} className="px-2 py-1 text-left text-gray-500 font-mono font-normal">{col}</th>
                              ))}
                              {tbl.columns.length > 8 && <th className="px-2 py-1 text-gray-400">…</th>}
                            </tr>
                          </thead>
                          <tbody>
                            {tbl.sampleRows.map((row, ri) => (
                              <tr key={ri} className="border-b border-gray-100 dark:border-gray-800">
                                {tbl.columns.slice(0, 8).map(col => (
                                  <td key={col} className="px-2 py-1 text-gray-700 dark:text-gray-300 max-w-[120px] truncate">
                                    {row[col] || <span className="text-gray-300 dark:text-gray-600">—</span>}
                                  </td>
                                ))}
                                {tbl.columns.length > 8 && <td className="px-2 py-1 text-gray-400">…</td>}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>

          <div className="flex justify-between pt-2">
            <Button variant="outline" onClick={reset} className="gap-2">
              <ChevronLeft className="h-4 w-4" /> Back
            </Button>
            <Button
              onClick={() => { setCurrentMappingTable(0); setStep(2); }}
              disabled={selectedTables.length === 0}
              className="gap-2"
            >
              Configure Mapping <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* ── STEP 2: Column Mapping ── */}
      {step === 2 && parseResult && (
        <div className="space-y-6">
          {/* Table tabs */}
          {selectedTables.length > 1 && (
            <div className="flex gap-2 overflow-x-auto pb-1">
              {selectedTables.map((c, idx) => (
                <button
                  key={c.sourceName}
                  onClick={() => setCurrentMappingTable(idx)}
                  className={cn(
                    "px-4 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors",
                    currentMappingTable === idx
                      ? "bg-blue-600 text-white"
                      : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"
                  )}
                >
                  {c.sourceName}
                  {" "}
                  <span className="opacity-60 text-xs">
                    → {c.targetEntity === "work_orders" ? "Work Orders" : "Technicians"}
                  </span>
                </button>
              ))}
            </div>
          )}

          {selectedTables[currentMappingTable] && (() => {
            const config = selectedTables[currentMappingTable];
            const configIdx = tableConfigs.findIndex(c => c.sourceName === config.sourceName);
            const tbl = parseResult.tables[config.sourceName];
            const fields = config.targetEntity === "work_orders" ? WORK_ORDER_FIELDS : TECHNICIAN_FIELDS;

            return (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-gray-900 dark:text-white">{config.sourceName}</span>
                    <ArrowRight className="h-4 w-4 text-gray-400" />
                    <Badge className={cn(
                      config.targetEntity === "work_orders"
                        ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
                        : "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"
                    )}>
                      {config.targetEntity === "work_orders" ? "Work Orders" : "Technicians"}
                    </Badge>
                  </div>
                  <span className="text-sm text-gray-500">{tbl.rowCount.toLocaleString()} rows</span>
                </div>

                <Card>
                  <CardContent className="p-0">
                    {/* Mapping header */}
                    <div className="grid grid-cols-12 gap-3 px-4 py-3 bg-gray-50 dark:bg-gray-800/50 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider rounded-t-lg border-b border-gray-200 dark:border-gray-700">
                      <div className="col-span-5">Source Column</div>
                      <div className="col-span-1 text-center">Auto</div>
                      <div className="col-span-6">Map to NOVIQ Field</div>
                    </div>

                    <div className="divide-y divide-gray-100 dark:divide-gray-800">
                      {tbl.columns.map(col => {
                        const current = config.columnMapping[col] || "";
                        const auto = guessField(col, config.targetEntity as "work_orders" | "technicians");
                        const isAutoApplied = auto && current === auto;
                        const isOverridden = auto && current && current !== auto;

                        return (
                          <div key={col} className={cn(
                            "grid grid-cols-12 gap-3 px-4 py-2.5 items-center",
                            isOverridden && "bg-amber-50/50 dark:bg-amber-950/10"
                          )}>
                            <div className="col-span-5">
                              <p className="font-mono text-sm text-gray-800 dark:text-gray-200 truncate">{col}</p>
                              {isAutoApplied && <span className="text-xs text-emerald-600 dark:text-emerald-400">✓ Auto-matched</span>}
                              {isOverridden && <span className="text-xs text-amber-600 dark:text-amber-400">✎ Changed from auto</span>}
                              {!auto && !current && <span className="text-xs text-gray-400">No match found</span>}
                            </div>
                            <div className="col-span-1 flex justify-center">
                              {auto
                                ? <span className="w-2 h-2 rounded-full bg-emerald-400" title="Auto-detected" />
                                : <span className="w-2 h-2 rounded-full bg-gray-200 dark:bg-gray-700" />
                              }
                            </div>
                            <div className="col-span-6">
                              <Select
                                value={current || "_none"}
                                onValueChange={v => setMapping(configIdx, col, v === "_none" ? "" : v)}
                              >
                                <SelectTrigger className="h-8 text-xs">
                                  <SelectValue placeholder="— Do not import —" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="_none">— Do not import —</SelectItem>
                                  {fields.map(f => (
                                    <SelectItem key={f.value} value={f.value}>
                                      {f.label}{f.required ? " *" : ""}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>

                {/* Navigate between tables */}
                {selectedTables.length > 1 && (
                  <div className="flex justify-between items-center text-sm text-gray-500">
                    <Button
                      variant="ghost" size="sm"
                      disabled={currentMappingTable === 0}
                      onClick={() => setCurrentMappingTable(p => p - 1)}
                      className="gap-1"
                    >
                      <ChevronLeft className="h-4 w-4" /> Previous Table
                    </Button>
                    <span>{currentMappingTable + 1} / {selectedTables.length}</span>
                    <Button
                      variant="ghost" size="sm"
                      disabled={currentMappingTable === selectedTables.length - 1}
                      onClick={() => setCurrentMappingTable(p => p + 1)}
                      className="gap-1"
                    >
                      Next Table <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </div>
            );
          })()}

          {/* Summary + confirm */}
          <Card className="border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-950/10">
            <CardContent className="p-4">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div className="space-y-1">
                  <p className="font-semibold text-gray-900 dark:text-white">Import Summary</p>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    {selectedTables.length} table{selectedTables.length !== 1 ? "s" : ""} selected
                    &nbsp;·&nbsp;
                    {totalRows.toLocaleString()} total rows
                    &nbsp;·&nbsp;
                    {selectedTables.map(c =>
                      `${c.sourceName} → ${c.targetEntity === "work_orders" ? "Work Orders" : "Technicians"}`
                    ).join(", ")}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="flex justify-between">
            <Button variant="outline" onClick={() => setStep(1)} className="gap-2">
              <ChevronLeft className="h-4 w-4" /> Back to Tables
            </Button>
            <Button
              onClick={doExecute}
              disabled={executeMutation.isPending}
              className="gap-2 bg-blue-600 hover:bg-blue-700 text-white min-w-[160px]"
            >
              {executeMutation.isPending ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Importing…
                </>
              ) : (
                <>
                  <Database className="h-4 w-4" />
                  Start Import
                </>
              )}
            </Button>
          </div>
        </div>
      )}

      {/* ── STEP 3: Results ── */}
      {step === 3 && executeResult && (
        <div className="space-y-6">
          {/* Overall summary */}
          <div className={cn(
            "rounded-2xl p-6 flex items-center gap-5",
            executeResult.totalImported > 0
              ? "bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800"
              : "bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800"
          )}>
            {executeResult.totalImported > 0
              ? <CheckCircle2 className="h-12 w-12 text-emerald-500 shrink-0" />
              : <AlertTriangle className="h-12 w-12 text-amber-500 shrink-0" />
            }
            <div>
              <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                {executeResult.totalImported > 0 ? "Import Complete" : "Nothing Imported"}
              </h2>
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-0.5">
                {executeResult.totalImported > 0
                  ? `${executeResult.totalImported.toLocaleString()} records added to your database successfully.`
                  : "All rows were skipped (duplicates) or had missing required fields."}
              </p>
            </div>
          </div>

          {/* Stats row */}
          <div className="grid grid-cols-3 gap-4">
            {[
              { label: "Imported", value: executeResult.totalImported, color: "emerald" },
              { label: "Skipped", value: executeResult.totalSkipped, color: "amber" },
              { label: "Failed", value: executeResult.totalFailed, color: "red" },
            ].map(s => (
              <Card key={s.label}>
                <CardContent className="p-4 text-center">
                  <p className={cn(
                    "text-3xl font-bold",
                    s.color === "emerald" && "text-emerald-600 dark:text-emerald-400",
                    s.color === "amber" && "text-amber-600 dark:text-amber-400",
                    s.color === "red" && "text-red-600 dark:text-red-400",
                  )}>{s.value.toLocaleString()}</p>
                  <p className="text-xs text-gray-500 mt-1 font-medium uppercase tracking-wide">{s.label}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Per-table breakdown */}
          <div className="space-y-3">
            <h3 className="font-semibold text-gray-800 dark:text-gray-200">Per-Table Results</h3>
            {executeResult.tables.map(t => (
              <Card key={t.table}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div className="flex items-center gap-2">
                      <Table2 className="h-4 w-4 text-gray-400" />
                      <span className="font-mono font-semibold text-gray-900 dark:text-white">{t.table}</span>
                    </div>
                    <div className="flex items-center gap-3 flex-wrap">
                      <span className="flex items-center gap-1 text-sm text-emerald-600 dark:text-emerald-400">
                        <CheckCircle2 className="h-4 w-4" /> {t.imported.toLocaleString()} imported
                      </span>
                      {t.skipped > 0 && (
                        <span className="flex items-center gap-1 text-sm text-amber-600 dark:text-amber-400">
                          <AlertTriangle className="h-4 w-4" /> {t.skipped.toLocaleString()} skipped
                        </span>
                      )}
                      {t.failed > 0 && (
                        <span className="flex items-center gap-1 text-sm text-red-600 dark:text-red-400">
                          <XCircle className="h-4 w-4" /> {t.failed.toLocaleString()} failed
                        </span>
                      )}
                    </div>
                  </div>
                  {t.errors.length > 0 && (
                    <div className="mt-3 p-2 bg-red-50 dark:bg-red-950/20 rounded-lg">
                      <p className="text-xs font-semibold text-red-600 mb-1">Sample errors:</p>
                      {t.errors.map((e, i) => (
                        <p key={i} className="text-xs text-red-500 font-mono">{e}</p>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Navigation links */}
          {executeResult.totalImported > 0 && (
            <div className="flex flex-wrap gap-3 p-4 bg-gray-50 dark:bg-gray-800/50 rounded-xl">
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center gap-1.5">
                <TrendingUp className="h-4 w-4" /> View your imported data:
              </p>
              <a href="/work-orders" className="text-sm text-blue-600 dark:text-blue-400 underline underline-offset-2 hover:text-blue-800 font-medium">
                Work Orders →
              </a>
              <a href="/technicians" className="text-sm text-blue-600 dark:text-blue-400 underline underline-offset-2 hover:text-blue-800 font-medium">
                Technicians →
              </a>
              <a href="/dashboard" className="text-sm text-blue-600 dark:text-blue-400 underline underline-offset-2 hover:text-blue-800 font-medium">
                Dashboard →
              </a>
            </div>
          )}

          <Button variant="outline" onClick={reset} className="gap-2 w-full sm:w-auto">
            <RotateCcw className="h-4 w-4" /> Import Another File
          </Button>
        </div>
      )}
    </div>
  );
}
