import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  LineChart, Line, PieChart, Pie, Cell, AreaChart, Area, RadialBarChart, RadialBar,
} from "recharts";
import {
  TrendingUp, TrendingDown, Users, DollarSign, Clock,
  FileText, Award, Activity, BarChart3, PieChart as PieChartIcon,
  RefreshCw, CheckCircle, XCircle, AlertTriangle, Package, CreditCard,
  ArrowUpCircle, ArrowDownCircle, Minus, Download, Calendar, Target,
  Layers, AlertCircle, ShieldCheck,
} from "lucide-react";
import { PageGuard } from "@/components/rbac/advanced-permission-guard";

interface ProposalVsInvoiceItem {
  workOrderId: number;
  workOrderNumber: string;
  clientName: string;
  status: string;
  proposalTotal: number;
  invoiceTotal: number;
  diff: number;
  result: "under_budget" | "over_budget" | "exact";
  hasProposal: boolean;
  hasInvoice: boolean;
  invoiceStatus: string | null;
}

interface AnalyticsData {
  workOrderStats: {
    total: number; completed: number; pending: number;
    inProgress: number; cancelled: number; avgCompletionTime: number; urgentCount: number;
  };
  financialStats: {
    totalRevenue: number; totalCosts: number; profit: number; avgProjectValue: number;
    outstandingInvoices: number; paidInvoices: number; approvedInvoices: number;
    totalLaborCost: number; totalMaterialCost: number;
  };
  technicianStats: {
    totalTechnicians: number; activeTechnicians: number; avgRating: number; totalRatings: number;
    topPerformers: Array<{ id: number; name: string; rating: number; completedJobs: number }>;
  };
  userStats: {
    totalUsers: number; activeUsers: number;
    roleDistribution: Array<{ role: string; count: number }>;
  };
  monthlyData: Array<{ month: string; workOrders: number; revenue: number; costs: number; profit: number }>;
  categoryData: Array<{ category: string; count: number; avgTime: number; revenue: number }>;
  priorityData: Array<{ priority: string; count: number; percentage: number }>;
  statusData: Array<{ status: string; count: number; color: string; percentage: number }>;
  allPaymentsList: Array<{
    id: number; workOrderNumber: string; clientName: string;
    amountRequested: number; amountApproved: number; status: string; createdAt: string;
  }>;
  proposalVsInvoice: ProposalVsInvoiceItem[];
  proposalVsSummary: {
    totalCompared: number; underBudgetCount: number; overBudgetCount: number;
    exactCount: number; totalSaved: number; totalOverspent: number; netResult: number;
  };
  recentActivity: Array<{ id: number; type: string; description: string; timestamp: string; user: string }>;
}

const COLORS = ["#0088FE", "#00C49F", "#FFBB28", "#FF8042", "#8884D8", "#82CA9D", "#ffc658", "#a4de6c", "#d0ed57", "#83a6ed"];

const fmt = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);

const PAYMENT_STATUS: Record<string, { label: string; color: string }> = {
  pending:        { label: "Pending",        color: "bg-yellow-100 text-yellow-800" },
  approved:       { label: "Approved",       color: "bg-blue-100 text-blue-800" },
  paid:           { label: "Paid",           color: "bg-green-100 text-green-800" },
  partially_paid: { label: "Partial",        color: "bg-purple-100 text-purple-800" },
  rejected:       { label: "Rejected",       color: "bg-red-100 text-red-800" },
};

