import { useState, useRef, useCallback } from "react";
import { useMutation } from "@tanstack/react-query";
import Papa from "papaparse";
import { Upload, ChevronRight, ChevronLeft, CheckCircle2, AlertTriangle, XCircle, Zap, RotateCcw, Download, Filter, Check, ListFilter, Terminal, ChevronDown, ChevronUp, FileCode2, ShieldAlert, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { cn } from "@/lib/utils";

type DataType = "technicians" | "work-orders" | "payments" | "invoices";

interface FieldSuggestion {
  noviqField: string | null;
  confidence: number;
  label: string;
  required: boolean;
  transform?: string;
  alternatives: Array<{ noviqField: string; confidence: number; label: string }>;
}

interface AnalyzeResponse {
  suggestions: Record<string, FieldSuggestion>;
  availableFields: Array<{ value: string; label: string; required: boolean }>;
}

interface RowResult {
  rowIndex: number;
  rawRow: Record<string, string>;
  mappedRow: Record<string, string>;
  status: "ready" | "warning" | "error";
  confidence: number;
  issues: string[];
  warnings: string[];
}

interface Anomaly {
  message: string;
  rowCount: number;
  severity: "error" | "warning";
}

interface TransformationSummary {
  phonesNormalized: number;
  datesConverted: number;
  namesSplit: number;
  statusesNormalized: number;
  prioritiesNormalized: number;
  statusMap: Record<string, string>;
  detectedDateFormats: string[];
}

interface PreviewResponse {
  results: RowResult[];
  summary: { total: number; ready: number; warnings: number; errors: number };
  anomalies: Anomaly[];
  transformations: TransformationSummary;
}

interface ConfirmResponse {
  imported: number;
  skipped: number;
  failed: number;
  total: number;
  results: Array<{ rowIndex: number; status: "imported" | "skipped" | "failed"; reason?: string }>;
  error?: string;
}

const STEPS = ["Choose Type", "Upload CSV", "Map Fields", "Preview", "Import"];

export default function DataImport() {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState(0);
  const [dataType, setDataType] = useState<DataType>("technicians");
  const [csvRows, setCsvRows] = useState<Record<string, string>[]>([]);
  const [csvColumns, setCsvColumns] = useState<string[]>([]);
  const [csvFileName, setCsvFileName] = useState("");
  const [analyzeResult, setAnalyzeResult] = useState<AnalyzeResponse | null>(null);
  const [fieldMapping, setFieldMapping] = useState<Record<string, string | null>>({});
  const [previewResult, setPreviewResult] = useState<PreviewResponse | null>(null);
  const [confirmResult, setConfirmResult] = useState<ConfirmResponse | null>(null);
  const [previewFilter, setPreviewFilter] = useState<"all" | "ready" | "warning" | "error">("all");
  const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set());

  // SQL Direct Import state
  const [sqlExpanded, setSqlExpanded] = useState(false);
  const [sqlText, setSqlText] = useState("");
  const [sqlResult, setSqlResult] = useState<{ success: boolean; statements: number; totalRowCount: number; results: Array<{ statement: string; rowCount: number; error?: string }>; message: string } | null>(null);
  const sqlFileRef = useRef<HTMLInputElement>(null);

  const sqlMutation = useMutation({
    mutationFn: async (payload: { sql?: string; file?: File }) => {
      const form = new FormData();
      if (payload.file) {
        form.append("file", payload.file);
      } else if (payload.sql) {
        form.append("sql", payload.sql);
      }
      const res = await fetch("/api/import/sql", {
        method: "POST",
        body: form,
        credentials: "include",
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || "SQL import failed");
      return json as { success: boolean; statements: number; totalRowCount: number; results: Array<{ statement: string; rowCount: number }>; message: string };
    },
    onSuccess: (data) => {
      setSqlResult(data);
      queryClient.invalidateQueries({ queryKey: ["/api/technicians"] });
      queryClient.invalidateQueries({ queryKey: ["/api/work-orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      toast({ title: "SQL executed successfully", description: data.message });
    },
    onError: (e: Error) => {
      toast({ title: "SQL execution failed", description: e.message, variant: "destructive" });
    },
  });

  const handleSqlFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.endsWith(".sql")) {
      toast({ title: "Only .sql files are supported", variant: "destructive" });
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => setSqlText(ev.target?.result as string ?? "");
    reader.readAsText(file);
    e.target.value = "";
  };

  const analyzeMutation = useMutation({
    mutationFn: (data: { columns: string[]; dataType: DataType }) =>
      apiRequest("POST", "/api/import/analyze-columns", data).then(r => r.json()) as Promise<AnalyzeResponse>,
    onSuccess: (data) => {
      setAnalyzeResult(data);
      const mapping: Record<string, string | null> = {};
      for (const [col, suggestion] of Object.entries(data.suggestions)) {
        mapping[col] = suggestion.noviqField;
      }
      setFieldMapping(mapping);
      setStep(2);
    },
    onError: () => toast({ title: "Analysis failed", description: "Could not analyze column names.", variant: "destructive" }),
  });

  const previewMutation = useMutation({
    mutationFn: (data: { rows: Record<string, string>[]; fieldMapping: Record<string, string | null>; dataType: DataType }) =>
      apiRequest("POST", "/api/import/preview", data).then(r => r.json()) as Promise<PreviewResponse>,
    onSuccess: (data) => {
      setPreviewResult(data);
      // Pre-select all ready + warning rows (error rows cannot be imported)
      setSelectedRows(new Set(data.results.filter(r => r.status !== "error").map(r => r.rowIndex)));
      setStep(3);
    },
    onError: () => toast({ title: "Preview failed", variant: "destructive" }),
  });

  const confirmMutation = useMutation({
    mutationFn: async (data: { rows: RowResult[]; dataType: DataType }): Promise<ConfirmResponse> => {
      const res = await fetch("/api/import/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });
      const json: ConfirmResponse = await res.json();
      if (!res.ok) {
        if (json.results) {
          setConfirmResult(json);
          setStep(4);
        }
        throw new Error(json.error ?? `HTTP ${res.status}`);
      }
      return json;
    },
    onSuccess: (data) => {
      setConfirmResult(data);
      setStep(4);
      queryClient.invalidateQueries({ queryKey: ["/api/technicians"] });
      queryClient.invalidateQueries({ queryKey: ["/api/work-orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/payments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/invoices"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
    },
    onError: (e: Error) => toast({ title: "Import rolled back", description: e.message, variant: "destructive" }),
  });

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCsvFileName(file.name);
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const rows = results.data as Record<string, string>[];
        const cols = results.meta.fields || [];
        setCsvRows(rows);
        setCsvColumns(cols);
        if (rows.length === 0) {
          toast({ title: "Empty file", description: "No data rows found in the CSV.", variant: "destructive" });
          return;
        }
        analyzeMutation.mutate({ columns: cols, dataType });
      },
      error: () => toast({ title: "Parse error", description: "Could not read the CSV file.", variant: "destructive" }),
    });
  }, [dataType]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (!file || !file.name.endsWith(".csv")) {
      toast({ title: "CSV files only", variant: "destructive" });
      return;
    }
    const input = fileInputRef.current;
    if (input) {
      const dt = new DataTransfer();
      dt.items.add(file);
      input.files = dt.files;
      input.dispatchEvent(new Event("change", { bubbles: true }));
    }
  }, [dataType]);

  const acceptAllSuggestions = () => {
    if (!analyzeResult) return;
    const mapping: Record<string, string | null> = {};
    for (const [col, s] of Object.entries(analyzeResult.suggestions)) {
      mapping[col] = s.noviqField;
    }
    setFieldMapping(mapping);
  };

  const downloadReport = () => {
    if (!confirmResult || !previewResult) return;
    const rows = confirmResult.results.map(r => {
      const preview = previewResult.results[r.rowIndex];
      return {
        Row: r.rowIndex + 1,
        Status: r.status,
        Reason: r.reason || "",
        ...preview?.mappedRow,
      };
    });
    const csv = Papa.unparse(rows);
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `import-report-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const resetImport = () => {
    setStep(0);
    setCsvRows([]);
    setCsvColumns([]);
    setCsvFileName("");
    setAnalyzeResult(null);
    setFieldMapping({});
    setPreviewResult(null);
    setConfirmResult(null);
    setSelectedRows(new Set());
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const toggleRow = (rowIndex: number, importable: boolean) => {
    if (!importable) return;
    setSelectedRows(prev => {
      const next = new Set(prev);
      if (next.has(rowIndex)) next.delete(rowIndex); else next.add(rowIndex);
      return next;
    });
  };

  const selectAllGreen = () => {
    if (!previewResult) return;
    setSelectedRows(new Set(previewResult.results.filter(r => r.status === "ready").map(r => r.rowIndex)));
  };

  const selectAllGreenAndYellow = () => {
    if (!previewResult) return;
    setSelectedRows(new Set(previewResult.results.filter(r => r.status !== "error").map(r => r.rowIndex)));
  };

  const deselectAll = () => setSelectedRows(new Set());

  const confidenceBadge = (confidence: number) => {
    if (confidence >= 80) return <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 text-xs">{confidence}%</Badge>;
    if (confidence >= 50) return <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 text-xs">{confidence}%</Badge>;
    return <Badge className="bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 text-xs">{confidence}%</Badge>;
  };

  const statusIcon = (status: "ready" | "warning" | "error") => {
    if (status === "ready") return <CheckCircle2 className="h-4 w-4 text-emerald-500" />;
    if (status === "warning") return <AlertTriangle className="h-4 w-4 text-amber-500" />;
    return <XCircle className="h-4 w-4 text-red-500" />;
  };

  const filteredRows = previewResult?.results.filter(r =>
    previewFilter === "all" ? true : r.status === previewFilter
  ) || [];

  const mappedFieldsCount = Object.values(fieldMapping).filter(Boolean).length;
  const requiredFields = analyzeResult?.availableFields.filter(f => f.required) || [];
  const mappedRequiredFields = requiredFields.filter(rf => Object.values(fieldMapping).includes(rf.value));

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 p-6">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Data Import</h1>
          <p className="mt-1 text-gray-500 dark:text-gray-400">Import your legacy data into NOVIQ safely — with AI-assisted field mapping and preview before anything is saved.</p>
        </div>

        {/* Step Progress */}
        <div className="mb-8">
          <div className="flex items-center gap-2">
            {STEPS.map((label, i) => (
              <div key={label} className="flex items-center gap-2">
                <div className={cn(
                  "w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold transition-colors",
                  i < step ? "bg-emerald-500 text-white" :
                  i === step ? "bg-blue-600 text-white" :
                  "bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400"
                )}>
                  {i < step ? <Check className="h-4 w-4" /> : i + 1}
                </div>
                <span className={cn("text-sm font-medium hidden sm:block", i === step ? "text-blue-600 dark:text-blue-400" : "text-gray-500 dark:text-gray-400")}>
                  {label}
                </span>
                {i < STEPS.length - 1 && <ChevronRight className="h-4 w-4 text-gray-300 dark:text-gray-600" />}
              </div>
            ))}
          </div>
          <Progress value={(step / (STEPS.length - 1)) * 100} className="mt-3 h-1.5" />
        </div>

        {/* ─── Step 0: Choose Data Type ─────────────────────────────── */}
        {step === 0 && (
          <div className="space-y-6">
            <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-200">What data are you importing?</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {[
                { type: "technicians" as DataType, title: "Technicians", desc: "Import your technician roster — names, contact info, specializations, rates, and payment details.", icon: "👷" },
                { type: "work-orders" as DataType, title: "Work Orders", desc: "Import historical work orders — status, client info, dates, NTE, and location data.", icon: "📋" },
                { type: "payments" as DataType, title: "Technician Payments", desc: "Import payment records for technicians — amounts requested, approved, paid, and linked work orders.", icon: "💳" },
                { type: "invoices" as DataType, title: "Invoices", desc: "Import work order invoices — labor, material, tax, and total amounts linked to existing work orders.", icon: "🧾" },
              ].map(opt => (
                <button
                  key={opt.type}
                  onClick={() => setDataType(opt.type)}
                  className={cn(
                    "text-left p-6 rounded-xl border-2 transition-all",
                    dataType === opt.type
                      ? "border-blue-500 bg-blue-50 dark:bg-blue-950/30"
                      : "border-gray-200 dark:border-gray-700 hover:border-blue-300 dark:hover:border-blue-600 bg-white dark:bg-gray-900"
                  )}
                >
                  <div className="text-3xl mb-3">{opt.icon}</div>
                  <div className="font-semibold text-gray-900 dark:text-white text-lg">{opt.title}</div>
                  <div className="text-sm text-gray-500 dark:text-gray-400 mt-1">{opt.desc}</div>
                  {dataType === opt.type && <Badge className="mt-3 bg-blue-600 text-white">Selected</Badge>}
                </button>
              ))}
            </div>
            <div className="flex justify-end">
              <Button onClick={() => setStep(1)} className="gap-2">
                Continue <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        {/* ─── Step 1: Upload CSV ──────────────────────────────────── */}
        {step === 1 && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-200">Upload your CSV file</h2>
              <Button variant="outline" size="sm" onClick={() => setStep(0)} className="gap-1">
                <ChevronLeft className="h-4 w-4" /> Back
              </Button>
            </div>

            <Alert className="border-blue-200 bg-blue-50 dark:bg-blue-950/20 dark:border-blue-800">
              <Zap className="h-4 w-4 text-blue-500" />
              <AlertDescription className="text-blue-700 dark:text-blue-300">
                <strong>AI-assisted mapping:</strong> After upload, the system will automatically analyze your column names and suggest the best match for each NOVIQ field — no manual mapping needed for most columns.
              </AlertDescription>
            </Alert>

            <div
              onDrop={handleDrop}
              onDragOver={e => e.preventDefault()}
              className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-xl p-12 text-center cursor-pointer hover:border-blue-400 dark:hover:border-blue-500 transition-colors bg-white dark:bg-gray-900"
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="h-10 w-10 text-gray-400 mx-auto mb-4" />
              <p className="text-lg font-medium text-gray-700 dark:text-gray-300">Drop your CSV file here</p>
              <p className="text-sm text-gray-400 mt-1">or click to browse</p>
              <input ref={fileInputRef} type="file" accept=".csv" className="hidden" onChange={handleFileChange} />
            </div>

            {analyzeMutation.isPending && (
              <div className="text-center py-6">
                <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600 mx-auto mb-3"></div>
                <p className="text-gray-600 dark:text-gray-400">Analyzing your column names…</p>
              </div>
            )}

            <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">CSV format tips</p>
              <ul className="text-sm text-gray-500 dark:text-gray-400 space-y-1 list-disc list-inside">
                <li>First row must be column headers</li>
                <li>Column names can be in any format (underscores, spaces, abbreviations) — the AI will map them</li>
                <li>Dates accepted in any common format (MM/DD/YYYY, YYYY-MM-DD, etc.)</li>
                <li>Phone numbers accepted in any format — automatically normalized</li>
                <li>For {dataType === "technicians" ? "technicians" : "work orders"}, you can use a "full_name" column and it will be split automatically</li>
              </ul>
            </div>
          </div>
        )}

        {/* ─── Step 2: Map Fields ──────────────────────────────────── */}
        {step === 2 && analyzeResult && (
          <div className="space-y-6">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div>
                <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-200">Map your columns to NOVIQ fields</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{csvColumns.length} columns detected · {csvRows.length} rows · AI pre-mapped {Object.values(analyzeResult.suggestions).filter(s => s.noviqField).length} columns</p>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setStep(1)} className="gap-1">
                  <ChevronLeft className="h-4 w-4" /> Back
                </Button>
                <Button variant="outline" size="sm" onClick={acceptAllSuggestions} className="gap-1">
                  <Zap className="h-4 w-4 text-yellow-500" /> Accept All AI Suggestions
                </Button>
              </div>
            </div>

            {/* Required fields status */}
            <div className="flex items-center gap-3 text-sm">
              <span className="text-gray-600 dark:text-gray-400 font-medium">Required fields mapped:</span>
              <span className={cn("font-semibold", mappedRequiredFields.length === requiredFields.length ? "text-emerald-600" : "text-amber-600")}>
                {mappedRequiredFields.length} / {requiredFields.length}
              </span>
              {mappedRequiredFields.length < requiredFields.length && (
                <span className="text-amber-600 text-xs">
                  Missing: {requiredFields.filter(rf => !Object.values(fieldMapping).includes(rf.value)).map(f => f.label).join(", ")}
                </span>
              )}
            </div>

            <Card className="border-gray-200 dark:border-gray-700">
              <CardContent className="p-0">
                <div className="divide-y divide-gray-100 dark:divide-gray-800">
                  {/* Header row */}
                  <div className="grid grid-cols-12 gap-3 px-4 py-3 bg-gray-50 dark:bg-gray-800/50 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider rounded-t-lg">
                    <div className="col-span-4">Your CSV Column</div>
                    <div className="col-span-2 text-center">AI Confidence</div>
                    <div className="col-span-6">Map to NOVIQ Field</div>
                  </div>
                  {csvColumns.map((col) => {
                    const suggestion = analyzeResult.suggestions[col];
                    const currentMapping = fieldMapping[col];
                    const aiSuggested = suggestion?.noviqField;
                    const userOverrode = aiSuggested && currentMapping !== aiSuggested;
                    const matchesAI = aiSuggested && currentMapping === aiSuggested;
                    return (
                      <div key={col} className={cn("grid grid-cols-12 gap-3 px-4 py-3 items-center", userOverrode && "bg-amber-50/40 dark:bg-amber-950/10")}>
                        <div className="col-span-4">
                          <p className="font-mono text-sm text-gray-800 dark:text-gray-200 truncate">{col}</p>
                          {aiSuggested && (
                            <div className="flex items-center gap-1.5 mt-0.5">
                              {matchesAI && <span className="text-xs text-emerald-600 dark:text-emerald-400">✓ AI suggestion accepted</span>}
                              {userOverrode && (
                                <>
                                  <span className="text-xs text-amber-600 dark:text-amber-400">AI suggested:</span>
                                  <span className="text-xs text-gray-400 line-through">{suggestion.label}</span>
                                  <span className="text-xs text-amber-600">→ changed</span>
                                </>
                              )}
                            </div>
                          )}
                          {!aiSuggested && currentMapping && <span className="text-xs text-gray-400">Manually mapped</span>}
                        </div>
                        <div className="col-span-2 flex justify-center">
                          {suggestion ? confidenceBadge(suggestion.confidence) : <Badge variant="secondary" className="text-xs">—</Badge>}
                        </div>
                        <div className="col-span-6">
                          <Select
                            value={currentMapping || "skip"}
                            onValueChange={(val) => setFieldMapping(prev => ({ ...prev, [col]: val === "skip" ? null : val }))}
                          >
                            <SelectTrigger className="h-8 text-sm">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="skip">
                                <span className="text-gray-400 italic">— Skip this column —</span>
                              </SelectItem>
                              {analyzeResult.availableFields.map(f => (
                                <SelectItem key={f.value} value={f.value}>
                                  {f.label}
                                  {f.required && <span className="text-red-500 ml-1">*</span>}
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

            <div className="flex justify-between items-center">
              <p className="text-sm text-gray-500">
                <span className="text-emerald-600 font-medium">{mappedFieldsCount}</span> columns will be imported · <span className="text-gray-400">{csvColumns.length - mappedFieldsCount}</span> will be skipped
              </p>
              <Button
                onClick={() => previewMutation.mutate({ rows: csvRows, fieldMapping, dataType })}
                disabled={previewMutation.isPending || mappedRequiredFields.length === 0}
                className="gap-2"
              >
                {previewMutation.isPending ? "Analyzing…" : "Preview Import"} <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        {/* ─── Step 3: Preview ─────────────────────────────────────── */}
        {step === 3 && previewResult && (
          <div className="space-y-6">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div>
                <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-200">Preview — nothing saved yet</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Review every row before confirming. The database will not be changed until you click "Confirm Import".</p>
              </div>
              <Button variant="outline" size="sm" onClick={() => setStep(2)} className="gap-1">
                <ChevronLeft className="h-4 w-4" /> Back to Mapping
              </Button>
            </div>

            {/* Summary cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {[
                { label: "Total Rows", value: previewResult.summary.total, color: "text-gray-800 dark:text-gray-200", bg: "bg-gray-50 dark:bg-gray-800" },
                { label: "Ready", value: previewResult.summary.ready, color: "text-emerald-700 dark:text-emerald-400", bg: "bg-emerald-50 dark:bg-emerald-950/30" },
                { label: "Needs Review", value: previewResult.summary.warnings, color: "text-amber-700 dark:text-amber-400", bg: "bg-amber-50 dark:bg-amber-950/30" },
                { label: "Will Fail", value: previewResult.summary.errors, color: "text-red-700 dark:text-red-400", bg: "bg-red-50 dark:bg-red-950/30" },
              ].map(card => (
                <div key={card.label} className={cn("rounded-xl p-4 border", card.bg, "border-gray-200 dark:border-gray-700")}>
                  <p className="text-xs text-gray-500 dark:text-gray-400 font-medium uppercase tracking-wider">{card.label}</p>
                  <p className={cn("text-3xl font-bold mt-1", card.color)}>{card.value}</p>
                </div>
              ))}
            </div>

            {previewResult.summary.errors > 0 && (
              <Alert className="border-red-200 bg-red-50 dark:bg-red-950/20 dark:border-red-800">
                <XCircle className="h-4 w-4 text-red-500" />
                <AlertDescription className="text-red-700 dark:text-red-300">
                  <strong>{previewResult.summary.errors} rows have errors</strong> — these will be skipped during import unless you fix them. Error rows will not be imported.
                </AlertDescription>
              </Alert>
            )}

            {/* Anomaly report — grouped issues */}
            {previewResult.anomalies && previewResult.anomalies.length > 0 && (
              <Card className="border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/10">
                <CardHeader className="pb-2 pt-4 px-4">
                  <CardTitle className="text-sm font-semibold text-amber-700 dark:text-amber-400 flex items-center gap-2">
                    <ListFilter className="h-4 w-4" /> Anomaly Report — {previewResult.anomalies.length} distinct issue{previewResult.anomalies.length !== 1 ? "s" : ""} detected
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-4">
                  <div className="space-y-1.5">
                    {previewResult.anomalies.map((anomaly, i) => (
                      <div key={i} className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2 min-w-0">
                          {anomaly.severity === "error"
                            ? <XCircle className="h-3.5 w-3.5 text-red-500 flex-shrink-0" />
                            : <AlertTriangle className="h-3.5 w-3.5 text-amber-500 flex-shrink-0" />}
                          <span className="text-sm text-gray-700 dark:text-gray-300 truncate">{anomaly.message}</span>
                        </div>
                        <Badge variant="secondary" className="text-xs flex-shrink-0">
                          {anomaly.rowCount} row{anomaly.rowCount !== 1 ? "s" : ""}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Transformation summary */}
            {previewResult.transformations && (
              () => {
                const t = previewResult.transformations;
                const items = [
                  t.namesSplit > 0 && `${t.namesSplit} full name${t.namesSplit !== 1 ? "s" : ""} split into first/last`,
                  t.phonesNormalized > 0 && `${t.phonesNormalized} phone number${t.phonesNormalized !== 1 ? "s" : ""} normalized`,
                  t.datesConverted > 0 && `${t.datesConverted} date${t.datesConverted !== 1 ? "s" : ""} converted (${t.detectedDateFormats.join(", ")} → YYYY-MM-DD)`,
                  t.statusesNormalized > 0 && `${t.statusesNormalized} status value${t.statusesNormalized !== 1 ? "s" : ""} mapped (${Object.entries(t.statusMap).map(([k,v]) => `"${k}"→"${v}"`).join(", ")})`,
                  t.prioritiesNormalized > 0 && `${t.prioritiesNormalized} priority value${t.prioritiesNormalized !== 1 ? "s" : ""} normalized`,
                ].filter(Boolean) as string[];
                if (items.length === 0) return null;
                return (
                  <Card className="border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-950/10">
                    <CardHeader className="pb-2 pt-4 px-4">
                      <CardTitle className="text-sm font-semibold text-blue-700 dark:text-blue-400 flex items-center gap-2">
                        <Zap className="h-4 w-4" /> Transformations Applied
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="px-4 pb-4">
                      <ul className="space-y-1">
                        {items.map((item, i) => (
                          <li key={i} className="text-sm text-gray-700 dark:text-gray-300 flex items-center gap-2">
                            <CheckCircle2 className="h-3.5 w-3.5 text-blue-500 flex-shrink-0" /> {item}
                          </li>
                        ))}
                      </ul>
                    </CardContent>
                  </Card>
                );
              }
            )()}

            {/* Bulk selection controls */}
            <div className="flex items-center gap-2 flex-wrap justify-between">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Select rows to import:</span>
                <Button variant="outline" size="sm" onClick={selectAllGreenAndYellow} className="h-7 text-xs gap-1">
                  <CheckCircle2 className="h-3 w-3 text-emerald-500" /> Select Ready + Review ({previewResult.summary.ready + previewResult.summary.warnings})
                </Button>
                <Button variant="outline" size="sm" onClick={selectAllGreen} className="h-7 text-xs gap-1">
                  <CheckCircle2 className="h-3 w-3 text-emerald-500" /> Ready Only ({previewResult.summary.ready})
                </Button>
                <Button variant="outline" size="sm" onClick={deselectAll} className="h-7 text-xs">
                  Deselect All
                </Button>
              </div>
              <span className="text-sm text-gray-500">
                <strong className="text-blue-600">{selectedRows.size}</strong> selected
              </span>
            </div>

            {/* Filter tabs */}
            <div className="flex items-center gap-2 flex-wrap">
              <Filter className="h-4 w-4 text-gray-400" />
              {(["all","ready","warning","error"] as const).map(f => (
                <button
                  key={f}
                  onClick={() => setPreviewFilter(f)}
                  className={cn(
                    "px-3 py-1 rounded-full text-xs font-medium transition-colors",
                    previewFilter === f ? "bg-blue-600 text-white" : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"
                  )}
                >
                  {f === "all" ? `All (${previewResult.summary.total})` :
                   f === "ready" ? `Ready (${previewResult.summary.ready})` :
                   f === "warning" ? `Review (${previewResult.summary.warnings})` :
                   `Errors (${previewResult.summary.errors})`}
                </button>
              ))}
            </div>

            {/* Rows table */}
            <Card className="border-gray-200 dark:border-gray-700">
              <CardContent className="p-0">
                <div className="max-h-[480px] overflow-y-auto">
                  <div className="divide-y divide-gray-100 dark:divide-gray-800">
                    {/* Header */}
                    <div className="grid grid-cols-12 gap-3 px-4 py-3 bg-gray-50 dark:bg-gray-800/50 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider sticky top-0 z-10">
                      <div className="col-span-1 flex items-center">Import</div>
                      <div className="col-span-1">#</div>
                      <div className="col-span-1">Status</div>
                      <div className="col-span-2">Confidence</div>
                      <div className="col-span-3">
                        {dataType === "technicians" ? "Name / Email" : dataType === "work-orders" ? "Title / WO#" : dataType === "payments" ? "WO# / Tech Email" : "Invoice# / WO#"}
                      </div>
                      <div className="col-span-4">Issues / Notes</div>
                    </div>
                    {filteredRows.length === 0 && (
                      <div className="text-center py-10 text-gray-400">No rows match this filter</div>
                    )}
                    {filteredRows.map((row) => {
                      const isImportable = row.status !== "error";
                      const isSelected = selectedRows.has(row.rowIndex);
                      return (
                      <div key={row.rowIndex} className={cn(
                        "grid grid-cols-12 gap-3 px-4 py-3 items-start transition-colors cursor-pointer",
                        row.status === "error" ? "bg-red-50/30 dark:bg-red-950/10 opacity-60" :
                        row.status === "warning" ? "bg-amber-50/30 dark:bg-amber-950/10" : "",
                        isSelected && isImportable && "ring-1 ring-inset ring-blue-200 dark:ring-blue-800"
                      )} onClick={() => toggleRow(row.rowIndex, isImportable)}>
                        <div className="col-span-1 flex items-center pt-0.5">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            disabled={!isImportable}
                            onChange={() => toggleRow(row.rowIndex, isImportable)}
                            onClick={(e) => e.stopPropagation()}
                            className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 disabled:opacity-40 cursor-pointer"
                          />
                        </div>
                        <div className="col-span-1 text-xs text-gray-400 pt-0.5">{row.rowIndex + 1}</div>
                        <div className="col-span-1 pt-0.5">{statusIcon(row.status)}</div>
                        <div className="col-span-2">{confidenceBadge(row.confidence)}</div>
                        <div className="col-span-3">
                          {dataType === "technicians" ? (
                            <>
                              <p className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">
                                {[row.mappedRow.firstName, row.mappedRow.lastName].filter(Boolean).join(" ") || "—"}
                              </p>
                              <p className="text-xs text-gray-400 truncate">{row.mappedRow.email || ""}</p>
                            </>
                          ) : dataType === "work-orders" ? (
                            <>
                              <p className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">{row.mappedRow.title || "—"}</p>
                              <p className="text-xs text-gray-400 truncate">{row.mappedRow.clientWorkOrderNumber ? `WO# ${row.mappedRow.clientWorkOrderNumber}` : ""}</p>
                            </>
                          ) : dataType === "payments" ? (
                            <>
                              <p className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">{row.mappedRow.workOrderNumber || "—"}</p>
                              <p className="text-xs text-gray-400 truncate">{row.mappedRow.technicianEmail || ""}</p>
                            </>
                          ) : (
                            <>
                              <p className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">{row.mappedRow.invoiceNumber || "—"}</p>
                              <p className="text-xs text-gray-400 truncate">{row.mappedRow.workOrderNumber ? `WO# ${row.mappedRow.workOrderNumber}` : ""}</p>
                            </>
                          )}
                        </div>
                        <div className="col-span-4 space-y-1">
                          {row.issues.map((issue, i) => (
                            <div key={i} className="flex items-start gap-1.5">
                              <XCircle className="h-3 w-3 text-red-500 mt-0.5 flex-shrink-0" />
                              <span className="text-xs text-red-600 dark:text-red-400">{issue}</span>
                            </div>
                          ))}
                          {row.warnings.map((w, i) => (
                            <div key={i} className="flex items-start gap-1.5">
                              <AlertTriangle className="h-3 w-3 text-amber-500 mt-0.5 flex-shrink-0" />
                              <span className="text-xs text-amber-600 dark:text-amber-400">{w}</span>
                            </div>
                          ))}
                          {row.status === "ready" && (
                            <div className="flex items-center gap-1.5">
                              <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                              <span className="text-xs text-emerald-600 dark:text-emerald-400">Ready to import</span>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                    })}
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="flex justify-between items-center">
              <div className="text-sm text-gray-500">
                <strong className="text-blue-600">{selectedRows.size}</strong> selected ·{" "}
                <strong className="text-red-500">{previewResult.summary.errors}</strong> error rows skipped
              </div>
              <Button
                onClick={() => {
                  const rowsToImport = previewResult.results.filter(r => selectedRows.has(r.rowIndex));
                  confirmMutation.mutate({ rows: rowsToImport, dataType });
                }}
                disabled={confirmMutation.isPending || selectedRows.size === 0}
                className="gap-2 bg-emerald-600 hover:bg-emerald-700"
              >
                {confirmMutation.isPending ? "Importing…" : "Confirm Import"}
                {!confirmMutation.isPending && <CheckCircle2 className="h-4 w-4" />}
              </Button>
            </div>
          </div>
        )}

        {/* ─── Step 4: Results ─────────────────────────────────────── */}
        {step === 4 && confirmResult && (
          <div className="space-y-6">
            <div className="text-center py-4">
              {confirmResult.error ? (
                <div className="w-16 h-16 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
                  <XCircle className="h-8 w-8 text-red-600" />
                </div>
              ) : (
                <div className="w-16 h-16 bg-emerald-100 dark:bg-emerald-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
                  <CheckCircle2 className="h-8 w-8 text-emerald-600" />
                </div>
              )}
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
                {confirmResult.error ? "Import Rolled Back" : "Import Complete"}
              </h2>
              <p className="text-gray-500 dark:text-gray-400 mt-1">
                {confirmResult.error ? "No records were saved — the entire batch was rolled back." : "Your data has been saved to NOVIQ"}
              </p>
            </div>

            {confirmResult.error && (
              <Alert className="border-red-300 bg-red-50 dark:bg-red-950/20 dark:border-red-700">
                <XCircle className="h-4 w-4 text-red-600" />
                <AlertDescription className="text-red-800 dark:text-red-300 text-sm">
                  <strong>Rollback reason:</strong> {confirmResult.error}
                </AlertDescription>
              </Alert>
            )}

            {/* Result cards */}
            <div className="grid grid-cols-3 gap-4">
              {[
                { label: "Imported", value: confirmResult.imported, color: "text-emerald-700 dark:text-emerald-400", bg: "bg-emerald-50 dark:bg-emerald-950/30" },
                { label: "Skipped (duplicates)", value: confirmResult.skipped, color: "text-amber-700 dark:text-amber-400", bg: "bg-amber-50 dark:bg-amber-950/30" },
                { label: "Failed", value: confirmResult.failed, color: "text-red-700 dark:text-red-400", bg: "bg-red-50 dark:bg-red-950/30" },
              ].map(card => (
                <div key={card.label} className={cn("rounded-xl p-6 text-center border", card.bg, "border-gray-200 dark:border-gray-700")}>
                  <p className={cn("text-4xl font-bold", card.color)}>{card.value}</p>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 font-medium">{card.label}</p>
                </div>
              ))}
            </div>

            {confirmResult.failed > 0 && (
              <Card className="border-red-200 dark:border-red-800">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm text-red-600 flex items-center gap-2">
                    <XCircle className="h-4 w-4" /> Failed Rows
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="max-h-48 overflow-y-auto divide-y divide-gray-100 dark:divide-gray-800">
                    {confirmResult.results.filter(r => r.status === "failed").map(r => (
                      <div key={r.rowIndex} className="px-4 py-2 flex items-center gap-3">
                        <span className="text-xs text-gray-400">Row {r.rowIndex + 1}</span>
                        <span className="text-xs text-red-600 dark:text-red-400">{r.reason}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {confirmResult.imported > 0 && (
              <div className="text-center p-4 bg-emerald-50 dark:bg-emerald-950/20 rounded-lg border border-emerald-200 dark:border-emerald-800">
                <p className="text-sm text-emerald-700 dark:text-emerald-300 font-medium">
                  {confirmResult.imported}{" "}
                  {dataType === "technicians" ? "technician" : dataType === "work-orders" ? "work order" : dataType === "payments" ? "payment record" : "invoice"}
                  {confirmResult.imported !== 1 ? "s" : ""} added to your database
                </p>
                {(dataType === "technicians" || dataType === "work-orders") && (
                  <a
                    href={dataType === "technicians" ? "/technicians" : "/work-orders"}
                    className="inline-flex items-center gap-2 mt-2 text-sm text-emerald-600 dark:text-emerald-400 underline underline-offset-2 hover:text-emerald-800 font-medium"
                  >
                    View {dataType === "technicians" ? "Technician List" : "Work Orders"} →
                  </a>
                )}
              </div>
            )}
            {confirmResult.imported === 0 && (
              <div className="text-center p-4 bg-amber-50 dark:bg-amber-950/20 rounded-lg border border-amber-200 dark:border-amber-800">
                <p className="text-sm text-amber-700 dark:text-amber-300 font-medium">
                  No new records were added. All rows were either skipped (already exist) or had errors.
                </p>
              </div>
            )}

            <div className="flex gap-3 justify-center">
              <Button variant="outline" onClick={downloadReport} className="gap-2">
                <Download className="h-4 w-4" /> Download Report
              </Button>
              <Button variant="outline" onClick={resetImport} className="gap-2">
                <RotateCcw className="h-4 w-4" /> Import Another File
              </Button>
            </div>
          </div>
        )}

        {/* ─── SQL Direct Import Section ─────────────────────────── */}
        <div className="mt-10 border-t border-gray-200 dark:border-gray-700 pt-8">
          <button
            onClick={() => setSqlExpanded(p => !p)}
            className="w-full flex items-center justify-between gap-3 group"
          >
            <div className="flex items-center gap-3">
              <div className="p-2 bg-gray-800 dark:bg-gray-700 rounded-lg">
                <Terminal className="h-5 w-5 text-green-400" />
              </div>
              <div className="text-left">
                <p className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                  SQL Direct Import
                  <Badge className="bg-gray-800 dark:bg-gray-700 text-amber-400 text-xs border border-amber-500/30">Advanced</Badge>
                </p>
                <p className="text-sm text-gray-500 dark:text-gray-400">For administrators with a PostgreSQL export — paste or upload raw INSERT statements</p>
              </div>
            </div>
            <div className="text-gray-400 group-hover:text-gray-600 dark:group-hover:text-gray-200 transition-colors shrink-0">
              {sqlExpanded ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
            </div>
          </button>

          {sqlExpanded && (
            <div className="mt-6 space-y-5">
              {/* Warning banner */}
              <Alert className="border-amber-300 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-700">
                <ShieldAlert className="h-4 w-4 text-amber-600" />
                <AlertDescription className="text-amber-800 dark:text-amber-300 text-sm">
                  <strong>Admin-only. Append-only.</strong> Paste or upload PostgreSQL <code className="font-mono bg-amber-100 dark:bg-amber-900/40 px-1 rounded">INSERT INTO</code> statements exported from your old system.
                  All statements run inside a single transaction — if any fails, the <strong>entire batch is rolled back automatically</strong>.
                  <br /><span className="mt-1 block text-xs text-amber-700 dark:text-amber-400">
                    Allowed: <code className="font-mono">INSERT</code> only &nbsp;·&nbsp;
                    Blocked: <code className="font-mono">UPDATE</code>, <code className="font-mono">DELETE</code>, <code className="font-mono">DROP</code>, <code className="font-mono">TRUNCATE</code>, <code className="font-mono">ALTER</code>, <code className="font-mono">COPY</code>
                  </span>
                </AlertDescription>
              </Alert>

              {/* File upload row */}
              <div className="flex items-center gap-3">
                <input ref={sqlFileRef} type="file" accept=".sql" className="hidden" onChange={handleSqlFileChange} />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => sqlFileRef.current?.click()}
                  className="gap-2 shrink-0"
                >
                  <FileCode2 className="h-4 w-4" /> Upload .sql file
                </Button>
                <span className="text-sm text-gray-400">or paste your SQL below</span>
              </div>

              {/* SQL Textarea */}
              <Textarea
                value={sqlText}
                onChange={e => setSqlText(e.target.value)}
                placeholder={`-- Paste your INSERT statements here\nINSERT INTO technicians (first_name, last_name, email, phone, specialization, experience, hourly_rate, location, payment_methods)\nVALUES ('Jane', 'Smith', 'jane@example.com', '555-0100', 'HVAC', 5, 75.00, 'Chicago, IL', 'check');`}
                className="font-mono text-xs h-52 bg-gray-900 dark:bg-gray-950 text-green-300 dark:text-green-300 border-gray-700 placeholder:text-gray-600 resize-y"
              />

              <div className="flex items-center justify-between">
                <p className="text-xs text-gray-400">
                  {sqlText.trim() ? `${sqlText.split(";").filter(s => s.trim()).length} statement(s) detected` : "No SQL entered"}
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => { setSqlText(""); setSqlResult(null); }}
                    disabled={!sqlText && !sqlResult}
                    className="gap-2"
                  >
                    <RotateCcw className="h-3.5 w-3.5" /> Clear
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => sqlMutation.mutate({ sql: sqlText })}
                    disabled={sqlMutation.isPending || !sqlText.trim()}
                    className="gap-2 bg-gray-800 hover:bg-gray-700 dark:bg-gray-700 dark:hover:bg-gray-600 text-white"
                  >
                    {sqlMutation.isPending
                      ? <><div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Executing…</>
                      : <><Play className="h-3.5 w-3.5" /> Execute SQL</>
                    }
                  </Button>
                </div>
              </div>

              {/* Results */}
              {sqlResult && (
                <Card className={cn(
                  "border",
                  sqlResult.success
                    ? "border-emerald-200 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-950/10"
                    : "border-red-200 dark:border-red-800 bg-red-50/50 dark:bg-red-950/10"
                )}>
                  <CardHeader className="pb-2 pt-4 px-4">
                    <CardTitle className={cn("text-sm flex items-center gap-2", sqlResult.success ? "text-emerald-700 dark:text-emerald-400" : "text-red-700 dark:text-red-400")}>
                      {sqlResult.success ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
                      {sqlResult.message}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="px-4 pb-4">
                    <div className="space-y-1.5 max-h-52 overflow-y-auto">
                      {sqlResult.results.map((r, i) => (
                        <div key={i} className="flex items-start gap-2 text-xs">
                          <Badge variant="secondary" className="text-xs shrink-0 font-mono">{r.rowCount} row{r.rowCount !== 1 ? "s" : ""}</Badge>
                          <code className="text-gray-600 dark:text-gray-400 truncate font-mono">{r.statement}</code>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
