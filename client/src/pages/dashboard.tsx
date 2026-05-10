import {
  Users, UserCheck, Wrench, DollarSign, Receipt, CheckCircle, Clock,
  AlertCircle, CreditCard, Activity, ClipboardList, TrendingUp, CalendarClock,
  MapPin, ArrowRight, Briefcase, BarChart2,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { AdvancedPermissionGuard, PageGuard } from "@/components/rbac/advanced-permission-guard";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";

function timeAgo(dateStr: string) {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = Math.floor((now - then) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function formatDate(dateStr: string) {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

const STATUS_STYLES: Record<string, string> = {
  active:      "bg-blue-100 text-blue-800",
  in_progress: "bg-indigo-100 text-indigo-800",
  pending:     "bg-yellow-100 text-yellow-800",
  completed:   "bg-green-100 text-green-800",
  cancelled:   "bg-gray-100 text-gray-600",
  on_hold:     "bg-orange-100 text-orange-800",
};

function StatusBadge({ status }: { status: string }) {
  return (
    <Badge className={cn("text-xs capitalize border-0", STATUS_STYLES[status] || "bg-gray-100 text-gray-600")}>
      {status?.replace(/_/g, " ")}
    </Badge>
  );
}

// ─── Personal (non-admin) Dashboard ────────────────────────────────────────────
function PersonalDashboard({ user }: { user: any }) {
  const { data: my, isLoading } = useQuery<any>({
    queryKey: ["/api/dashboard/my-stats"],
    refetchInterval: 30000,
  });

  const total = my?.total ?? 0;
  const completed = my?.completed ?? 0;
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;

  const statCards = [
    { label: "Total Assigned", value: my?.total, icon: ClipboardList, color: "text-indigo-600", bg: "bg-indigo-50" },
    { label: "Active", value: my?.active, icon: Briefcase, color: "text-blue-600", bg: "bg-blue-50" },
    { label: "In Progress", value: my?.inProgress, icon: TrendingUp, color: "text-purple-600", bg: "bg-purple-50" },
    { label: "Completed", value: my?.completed, icon: CheckCircle, color: "text-emerald-600", bg: "bg-emerald-50" },
    { label: "Pending", value: my?.pending, icon: Clock, color: "text-yellow-600", bg: "bg-yellow-50" },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl sm:text-3xl font-semibold text-gray-900 dark:text-gray-100">
          Welcome back, {user?.firstName} 👋
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          {new Date().toLocaleDateString(undefined, { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
        </p>
      </div>

      {/* Progress Card */}
      <Card className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950/40 dark:to-indigo-950/40 border-blue-200 dark:border-blue-800">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center text-blue-900 dark:text-blue-200 text-base">
            <BarChart2 className="h-5 w-5 mr-2" />
            My Work Order Completion
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2"><Skeleton className="h-4 w-full" /><Skeleton className="h-3 w-32" /></div>
          ) : (
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-sm text-blue-800 dark:text-blue-300">{completed} of {total} completed</span>
                <span className="text-2xl font-bold text-blue-900 dark:text-blue-100">{pct}%</span>
              </div>
              <Progress value={pct} className="h-3" />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        {statCards.map((card) => {
          const Icon = card.icon;
          return (
            <Card key={card.label} className="hover:shadow-md transition-shadow">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0", card.bg)}>
                    <Icon className={cn("h-5 w-5", card.color)} />
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 font-medium leading-tight">{card.label}</p>
                    {isLoading ? (
                      <Skeleton className="h-6 w-10 mt-1" />
                    ) : (
                      <p className="text-xl font-bold text-gray-900 dark:text-gray-100">{card.value ?? 0}</p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Two-column: Recent + Upcoming */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Recent Work Orders */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <ClipboardList className="h-5 w-5 text-blue-500" />
              My Recent Work Orders
            </CardTitle>
            <CardDescription>Latest work orders assigned to you</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">{[1,2,3,4].map(i => <Skeleton key={i} className="h-14 w-full rounded-lg" />)}</div>
            ) : !my?.recentOrders?.length ? (
              <div className="flex flex-col items-center justify-center py-10 text-gray-400 gap-2">
                <ClipboardList className="h-8 w-8" />
                <p className="text-sm">No work orders assigned yet</p>
              </div>
            ) : (
              <ul className="space-y-2">
                {my.recentOrders.map((wo: any) => (
                  <li key={wo.id} className="flex items-center gap-3 p-3 rounded-lg border bg-gray-50 dark:bg-gray-800/50 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">{wo.workOrderNumber}</span>
                        <StatusBadge status={wo.status} />
                      </div>
                      <div className="flex items-center gap-1 mt-0.5 text-xs text-gray-500">
                        {wo.clientName && <span className="truncate">{wo.clientName}</span>}
                        {wo.city && <><span>·</span><span className="flex items-center gap-0.5"><MapPin className="h-3 w-3" />{wo.city}</span></>}
                      </div>
                    </div>
                    <span className="text-xs text-gray-400 shrink-0">{timeAgo(wo.createdAt)}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Upcoming Work Orders */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <CalendarClock className="h-5 w-5 text-indigo-500" />
              Upcoming Work Orders
            </CardTitle>
            <CardDescription>Your next scheduled assignments</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">{[1,2,3].map(i => <Skeleton key={i} className="h-14 w-full rounded-lg" />)}</div>
            ) : !my?.upcomingOrders?.length ? (
              <div className="flex flex-col items-center justify-center py-10 text-gray-400 gap-2">
                <CalendarClock className="h-8 w-8" />
                <p className="text-sm">No upcoming assignments</p>
              </div>
            ) : (
              <ul className="space-y-2">
                {my.upcomingOrders.map((wo: any) => (
                  <li key={wo.id} className="flex items-center gap-3 p-3 rounded-lg border bg-indigo-50 dark:bg-indigo-950/30 border-indigo-100 dark:border-indigo-800">
                    <div className="w-9 h-9 rounded-lg bg-indigo-100 dark:bg-indigo-900 flex items-center justify-center shrink-0">
                      <CalendarClock className="h-4 w-4 text-indigo-600 dark:text-indigo-300" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">{wo.workOrderNumber}</span>
                        <StatusBadge status={wo.status} />
                      </div>
                      <div className="flex items-center gap-1 mt-0.5 text-xs text-gray-500">
                        {wo.clientName && <span className="truncate">{wo.clientName}</span>}
                        {wo.city && <><span>·</span><MapPin className="h-3 w-3 inline" /><span>{wo.city}</span></>}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-xs font-medium text-indigo-700 dark:text-indigo-300">{formatDate(wo.startDate)}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

      </div>
    </div>
  );
}

// ─── Admin / Manager Dashboard ─────────────────────────────────────────────────
function AdminDashboard({ user }: { user: any }) {
  const { t } = useTranslation();

  const ACTIVITY_CONFIG: Record<string, { color: string; icon: any; label: string }> = {
    work_order: { color: "bg-blue-500",   icon: ClipboardList, label: "Work Orders" },
    user:        { color: "bg-green-500",  icon: Users,         label: "Users" },
    payment:     { color: "bg-orange-500", icon: CreditCard,    label: "Payments" },
    invoice:     { color: "bg-purple-500", icon: Receipt,       label: "Invoices" },
  };

  const { data: stats, isLoading: statsLoading } = useQuery<any>({
    queryKey: ["/api/dashboard/stats"],
    refetchInterval: 30000,
  });

  const { data: activities = [], isLoading: activityLoading } = useQuery<any[]>({
    queryKey: ["/api/dashboard/activity"],
    refetchInterval: 30000,
  });

  const { data: my, isLoading: myLoading } = useQuery<any>({
    queryKey: ["/api/dashboard/my-stats"],
    refetchInterval: 30000,
  });

  const total = stats?.workOrdersCount ?? 1;
  const completed = stats?.workOrdersCompleted ?? 0;
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;

  const statCards = [
    { label: t("dashboard.totalUsers"),       value: stats?.totalUsers,          icon: Users,         color: "text-blue-600",   bg: "bg-blue-50",   permission: "users.view" },
    { label: t("dashboard.technicians"),       value: stats?.techniciansCount,    icon: Wrench,        color: "text-orange-600", bg: "bg-orange-50", permission: null },
    { label: t("dashboard.activeRoles"),       value: stats?.activeRoles,         icon: UserCheck,     color: "text-green-600",  bg: "bg-green-50",  permission: null },
    { label: t("dashboard.totalWorkOrders"),   value: stats?.workOrdersCount,     icon: ClipboardList, color: "text-indigo-600", bg: "bg-indigo-50", permission: null },
    { label: t("dashboard.completedOrders"),   value: stats?.workOrdersCompleted, icon: CheckCircle,   color: "text-emerald-600",bg: "bg-emerald-50",permission: null },
    { label: t("dashboard.pendingOrders"),     value: stats?.workOrdersPending,   icon: Clock,         color: "text-yellow-600", bg: "bg-yellow-50", permission: null },
    { label: t("dashboard.pendingPayments"),   value: stats?.pendingPayments,     icon: CreditCard,    color: "text-red-600",    bg: "bg-red-50",    permission: "payments.list.view" },
    { label: t("dashboard.pendingInvoices"),   value: stats?.pendingInvoices,     icon: Receipt,       color: "text-purple-600", bg: "bg-purple-50", permission: "payments.list.view" },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl sm:text-3xl font-semibold text-gray-900 dark:text-gray-100">
          {t("dashboard.welcomeBack", { name: user?.firstName })}
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          {new Date().toLocaleDateString(undefined, { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
        </p>
      </div>

      {/* Global Progress */}
      <Card className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950/40 dark:to-indigo-950/40 border-blue-200 dark:border-blue-800">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center text-blue-900 dark:text-blue-200 text-base">
            <TrendingUp className="h-5 w-5 mr-2" />
            {t("dashboard.workOrderCompletion")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {statsLoading ? (
            <div className="space-y-2"><Skeleton className="h-4 w-full" /><Skeleton className="h-3 w-32" /></div>
          ) : (
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-sm text-blue-800 dark:text-blue-300">{completed} {t("dashboard.of")} {total}</span>
                <span className="text-2xl font-bold text-blue-900 dark:text-blue-100">{pct}%</span>
              </div>
              <Progress value={pct} className="h-3" />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Global Stat Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
        {statCards.map((card) => {
          const Icon = card.icon;
          const inner = (
            <Card key={card.label} className="hover:shadow-md transition-shadow">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0", card.bg)}>
                    <Icon className={cn("h-5 w-5", card.color)} />
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 font-medium">{card.label}</p>
                    {statsLoading ? (
                      <Skeleton className="h-6 w-10 mt-1" />
                    ) : (
                      <p className="text-xl font-bold text-gray-900 dark:text-gray-100">{card.value ?? 0}</p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          );
          return card.permission ? (
            <AdvancedPermissionGuard key={card.label} permission={card.permission}>{inner}</AdvancedPermissionGuard>
          ) : inner;
        })}
      </div>

      {/* My Work + Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* My Assigned Work Orders */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Briefcase className="h-5 w-5 text-blue-500" />
              My Work Orders
            </CardTitle>
            <CardDescription>Your personal assignments</CardDescription>
          </CardHeader>
          <CardContent>
            {myLoading ? (
              <div className="space-y-2">{[1,2,3].map(i=><Skeleton key={i} className="h-12 w-full rounded-lg"/>)}</div>
            ) : !my?.recentOrders?.length ? (
              <div className="flex flex-col items-center justify-center py-8 text-gray-400 gap-2">
                <ClipboardList className="h-7 w-7" />
                <p className="text-sm">No assigned work orders</p>
              </div>
            ) : (
              <ul className="space-y-2">
                {my.recentOrders.slice(0, 5).map((wo: any) => (
                  <li key={wo.id} className="flex items-center gap-2 p-2.5 rounded-lg border bg-gray-50 dark:bg-gray-800/50">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold truncate">{wo.workOrderNumber}</span>
                        <StatusBadge status={wo.status} />
                      </div>
                      {wo.clientName && <p className="text-xs text-gray-400 truncate mt-0.5">{wo.clientName}</p>}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Needs Attention + Activity Feed */}
        <div className="lg:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-6">

          {/* Needs Attention */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <AlertCircle className="h-5 w-5 text-red-500" />
                {t("dashboard.pendingOrders")}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {statsLoading ? (
                [1,2,3].map(i => <Skeleton key={i} className="h-10 w-full" />)
              ) : (
                <>
                  {(stats?.pendingPayments ?? 0) > 0 && (
                    <div className="flex items-center justify-between p-3 bg-orange-50 border border-orange-200 rounded-lg">
                      <div className="flex items-center gap-2">
                        <CreditCard className="h-4 w-4 text-orange-600" />
                        <span className="text-sm font-medium text-orange-800">{t("dashboard.pendingPayments")}</span>
                      </div>
                      <Badge className="bg-orange-100 text-orange-800 border-0">{stats.pendingPayments}</Badge>
                    </div>
                  )}
                  {(stats?.pendingInvoices ?? 0) > 0 && (
                    <div className="flex items-center justify-between p-3 bg-purple-50 border border-purple-200 rounded-lg">
                      <div className="flex items-center gap-2">
                        <Receipt className="h-4 w-4 text-purple-600" />
                        <span className="text-sm font-medium text-purple-800">{t("dashboard.pendingInvoices")}</span>
                      </div>
                      <Badge className="bg-purple-100 text-purple-800 border-0">{stats.pendingInvoices}</Badge>
                    </div>
                  )}
                  {(stats?.workOrdersPending ?? 0) > 0 && (
                    <div className="flex items-center justify-between p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                      <div className="flex items-center gap-2">
                        <Clock className="h-4 w-4 text-yellow-600" />
                        <span className="text-sm font-medium text-yellow-800">{t("dashboard.pendingOrders")}</span>
                      </div>
                      <Badge className="bg-yellow-100 text-yellow-800 border-0">{stats.workOrdersPending}</Badge>
                    </div>
                  )}
                  {(stats?.pendingPayments ?? 0) === 0 && (stats?.pendingInvoices ?? 0) === 0 && (stats?.workOrdersPending ?? 0) === 0 && (
                    <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-lg">
                      <CheckCircle className="h-4 w-4 text-green-600" />
                      <span className="text-sm font-medium text-green-800">{t("dashboard.noActivity")}</span>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>

          {/* Activity Feed */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Activity className="h-5 w-5 text-blue-500" />
                {t("dashboard.recentActivity")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {activityLoading ? (
                <div className="space-y-3">
                  {[1,2,3,4].map(i => (
                    <div key={i} className="flex items-center gap-3">
                      <Skeleton className="w-7 h-7 rounded-full flex-shrink-0" />
                      <div className="flex-1 space-y-1">
                        <Skeleton className="h-3 w-full" />
                        <Skeleton className="h-3 w-20" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : activities.length === 0 ? (
                <p className="text-gray-400 text-sm text-center py-4">{t("dashboard.noActivity")}</p>
              ) : (
                <ul className="space-y-3 max-h-64 overflow-y-auto pr-1">
                  {activities.slice(0, 10).map((event: any) => {
                    const cfg = ACTIVITY_CONFIG[event.type] || { color: "bg-gray-400", icon: Activity, label: "Event" };
                    const Icon = cfg.icon;
                    return (
                      <li key={event.id} className="flex items-start gap-3">
                        <div className={cn("w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5", cfg.color)}>
                          <Icon className="h-3.5 w-3.5 text-white" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs text-gray-700 dark:text-gray-300 leading-snug">{event.description}</p>
                          <p className="text-xs text-gray-400 mt-0.5">{timeAgo(event.time)}</p>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>

        </div>
      </div>
    </div>
  );
}

// ─── Root Dashboard — picks the right view ─────────────────────────────────────
export default function Dashboard() {
  const { user, role } = useAuth();

  const isAdminOrManager = role?.name === "admin" || role?.name === "manager";

  return (
    <PageGuard pageName="dashboard">
      {isAdminOrManager
        ? <AdminDashboard user={user} />
        : <PersonalDashboard user={user} />
      }
    </PageGuard>
  );
}