function downloadCSV(filename: string, rows: string[][]): void {
  const content = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
  const blob = new Blob(["\uFEFF" + content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function Analytics() {
  const { t, i18n } = useTranslation();
  const isAr = i18n.language === "ar";
  const [dateRange, setDateRange] = useState("all");
  const [reportPeriod, setReportPeriod] = useState<"daily" | "monthly" | "yearly">("monthly");

  const { data: analytics, isLoading, error, refetch } = useQuery<AnalyticsData>({
    queryKey: ["/api/analytics", dateRange],
    queryFn: async () => {
      const r = await fetch(`/api/analytics?range=${dateRange}`);
      if (!r.ok) throw new Error(await r.text());
      return r.json();
    },
  });

  const handleDownload = () => {
    if (!analytics) return;
    const a = analytics;
    const now = new Date();
    const todayStr = now.toISOString().split("T")[0];

    let filename = "";
    let rows: string[][] = [];

    if (reportPeriod === "daily") {
      filename = `report-daily-${todayStr}.csv`;
      const todayPayments = a.allPaymentsList.filter(p => p.createdAt?.startsWith(todayStr));
      rows = [
        [t("an.report.title"), t("an.report.daily"), todayStr],
        [],
        [t("an.report.summary")],
        [t("an.kpi.workOrders"), String(a.workOrderStats.total)],
        [t("an.kpi.completed"), String(a.workOrderStats.completed)],
        [t("an.kpi.inProgress"), String(a.workOrderStats.inProgress)],
        [t("an.kpi.totalRevenue"), fmt(a.financialStats.totalRevenue)],
        [t("an.kpi.totalPayments"), fmt(a.financialStats.totalCosts)],
        [t("an.kpi.profit"), fmt(a.financialStats.profit)],
        [],
        [t("an.report.paymentsToday")],
        [t("an.col.workOrder"), t("an.col.client"), t("an.col.requested"), t("an.col.approved"), t("an.col.status")],
        ...todayPayments.map(p => [p.workOrderNumber, p.clientName, fmt(p.amountRequested), fmt(p.amountApproved), p.status]),
      ];
    } else if (reportPeriod === "monthly") {
      filename = `report-monthly-${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}.csv`;
      rows = [
        [t("an.report.title"), t("an.report.monthly"), `${now.toLocaleString("en-US",{month:"long"})} ${now.getFullYear()}`],
        [],
        [t("an.report.summary")],
        [t("an.kpi.workOrders"), String(a.workOrderStats.total)],
        [t("an.kpi.completed"), String(a.workOrderStats.completed)],
        [t("an.kpi.pending"), String(a.workOrderStats.pending)],
        [t("an.kpi.inProgress"), String(a.workOrderStats.inProgress)],
        [t("an.kpi.cancelled"), String(a.workOrderStats.cancelled)],
        [t("an.kpi.totalRevenue"), fmt(a.financialStats.totalRevenue)],
        [t("an.kpi.totalPayments"), fmt(a.financialStats.totalCosts)],
        [t("an.kpi.profit"), fmt(a.financialStats.profit)],
        [t("an.kpi.profitMargin"), `${a.financialStats.totalRevenue > 0 ? ((a.financialStats.profit/a.financialStats.totalRevenue)*100).toFixed(1) : "0"}%`],
        [t("an.kpi.avgInvoice"), fmt(a.financialStats.avgProjectValue)],
        [],
        [t("an.report.monthlyBreakdown")],
        [t("an.col.month"), t("an.col.workOrders"), t("an.col.revenue"), t("an.col.costs"), t("an.col.profit")],
        ...a.monthlyData.map(m => [m.month, String(m.workOrders), fmt(m.revenue), fmt(m.costs), fmt(m.profit)]),
        [],
        [t("an.report.categoryBreakdown")],
        [t("an.col.category"), t("an.col.count"), t("an.col.revenue")],
        ...a.categoryData.map(c => [c.category, String(c.count), fmt(c.revenue)]),
        [],
        [t("an.report.technicianSummary")],
        [t("an.col.technician"), t("an.col.completedJobs"), t("an.col.rating")],
        ...a.technicianStats.topPerformers.map(tt => [tt.name, String(tt.completedJobs), `${tt.rating}/5`]),
        [],
        [t("an.report.allPayments")],
        [t("an.col.workOrder"), t("an.col.client"), t("an.col.date"), t("an.col.requested"), t("an.col.approved"), t("an.col.status")],
        ...a.allPaymentsList.map(p => [p.workOrderNumber, p.clientName, new Date(p.createdAt).toLocaleDateString(), fmt(p.amountRequested), fmt(p.amountApproved), p.status]),
      ];
    } else {
      filename = `report-yearly-${now.getFullYear()}.csv`;
      rows = [
        [t("an.report.title"), t("an.report.yearly"), String(now.getFullYear())],
        [],
        [t("an.report.summary")],
        [t("an.kpi.workOrders"), String(a.workOrderStats.total)],
        [t("an.kpi.completed"), String(a.workOrderStats.completed)],
        [t("an.kpi.pending"), String(a.workOrderStats.pending)],
        [t("an.kpi.inProgress"), String(a.workOrderStats.inProgress)],
        [t("an.kpi.cancelled"), String(a.workOrderStats.cancelled)],
        [t("an.kpi.urgentCount"), String(a.workOrderStats.urgentCount)],
        [t("an.kpi.totalRevenue"), fmt(a.financialStats.totalRevenue)],
        [t("an.kpi.totalPayments"), fmt(a.financialStats.totalCosts)],
        [t("an.kpi.profit"), fmt(a.financialStats.profit)],
        [t("an.kpi.profitMargin"), `${a.financialStats.totalRevenue > 0 ? ((a.financialStats.profit/a.financialStats.totalRevenue)*100).toFixed(1) : "0"}%`],
        [t("an.kpi.paidInvoices"), String(a.financialStats.paidInvoices)],
        [t("an.kpi.approvedInvoices"), String(a.financialStats.approvedInvoices)],
        [t("an.kpi.outstandingInvoices"), String(a.financialStats.outstandingInvoices)],
        [t("an.kpi.totalLabor"), fmt(a.financialStats.totalLaborCost)],
        [t("an.kpi.totalMaterials"), fmt(a.financialStats.totalMaterialCost)],
        [],
        [t("an.report.monthlyBreakdown")],
        [t("an.col.month"), t("an.col.workOrders"), t("an.col.revenue"), t("an.col.costs"), t("an.col.profit")],
        ...a.monthlyData.map(m => [m.month, String(m.workOrders), fmt(m.revenue), fmt(m.costs), fmt(m.profit)]),
        [],
        [t("an.report.categoryBreakdown")],
        [t("an.col.category"), t("an.col.count"), t("an.col.revenue"), t("an.col.avgTime")],
        ...a.categoryData.map(c => [c.category, String(c.count), fmt(c.revenue), `${c.avgTime}h`]),
        [],
        [t("an.report.statusBreakdown")],
        [t("an.col.status"), t("an.col.count"), t("an.col.percentage")],
        ...a.statusData.map(s => [s.status, String(s.count), `${s.percentage}%`]),
        [],
        [t("an.report.priorityBreakdown")],
        [t("an.col.priority"), t("an.col.count"), t("an.col.percentage")],
        ...a.priorityData.map(p => [p.priority, String(p.count), `${p.percentage}%`]),
        [],
        [t("an.report.technicianSummary")],
        [t("an.col.technician"), t("an.col.completedJobs"), t("an.col.rating")],
        ...a.technicianStats.topPerformers.map(tt => [tt.name, String(tt.completedJobs), `${tt.rating}/5`]),
        [],
        [t("an.report.proposalVsInvoice")],
        [t("an.col.workOrder"), t("an.col.client"), t("an.col.proposal"), t("an.col.invoice"), t("an.col.difference"), t("an.col.result")],
        ...a.proposalVsInvoice.map(i => [i.workOrderNumber, i.clientName, i.hasProposal ? fmt(i.proposalTotal) : "—", i.hasInvoice ? fmt(i.invoiceTotal) : "—", i.hasProposal && i.hasInvoice ? fmt(i.diff) : "—", i.result || "—"]),
        [],
        [t("an.report.allPayments")],
        [t("an.col.workOrder"), t("an.col.client"), t("an.col.date"), t("an.col.requested"), t("an.col.approved"), t("an.col.status")],
        ...a.allPaymentsList.map(p => [p.workOrderNumber, p.clientName, new Date(p.createdAt).toLocaleDateString(), fmt(p.amountRequested), fmt(p.amountApproved), p.status]),
      ];
    }

    downloadCSV(filename, rows);
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-bold">{t("an.title")}</h1>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {[...Array(8)].map((_, i) => (
            <Card key={i} className="animate-pulse">
              <CardHeader className="pb-2">
                <div className="h-4 bg-gray-200 rounded w-3/4" />
                <div className="h-8 bg-gray-200 rounded w-1/2 mt-2" />
              </CardHeader>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (error || !analytics) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold">{t("an.title")}</h1>
          <Button onClick={() => refetch()} variant="outline">
            <RefreshCw className="h-4 w-4 mr-2" />{t("an.retry")}
          </Button>
        </div>
        <Card>
          <CardContent className="p-8 text-center">
            <AlertTriangle className="h-12 w-12 text-red-400 mx-auto mb-3" />
            <p className="text-red-600 font-medium">{t("an.loadFailed")}</p>
            <p className="text-sm text-gray-500 mt-1">{String(error || "Unknown error")}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const a = analytics;
  const profitMargin = a.financialStats.totalRevenue > 0
    ? ((a.financialStats.profit / a.financialStats.totalRevenue) * 100).toFixed(1)
    : "0.0";

  const completionRate = a.workOrderStats.total > 0
    ? Math.round((a.workOrderStats.completed / a.workOrderStats.total) * 100)
    : 0;

  return (
    <PageGuard pageName="analytics">
      <div className={`space-y-6 ${isAr ? "rtl text-right" : ""}`} dir={isAr ? "rtl" : "ltr"}>

        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">{t("an.title")}</h1>
            <p className="text-gray-500 text-sm mt-1">{t("an.subtitle")}</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={() => refetch()} variant="outline" size="sm">
              <RefreshCw className="h-4 w-4 me-2" />{t("an.refresh")}
            </Button>
          </div>
        </div>

        {/* Download Report Section */}
        <Card className="border-2 border-dashed border-blue-200 bg-blue-50/40">
          <CardContent className="p-4">
            <div className="flex flex-wrap items-center gap-4 justify-between">
              <div className="flex items-center gap-2">
                <Download className="h-5 w-5 text-blue-600" />
                <div>
                  <p className="font-semibold text-gray-800">{t("an.downloadReport")}</p>
                  <p className="text-xs text-gray-500">{t("an.downloadReportDesc")}</p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex gap-2">
                  {(["daily", "monthly", "yearly"] as const).map(p => (
                    <button
                      key={p}
                      onClick={() => setReportPeriod(p)}
                      className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                        reportPeriod === p
                          ? "bg-blue-600 text-white shadow-sm"
                          : "bg-white text-gray-600 border hover:bg-gray-50"
                      }`}
                    >
                      {t(`an.period.${p}`)}
                    </button>
                  ))}
                </div>
                <Button onClick={handleDownload} size="sm" className="bg-blue-600 hover:bg-blue-700 text-white">
                  <Download className="h-4 w-4 me-2" />
                  {t("an.downloadCSV")}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* KPI Row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
          {[
            { label: t("an.kpi.workOrders"),    value: a.workOrderStats.total,             icon: FileText,    color: "text-blue-600",    bg: "bg-blue-50" },
            { label: t("an.kpi.completed"),      value: a.workOrderStats.completed,         icon: CheckCircle, color: "text-green-600",   bg: "bg-green-50" },
            { label: t("an.kpi.inProgress"),     value: a.workOrderStats.inProgress,        icon: Activity,    color: "text-orange-600",  bg: "bg-orange-50" },
            { label: t("an.kpi.totalRevenue"),   value: fmt(a.financialStats.totalRevenue), icon: DollarSign,  color: "text-emerald-600", bg: "bg-emerald-50" },
            { label: t("an.kpi.totalPayments"),  value: fmt(a.financialStats.totalCosts),   icon: CreditCard,  color: "text-purple-600",  bg: "bg-purple-50" },
            { label: t("an.kpi.profitMargin"),   value: `${profitMargin}%`,                 icon: TrendingUp,  color: "text-blue-700",    bg: "bg-blue-50" },
            { label: t("an.kpi.technicians"),    value: a.technicianStats.activeTechnicians,icon: Users,       color: "text-indigo-600",  bg: "bg-indigo-50" },
            { label: t("an.kpi.avgRating"),      value: `${a.technicianStats.avgRating}/5 ⭐`, icon: Award,    color: "text-yellow-600",  bg: "bg-yellow-50" },
          ].map(k => (
            <Card key={k.label} className={`${k.bg} border-0`}>
              <CardContent className="p-4">
                <k.icon className={`h-5 w-5 mb-2 ${k.color}`} />
                <p className={`text-xl font-bold ${k.color}`}>{k.value}</p>
                <p className="text-xs text-gray-500 mt-0.5 leading-tight">{k.label}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        <Tabs defaultValue="overview" className="space-y-6">
          <TabsList className="grid w-full grid-cols-3 sm:grid-cols-6">
            <TabsTrigger value="overview">{t("an.tabs.overview")}</TabsTrigger>
            <TabsTrigger value="financial">{t("an.tabs.financial")}</TabsTrigger>
            <TabsTrigger value="workorders">{t("an.tabs.workOrders")}</TabsTrigger>
            <TabsTrigger value="payments">{t("an.tabs.payments")}</TabsTrigger>
            <TabsTrigger value="proposal-vs-invoice">{t("an.tabs.proposalVsInvoice")}</TabsTrigger>
            <TabsTrigger value="technicians">{t("an.tabs.technicians")}</TabsTrigger>
          </TabsList>

          {/* ── Overview ── */}
          <TabsContent value="overview" className="space-y-6">
            {/* Completion Rate */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Card className="bg-gradient-to-br from-blue-500 to-blue-700 border-0 text-white">
                <CardContent className="p-5">
                  <Target className="h-7 w-7 mb-3 opacity-80" />
                  <p className="text-4xl font-bold">{completionRate}%</p>
                  <p className="text-blue-100 text-sm mt-1">{t("an.overview.completionRate")}</p>
                  <p className="text-blue-200 text-xs mt-1">{a.workOrderStats.completed} / {a.workOrderStats.total} {t("an.overview.orders")}</p>
                </CardContent>
              </Card>
              <Card className="bg-gradient-to-br from-emerald-500 to-emerald-700 border-0 text-white">
                <CardContent className="p-5">
                  <DollarSign className="h-7 w-7 mb-3 opacity-80" />
                  <p className="text-4xl font-bold">{fmt(a.financialStats.profit)}</p>
                  <p className="text-emerald-100 text-sm mt-1">{t("an.overview.netProfit")}</p>
                  <p className="text-emerald-200 text-xs mt-1">{t("an.overview.margin")}: {profitMargin}%</p>
                </CardContent>
              </Card>
              <Card className="bg-gradient-to-br from-purple-500 to-purple-700 border-0 text-white">
                <CardContent className="p-5">
                  <AlertCircle className="h-7 w-7 mb-3 opacity-80" />
                  <p className="text-4xl font-bold">{a.workOrderStats.urgentCount}</p>
                  <p className="text-purple-100 text-sm mt-1">{t("an.overview.urgentOrders")}</p>
                  <p className="text-purple-200 text-xs mt-1">{t("an.overview.needAttention")}</p>
                </CardContent>
              </Card>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2"><BarChart3 className="h-5 w-5" />{t("an.charts.monthlyWorkOrders")}</CardTitle>
                  <CardDescription>{t("an.charts.workOrderVolume")}</CardDescription>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={a.monthlyData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                      <YAxis />
                      <Tooltip />
                      <Bar dataKey="workOrders" fill="#8884d8" name={t("an.kpi.workOrders")} radius={[4,4,0,0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2"><PieChartIcon className="h-5 w-5" />{t("an.charts.workOrderStatus")}</CardTitle>
                  <CardDescription>{t("an.charts.currentDistribution")}</CardDescription>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={280}>
                    <PieChart>
                      <Pie data={a.statusData} cx="50%" cy="50%" outerRadius={90}
                        dataKey="count" label={({ status, percentage }) => `${status} (${percentage}%)`}
                        labelLine={false}>
                        {a.statusData.map((entry, i) => (
                          <Cell key={i} fill={entry.color || COLORS[i % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <Card>
                <CardHeader><CardTitle>{t("an.overview.topTechnicians")}</CardTitle></CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {a.technicianStats.topPerformers.slice(0, 6).map((tech, i) => (
                      <div key={tech.id} className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-gray-400 text-sm w-5">{i + 1}.</span>
                          <div>
                            <p className="font-medium text-sm">{tech.name}</p>
                            <p className="text-xs text-gray-500">{tech.completedJobs} {t("an.col.completedJobs")}</p>
                          </div>
                        </div>
                        <Badge variant="secondary">{tech.rating.toFixed(1)} ⭐</Badge>
                      </div>
                    ))}
                    {a.technicianStats.topPerformers.length === 0 && (
                      <p className="text-sm text-gray-400 italic">{t("an.noData")}</p>
                    )}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader><CardTitle>{t("an.charts.categoryBreakdown")}</CardTitle></CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {a.categoryData.slice(0, 6).map(cat => (
                      <div key={cat.category} className="space-y-1">
                        <div className="flex justify-between text-sm">
                          <span className="truncate">{cat.category}</span>
                          <span className="font-medium ml-2">{cat.count}</span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-1.5">
                          <div className="bg-blue-500 h-1.5 rounded-full" style={{
                            width: `${a.categoryData.length > 0 ? (cat.count / Math.max(...a.categoryData.map(c => c.count))) * 100 : 0}%`
                          }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader><CardTitle>{t("an.overview.recentActivity")}</CardTitle></CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {a.recentActivity.slice(0, 6).map(act => (
                      <div key={act.id} className="flex items-start gap-2">
                        <div className="w-2 h-2 bg-blue-500 rounded-full mt-1.5 flex-shrink-0" />
                        <div>
                          <p className="text-sm">{act.description}</p>
                          <p className="text-xs text-gray-500">{act.timestamp}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* ── Financial ── */}
          <TabsContent value="financial" className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {[
                { label: t("an.financial.totalRevenue"), value: fmt(a.financialStats.totalRevenue), icon: DollarSign, color: "text-green-700", bg: "bg-green-50 border-green-200" },
                { label: t("an.financial.totalPayments"), value: fmt(a.financialStats.totalCosts), icon: CreditCard, color: "text-red-700", bg: "bg-red-50 border-red-200" },
                { label: t("an.financial.netProfit"), value: fmt(a.financialStats.profit), icon: TrendingUp, color: a.financialStats.profit >= 0 ? "text-blue-700" : "text-red-700", bg: "bg-blue-50 border-blue-200" },
              ].map(s => (
                <Card key={s.label} className={`border ${s.bg}`}>
                  <CardContent className="p-5 flex items-center gap-4">
                    <s.icon className={`h-8 w-8 ${s.color}`} />
                    <div>
                      <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
                      <p className="text-sm text-gray-600">{s.label}</p>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle>{t("an.charts.revenueVsCosts")}</CardTitle>
                  <CardDescription>{t("an.charts.monthlyComparison")}</CardDescription>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <AreaChart data={a.monthlyData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                      <YAxis tickFormatter={v => `$${(v/1000).toFixed(0)}k`} />
                      <Tooltip formatter={(v: any) => fmt(v)} />
                      <Legend />
                      <Area type="monotone" dataKey="revenue" stroke="#22c55e" fill="#dcfce7" name={t("an.financial.revenue")} />
                      <Area type="monotone" dataKey="costs" stroke="#ef4444" fill="#fee2e2" name={t("an.financial.payments")} />
                    </AreaChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>{t("an.charts.monthlyProfit")}</CardTitle>
                  <CardDescription>{t("an.charts.revenueMinusPayments")}</CardDescription>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={a.monthlyData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                      <YAxis tickFormatter={v => `$${(v/1000).toFixed(0)}k`} />
                      <Tooltip formatter={(v: any) => fmt(v)} />
                      <Bar dataKey="profit" name={t("an.financial.profit")} radius={[4,4,0,0]} fill="#3b82f6" />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>

            {/* Revenue by Category chart */}
            <Card>
              <CardHeader>
                <CardTitle>{t("an.charts.categoryRevenue")}</CardTitle>
                <CardDescription>{t("an.charts.categoryRevenueDesc")}</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={a.categoryData.filter(c => c.revenue > 0)}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="category" tick={{ fontSize: 11 }} angle={-20} textAnchor="end" height={50} />
                    <YAxis tickFormatter={v => `$${(v/1000).toFixed(0)}k`} />
                    <Tooltip formatter={(v: any) => fmt(v)} />
                    <Bar dataKey="revenue" fill="#10b981" name={t("an.financial.revenue")} radius={[4,4,0,0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <Card>
                <CardHeader><CardTitle>{t("an.financial.invoiceSummary")}</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  {[
                    { label: t("an.financial.approvedPending"), value: a.financialStats.approvedInvoices, color: "text-blue-600" },
                    { label: t("an.financial.paid"), value: a.financialStats.paidInvoices, color: "text-green-600" },
                    { label: t("an.financial.outstanding"), value: a.financialStats.outstandingInvoices, color: "text-orange-600" },
                    { label: t("an.financial.avgInvoice"), value: fmt(a.financialStats.avgProjectValue), color: "text-gray-800" },
                  ].map(s => (
                    <div key={s.label} className="flex justify-between items-center">
                      <span className="text-sm text-gray-600">{s.label}</span>
                      <span className={`font-bold ${s.color}`}>{s.value}</span>
                    </div>
                  ))}
                </CardContent>
              </Card>
              <Card>
                <CardHeader><CardTitle>{t("an.financial.costBreakdown")}</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  {[
                    { label: t("an.financial.labor"), value: fmt(a.financialStats.totalLaborCost), color: "text-purple-700" },
                    { label: t("an.financial.materials"), value: fmt(a.financialStats.totalMaterialCost), color: "text-orange-700" },
                    { label: t("an.financial.techPaymentsOut"), value: fmt(a.financialStats.totalCosts), color: "text-red-700" },
                  ].map(s => (
                    <div key={s.label} className="flex justify-between items-center">
                      <span className="text-sm text-gray-600">{s.label}</span>
                      <span className={`font-bold ${s.color}`}>{s.value}</span>
                    </div>
                  ))}
                </CardContent>
              </Card>
              <Card>
                <CardHeader><CardTitle>{t("an.financial.profitSplit")}</CardTitle></CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={150}>
                    <PieChart>
                      <Pie
                        data={[
                          { name: t("an.financial.revenue"), value: a.financialStats.totalRevenue },
                          { name: t("an.financial.payments"), value: a.financialStats.totalCosts },
                        ]}
                        cx="50%" cy="50%" outerRadius={60} dataKey="value">
                        <Cell fill="#22c55e" />
                        <Cell fill="#ef4444" />
                      </Pie>
                      <Tooltip formatter={(v: any) => fmt(v)} />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* ── Work Orders Deep Dive ── */}
          <TabsContent value="workorders" className="space-y-6">
            {/* Status summary cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {[
                { label: t("an.kpi.pending"),    value: a.workOrderStats.pending,    color: "text-yellow-700", bg: "bg-yellow-50", icon: Clock },
                { label: t("an.kpi.inProgress"), value: a.workOrderStats.inProgress, color: "text-blue-700",   bg: "bg-blue-50",   icon: Activity },
                { label: t("an.kpi.completed"),  value: a.workOrderStats.completed,  color: "text-green-700",  bg: "bg-green-50",  icon: CheckCircle },
                { label: t("an.kpi.cancelled"),  value: a.workOrderStats.cancelled,  color: "text-red-700",    bg: "bg-red-50",    icon: XCircle },
              ].map(s => (
                <Card key={s.label} className={`${s.bg} border-0`}>
                  <CardContent className="p-5 flex items-center gap-3">
                    <s.icon className={`h-8 w-8 ${s.color}`} />
                    <div>
                      <p className={`text-3xl font-bold ${s.color}`}>{s.value}</p>
                      <p className="text-sm text-gray-600">{s.label}</p>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Priority Distribution */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2"><ShieldCheck className="h-5 w-5" />{t("an.charts.priorityDistribution")}</CardTitle>
                  <CardDescription>{t("an.charts.priorityDistributionDesc")}</CardDescription>
                </CardHeader>
                <CardContent>
                  {a.priorityData.length > 0 ? (
                    <ResponsiveContainer width="100%" height={280}>
                      <PieChart>
                        <Pie
                          data={a.priorityData}
                          cx="50%" cy="50%" outerRadius={100}
                          dataKey="count"
                          label={({ priority, percentage }) => `${priority} (${percentage}%)`}
                          labelLine={false}
                        >
                          {a.priorityData.map((_, i) => (
                            <Cell key={i} fill={["#ef4444","#f97316","#3b82f6","#22c55e"][i % 4]} />
                          ))}
                        </Pie>
                        <Tooltip />
                      </PieChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="py-12 text-center text-gray-400 text-sm">{t("an.noData")}</div>
                  )}
                </CardContent>
              </Card>

              {/* Status Full Breakdown */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2"><Layers className="h-5 w-5" />{t("an.charts.statusBreakdown")}</CardTitle>
                  <CardDescription>{t("an.charts.statusBreakdownDesc")}</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2 max-h-72 overflow-y-auto">
                    {a.statusData.sort((x,y) => y.count - x.count).map(s => (
                      <div key={s.status} className="flex items-center gap-3">
                        <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: s.color }} />
                        <div className="flex-1 min-w-0">
                          <div className="flex justify-between text-sm mb-0.5">
                            <span className="truncate capitalize">{s.status.replace(/_/g," ")}</span>
                            <span className="font-medium ml-2">{s.count} ({s.percentage}%)</span>
                          </div>
                          <div className="w-full bg-gray-100 rounded-full h-1.5">
                            <div className="h-1.5 rounded-full" style={{ width:`${s.percentage}%`, background: s.color }} />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Category Deep Dive */}
            <Card>
              <CardHeader>
                <CardTitle>{t("an.charts.categoryDeepDive")}</CardTitle>
                <CardDescription>{t("an.charts.categoryDeepDiveDesc")}</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={a.categoryData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="category" tick={{ fontSize: 11 }} angle={-20} textAnchor="end" height={50} />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="count" fill="#8884d8" name={t("an.col.count")} radius={[4,4,0,0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Monthly trend line */}
            <Card>
              <CardHeader>
                <CardTitle>{t("an.charts.monthlyTrend")}</CardTitle>
                <CardDescription>{t("an.charts.monthlyTrendDesc")}</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={280}>
                  <LineChart data={a.monthlyData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Line type="monotone" dataKey="workOrders" stroke="#8884d8" strokeWidth={2} dot={{ r: 4 }} name={t("an.kpi.workOrders")} />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* User Role Distribution */}
            {a.userStats.roleDistribution.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>{t("an.charts.userRoles")}</CardTitle>
                  <CardDescription>{t("an.charts.userRolesDesc")}</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                    <ResponsiveContainer width="100%" height={200}>
                      <PieChart>
                        <Pie data={a.userStats.roleDistribution} cx="50%" cy="50%" outerRadius={80} dataKey="count" nameKey="role"
                          label={({ role, count }) => `${role}: ${count}`} labelLine={false}>
                          {a.userStats.roleDistribution.map((_, i) => (
                            <Cell key={i} fill={COLORS[i % COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="space-y-2 self-center">
                      <div className="flex justify-between text-sm font-medium text-gray-700 mb-2">
                        <span>{t("an.col.role")}</span>
                        <span>{t("an.col.count")}</span>
                      </div>
                      {a.userStats.roleDistribution.map((r, i) => (
                        <div key={r.role} className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <div className="w-3 h-3 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />
                            <span className="text-sm">{r.role}</span>
                          </div>
                          <Badge variant="outline">{r.count}</Badge>
                        </div>
                      ))}
                      <div className="border-t pt-2 flex justify-between font-medium">
                        <span className="text-sm">{t("an.col.total")}</span>
                        <span className="text-sm">{a.userStats.totalUsers}</span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* ── All Payments ── */}
          <TabsContent value="payments" className="space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div>
                <h2 className="text-xl font-semibold">{t("an.payments.title")}</h2>
                <p className="text-sm text-gray-500">{a.allPaymentsList.length} {t("an.payments.count")}</p>
              </div>
              <div className="flex gap-3 text-center">
                <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-2">
                  <p className="text-lg font-bold text-green-700">{fmt(a.financialStats.totalCosts)}</p>
                  <p className="text-xs text-gray-500">{t("an.payments.totalPaidOut")}</p>
                </div>
                <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-2">
                  <p className="text-lg font-bold text-blue-700">{a.allPaymentsList.length}</p>
                  <p className="text-xs text-gray-500">{t("an.payments.totalPayments")}</p>
                </div>
                <div className="bg-purple-50 border border-purple-200 rounded-lg px-4 py-2">
                  <p className="text-lg font-bold text-purple-700">
                    {a.allPaymentsList.filter(p => p.status === "paid").length}
                  </p>
                  <p className="text-xs text-gray-500">{t("an.payments.fullyPaid")}</p>
                </div>
              </div>
            </div>

            {/* Payment status summary */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              {Object.entries(PAYMENT_STATUS).map(([key, cfg]) => {
                const count = a.allPaymentsList.filter(p => p.status === key).length;
                return (
                  <Card key={key} className="border">
                    <CardContent className="p-3 text-center">
                      <p className="text-2xl font-bold text-gray-800">{count}</p>
                      <Badge className={`text-xs mt-1 ${cfg.color}`}>{cfg.label}</Badge>
                    </CardContent>
                  </Card>
                );
              })}
            </div>

            {a.allPaymentsList.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <CreditCard className="h-12 w-12 mx-auto text-gray-300 mb-3" />
                  <p className="text-gray-500">{t("an.payments.noPayments")}</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-2">
                {a.allPaymentsList.map(p => {
                  const cfg = PAYMENT_STATUS[p.status] || { label: p.status, color: "bg-gray-100 text-gray-700" };
                  return (
                    <Card key={p.id} className="border">
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between flex-wrap gap-3">
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                              <CreditCard className="h-4 w-4 text-blue-600" />
                            </div>
                            <div>
                              <p className="font-semibold text-sm">{p.workOrderNumber}</p>
                              <p className="text-xs text-gray-500">{p.clientName} · {new Date(p.createdAt).toLocaleDateString()}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-4 text-sm">
                            <div className="text-center">
                              <p className="text-xs text-gray-500">{t("an.col.requested")}</p>
                              <p className="font-medium">{fmt(p.amountRequested)}</p>
                            </div>
                            <div className="text-center">
                              <p className="text-xs text-gray-500">{t("an.col.approved")}</p>
                              <p className="font-semibold text-green-700">{p.amountApproved > 0 ? fmt(p.amountApproved) : "—"}</p>
                            </div>
                            <Badge className={`text-xs ${cfg.color}`}>{cfg.label}</Badge>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </TabsContent>

          {/* ── Proposal vs Invoice ── */}
          <TabsContent value="proposal-vs-invoice" className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <Card className="bg-gray-50 border-gray-200">
                <CardContent className="p-5 text-center">
                  <p className="text-2xl font-bold text-gray-800">{a.proposalVsSummary.totalCompared}</p>
                  <p className="text-sm text-gray-500 mt-1">{t("an.pvi.totalCompared")}</p>
                </CardContent>
              </Card>
              <Card className="bg-green-50 border-green-200">
                <CardContent className="p-5">
                  <div className="flex items-center gap-3">
                    <ArrowDownCircle className="h-8 w-8 text-green-600 flex-shrink-0" />
                    <div>
                      <p className="text-xl font-bold text-green-700">{fmt(a.proposalVsSummary.totalSaved)}</p>
                      <p className="text-xs text-green-600">{a.proposalVsSummary.underBudgetCount} {t("an.pvi.jobsUnder")}</p>
                      <p className="text-xs text-gray-500 mt-0.5">{t("an.pvi.underDesc")}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card className="bg-red-50 border-red-200">
                <CardContent className="p-5">
                  <div className="flex items-center gap-3">
                    <ArrowUpCircle className="h-8 w-8 text-red-600 flex-shrink-0" />
                    <div>
                      <p className="text-xl font-bold text-red-700">{fmt(a.proposalVsSummary.totalOverspent)}</p>
                      <p className="text-xs text-red-600">{a.proposalVsSummary.overBudgetCount} {t("an.pvi.jobsOver")}</p>
                      <p className="text-xs text-gray-500 mt-0.5">{t("an.pvi.overDesc")}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card className={`border ${a.proposalVsSummary.netResult >= 0 ? "bg-blue-50 border-blue-200" : "bg-orange-50 border-orange-200"}`}>
                <CardContent className="p-5">
                  <div className="flex items-center gap-3">
                    {a.proposalVsSummary.netResult >= 0
                      ? <TrendingDown className="h-8 w-8 text-blue-600 flex-shrink-0" />
                      : <TrendingUp className="h-8 w-8 text-orange-600 flex-shrink-0" />}
                    <div>
                      <p className={`text-xl font-bold ${a.proposalVsSummary.netResult >= 0 ? "text-blue-700" : "text-orange-700"}`}>
                        {fmt(Math.abs(a.proposalVsSummary.netResult))}
                      </p>
                      <p className="text-xs text-gray-500">
                        {a.proposalVsSummary.netResult >= 0 ? t("an.pvi.netUnder") : t("an.pvi.netOver")}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {a.proposalVsInvoice.filter(i => i.hasProposal && i.hasInvoice).length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>{t("an.pvi.chartTitle")}</CardTitle>
                  <CardDescription>{t("an.pvi.chartDesc")}</CardDescription>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={320}>
                    <BarChart
                      data={a.proposalVsInvoice
                        .filter(i => i.hasProposal && i.hasInvoice)
                        .slice(0, 15)
                        .map(i => ({
                          name: i.workOrderNumber,
                          [t("an.col.proposal")]: i.proposalTotal,
                          [t("an.col.invoice")]: i.invoiceTotal,
                        }))}
                    >
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="name" tick={{ fontSize: 10 }} angle={-30} textAnchor="end" height={50} />
                      <YAxis tickFormatter={v => `$${(v/1000).toFixed(0)}k`} />
                      <Tooltip formatter={(v: any) => fmt(v)} />
                      <Legend />
                      <Bar dataKey={t("an.col.proposal")} fill="#3b82f6" radius={[4,4,0,0]} />
                      <Bar dataKey={t("an.col.invoice")} fill="#f97316" radius={[4,4,0,0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            )}

            <div>
              <h3 className="text-lg font-semibold mb-3">{t("an.pvi.breakdown")}</h3>
              {a.proposalVsInvoice.length === 0 ? (
                <Card>
                  <CardContent className="py-12 text-center">
                    <FileText className="h-12 w-12 mx-auto text-gray-300 mb-3" />
                    <p className="text-gray-500">{t("an.pvi.noData")}</p>
                    <p className="text-sm text-gray-400 mt-1">{t("an.pvi.noDataDesc")}</p>
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-2">
                  {a.proposalVsInvoice.map(item => {
                    const isUnder = item.result === "under_budget";
                    const isOver  = item.result === "over_budget";
                    const isExact = item.result === "exact";
                    return (
                      <Card key={item.workOrderId} className={`border-l-4 ${
                        isUnder ? "border-l-green-500" : isOver ? "border-l-red-500" : "border-l-gray-300"
                      }`}>
                        <CardContent className="p-4">
                          <div className="flex flex-wrap items-center gap-4 justify-between">
                            <div>
                              <p className="font-bold text-gray-900">{item.workOrderNumber}</p>
                              <p className="text-sm text-gray-500">{item.clientName} · {item.status}</p>
                            </div>
                            <div className="grid grid-cols-3 gap-4 text-center text-sm">
                              <div>
                                <p className="text-xs text-gray-500">{t("an.col.proposal")}</p>
                                <p className="font-semibold text-blue-700">
                                  {item.hasProposal ? fmt(item.proposalTotal) : <span className="text-gray-400 italic">—</span>}
                                </p>
                              </div>
                              <div>
                                <p className="text-xs text-gray-500">{t("an.col.invoice")}</p>
                                <p className="font-semibold text-orange-700">
                                  {item.hasInvoice
                                    ? <>{fmt(item.invoiceTotal)} <span className="text-xs text-gray-400">({item.invoiceStatus})</span></>
                                    : <span className="text-gray-400 italic">—</span>}
                                </p>
                              </div>
                              <div>
                                <p className="text-xs text-gray-500">{t("an.col.difference")}</p>
                                {isUnder && (
                                  <div className="flex items-center justify-center gap-1 text-green-700 font-bold">
                                    <ArrowDownCircle className="h-4 w-4" />{fmt(item.diff)}
                                  </div>
                                )}
                                {isOver && (
                                  <div className="flex items-center justify-center gap-1 text-red-700 font-bold">
                                    <ArrowUpCircle className="h-4 w-4" />{fmt(item.diff)}
                                  </div>
                                )}
                                {isExact && (
                                  <div className="flex items-center justify-center gap-1 text-gray-500">
                                    <Minus className="h-4 w-4" />{t("an.pvi.exact")}
                                  </div>
                                )}
                                {(!item.hasProposal || !item.hasInvoice) && (
                                  <span className="text-gray-400 text-xs italic">{t("an.pvi.incomplete")}</span>
                                )}
                              </div>
                            </div>
                            <div>
                              {isUnder && (
                                <Badge className="bg-green-100 text-green-800 border border-green-300 text-xs">
                                  ✓ {t("an.pvi.underBudget")} — {t("an.pvi.saved")} {fmt(item.diff)}
                                </Badge>
                              )}
                              {isOver && (
                                <Badge className="bg-red-100 text-red-800 border border-red-300 text-xs">
                                  ✗ {t("an.pvi.overBudget")} — {t("an.pvi.lost")} {fmt(item.diff)}
                                </Badge>
                              )}
                              {isExact && (
                                <Badge className="bg-gray-100 text-gray-700 border text-xs">= {t("an.pvi.onBudget")}</Badge>
                              )}
                              {!item.hasProposal && (
                                <Badge className="bg-yellow-100 text-yellow-800 border text-xs">{t("an.pvi.noProposal")}</Badge>
                              )}
                              {!item.hasInvoice && (
                                <Badge className="bg-yellow-100 text-yellow-800 border text-xs">{t("an.pvi.noInvoice")}</Badge>
                              )}
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}
            </div>
          </TabsContent>

          {/* ── Technicians ── */}
          <TabsContent value="technicians" className="space-y-6">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {[
                { label: t("an.tech.total"),     value: a.technicianStats.totalTechnicians, color: "text-gray-800" },
                { label: t("an.tech.active"),    value: a.technicianStats.activeTechnicians, color: "text-green-700" },
                { label: t("an.tech.avgRating"), value: `${a.technicianStats.avgRating}/5`,  color: "text-yellow-700" },
                { label: t("an.tech.reviews"),   value: a.technicianStats.totalRatings,       color: "text-blue-700" },
              ].map(s => (
                <Card key={s.label}>
                  <CardContent className="p-5 text-center">
                    <p className={`text-3xl font-bold ${s.color}`}>{s.value}</p>
                    <p className="text-sm text-gray-500 mt-1">{s.label}</p>
                  </CardContent>
                </Card>
              ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card>
                <CardHeader><CardTitle>{t("an.charts.jobsPerTech")}</CardTitle></CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={a.technicianStats.topPerformers.filter(tech => tech.completedJobs > 0).map(tech => ({ name: tech.name, completedJobs: tech.completedJobs }))}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="name" tick={{ fontSize: 10 }} angle={-20} textAnchor="end" height={50} />
                      <YAxis />
                      <Tooltip />
                      <Bar dataKey="completedJobs" fill="#82ca9d" name={t("an.col.completedJobs")} radius={[4,4,0,0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <Card>
                <CardHeader><CardTitle>{t("an.charts.techRatings")}</CardTitle></CardHeader>
                <CardContent>
                  <div className="space-y-3 mt-2">
                    {a.technicianStats.topPerformers.slice(0, 8).map((tech, i) => (
                      <div key={tech.id} className="flex items-center gap-3">
                        <span className="text-sm text-gray-400 w-5">{i + 1}</span>
                        <div className="flex-1">
                          <div className="flex justify-between text-sm mb-1">
                            <span>{tech.name}</span>
                            <span className="font-medium">{tech.rating.toFixed(1)} ⭐</span>
                          </div>
                          <div className="w-full bg-gray-200 rounded-full h-2">
                            <div className="bg-yellow-400 h-2 rounded-full" style={{ width: `${(tech.rating / 5) * 100}%` }} />
                          </div>
                        </div>
                      </div>
                    ))}
                    {a.technicianStats.topPerformers.length === 0 && (
                      <p className="text-sm text-gray-400 italic text-center py-4">{t("an.noData")}</p>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Radar-style: jobs completed vs rating */}
            {a.technicianStats.topPerformers.filter(t => t.completedJobs > 0).length > 1 && (
              <Card>
                <CardHeader>
                  <CardTitle>{t("an.charts.jobsVsRating")}</CardTitle>
                  <CardDescription>{t("an.charts.jobsVsRatingDesc")}</CardDescription>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={a.technicianStats.topPerformers.filter(tt => tt.completedJobs > 0).map(tt => ({
                      name: tt.name,
                      [t("an.col.completedJobs")]: tt.completedJobs,
                      [`${t("an.col.rating")} ×20`]: Math.round(tt.rating * 20),
                    }))}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="name" tick={{ fontSize: 10 }} angle={-20} textAnchor="end" height={50} />
                      <YAxis />
                      <Tooltip />
                      <Legend />
                      <Bar dataKey={t("an.col.completedJobs")} fill="#82ca9d" radius={[4,4,0,0]} />
                      <Bar dataKey={`${t("an.col.rating")} ×20`} fill="#fbbf24" radius={[4,4,0,0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </PageGuard>
  );
}
