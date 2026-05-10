export interface WorkOrderStatus {
  value: string;
  label: string;
  color: string;
  textColor: string;
  chartColor: string;
  triggersProposal?: boolean;
}

export const WORK_ORDER_STATUSES: WorkOrderStatus[] = [
  { value: "assigned",           label: "Assigned",             color: "bg-blue-100",    textColor: "text-blue-800",   chartColor: "#3B82F6" },
  { value: "secured",            label: "Secured",              color: "bg-indigo-100",  textColor: "text-indigo-800", chartColor: "#6366F1" },
  { value: "onsite",             label: "Onsite",               color: "bg-green-200",   textColor: "text-green-900",  chartColor: "#16A34A" },
  { value: "needs_proposal",     label: "Needs Proposal",       color: "bg-amber-100",   textColor: "text-amber-900",  chartColor: "#F59E0B", triggersProposal: true },
  { value: "return_trip_needed", label: "Return Trip Needed",   color: "bg-yellow-100",  textColor: "text-yellow-800", chartColor: "#EAB308" },
  { value: "job_done",           label: "Job Done",             color: "bg-emerald-100", textColor: "text-emerald-800",chartColor: "#10B981" },
  { value: "approved_pending",   label: "Approved-Pending",     color: "bg-lime-100",    textColor: "text-lime-800",   chartColor: "#84CC16" },
  { value: "approved_scheduled", label: "Approved-Scheduled",   color: "bg-cyan-100",    textColor: "text-cyan-800",   chartColor: "#06B6D4" },
  { value: "awaiting_approval",  label: "Awaiting Approval",    color: "bg-orange-100",  textColor: "text-orange-800", chartColor: "#F97316" },
  { value: "invoiced",           label: "Invoiced",             color: "bg-violet-100",  textColor: "text-violet-800", chartColor: "#7C3AED" },
  { value: "bill_on_incurred",   label: "Bill On Incurred",     color: "bg-purple-100",  textColor: "text-purple-800", chartColor: "#A855F7" },
  { value: "todays_eta",         label: "Today's ETA",          color: "bg-sky-100",     textColor: "text-sky-800",    chartColor: "#0EA5E9" },
  { value: "in_progress",        label: "In Progress",          color: "bg-blue-100",    textColor: "text-blue-700",   chartColor: "#2563EB" },
  { value: "parts_needed",       label: "Parts Needed",         color: "bg-orange-100",  textColor: "text-orange-900", chartColor: "#EA580C" },
  { value: "parts_ordered",      label: "Parts Ordered",        color: "bg-amber-50",    textColor: "text-amber-700",  chartColor: "#D97706" },
  { value: "cancelled",          label: "Cancelled",            color: "bg-red-100",     textColor: "text-red-800",    chartColor: "#EF4444" },
  { value: "awaiting_advise",    label: "Awaiting Advise",      color: "bg-gray-100",    textColor: "text-gray-700",   chartColor: "#6B7280" },
  { value: "recall",             label: "Recall",               color: "bg-red-200",     textColor: "text-red-900",    chartColor: "#DC2626" },
  { value: "need_revised_quote", label: "Need Revised Quote",   color: "bg-amber-100",   textColor: "text-amber-800",  chartColor: "#B45309" },
  { value: "recall_no_charge",   label: "Recall No Charge",     color: "bg-rose-100",    textColor: "text-rose-800",   chartColor: "#F43F5E" },
  // Legacy/compat values
  { value: "active",             label: "Active",               color: "bg-green-100",   textColor: "text-green-800",  chartColor: "#22C55E" },
  { value: "pending",            label: "Pending",              color: "bg-yellow-100",  textColor: "text-yellow-800", chartColor: "#FFBB28" },
  { value: "completed",          label: "Completed",            color: "bg-teal-100",    textColor: "text-teal-800",   chartColor: "#14B8A6" },
  { value: "on_hold",            label: "On Hold",              color: "bg-gray-100",    textColor: "text-gray-800",   chartColor: "#9CA3AF" },
  { value: "in-progress",        label: "In Progress",          color: "bg-blue-100",    textColor: "text-blue-700",   chartColor: "#2563EB" },
];

export const STATUS_MAP = new Map<string, WorkOrderStatus>(
  WORK_ORDER_STATUSES.map(s => [s.value, s])
);

export function getStatusInfo(value: string): WorkOrderStatus {
  return STATUS_MAP.get(value) ?? {
    value,
    label: value.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()),
    color: "bg-gray-100",
    textColor: "text-gray-700",
    chartColor: "#8884D8",
  };
}

export function getStatusBadgeClass(value: string): string {
  const s = getStatusInfo(value);
  return `${s.color} ${s.textColor} border-0`;
}

export const PRIMARY_STATUSES = WORK_ORDER_STATUSES.filter(
  s => !["active", "pending", "completed", "on_hold", "in-progress"].includes(s.value)
);
