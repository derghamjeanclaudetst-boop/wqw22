import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Search, Package, CheckCircle, XCircle, Clock, Filter,
  ShoppingCart, Inbox, AlertTriangle, ChevronRight, Eye,
  DollarSign, Receipt, BarChart3
} from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { PageGuard, AdvancedPermissionGuard } from "@/components/rbac/advanced-permission-guard";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import type { WorkOrderPartsRequest } from "@shared/schema";

interface PartsRequestWithDetails extends WorkOrderPartsRequest {
  workOrder: {
    workOrderNumber: string;
    clientName: string;
    street: string;
    city: string;
  };
  requestedByUser: {
    firstName: string;
    lastName: string;
    email: string;
  };
}

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: any }> = {
  pending:  { label: "⏳ Pending",   color: "bg-yellow-100 text-yellow-800 border-yellow-300", icon: Clock },
  approved: { label: "✓ Approved",   color: "bg-blue-100 text-blue-800 border-blue-300",       icon: CheckCircle },
  rejected: { label: "✗ Rejected",   color: "bg-red-100 text-red-800 border-red-300",           icon: XCircle },
  ordered:  { label: "📦 Ordered",   color: "bg-purple-100 text-purple-800 border-purple-300",  icon: ShoppingCart },
  received: { label: "✓ Received",   color: "bg-green-100 text-green-800 border-green-300",     icon: Inbox },
  cancelled:{ label: "✗ Cancelled",  color: "bg-gray-100 text-gray-700 border-gray-300",        icon: XCircle },
};

const URGENCY_CONFIG: Record<string, string> = {
  urgent: "bg-red-100 text-red-800",
  high:   "bg-orange-100 text-orange-800",
  normal: "bg-blue-100 text-blue-800",
  low:    "bg-gray-100 text-gray-700",
};

// Status progression steps for the pipeline indicator
const STATUS_STEPS = ["pending", "approved", "ordered", "received"];

export default function PartsRequests() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [urgencyFilter, setUrgencyFilter] = useState("all");

  const [selectedRequest, setSelectedRequest] = useState<PartsRequestWithDetails | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [isRejectOpen, setIsRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");

  const { data: allRequests = [], isLoading } = useQuery<PartsRequestWithDetails[]>({
    queryKey: ["/api/parts-requests"],
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["/api/parts-requests"] });

  const approveMutation = useMutation({
    mutationFn: (id: number) => apiRequest("POST", `/api/parts-requests/${id}/approve`, {}),
    onSuccess: () => { toast({ title: "Parts Request Approved" }); invalidate(); setIsDetailOpen(false); },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const rejectMutation = useMutation({
    mutationFn: ({ id, reason }: { id: number; reason: string }) =>
      apiRequest("POST", `/api/parts-requests/${id}/reject`, { reason }),
    onSuccess: () => {
      toast({ title: "Parts Request Rejected", description: "Requester has been notified." });
      invalidate();
      setIsRejectOpen(false);
      setIsDetailOpen(false);
      setRejectReason("");
      setSelectedRequest(null);
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const orderMutation = useMutation({
    mutationFn: (id: number) => apiRequest("POST", `/api/parts-requests/${id}/order`, {}),
    onSuccess: () => { toast({ title: "Marked as Ordered" }); invalidate(); setIsDetailOpen(false); },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const receiveMutation = useMutation({
    mutationFn: (id: number) => apiRequest("POST", `/api/parts-requests/${id}/receive`, {}),
    onSuccess: () => { toast({ title: "Marked as Received" }); invalidate(); setIsDetailOpen(false); },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const getStatusBadge = (status: string) => {
    const cfg = STATUS_CONFIG[status] || { label: status, color: "bg-gray-100 text-gray-700 border-gray-200", icon: Clock };
    return <Badge className={`border ${cfg.color} text-xs`}>{cfg.label}</Badge>;
  };

  const formatCurrency = (val: string | number | null) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(parseFloat(String(val || "0")) || 0);

  const filteredRequests = allRequests.filter(r => {
    const search = searchTerm.toLowerCase();
    const matchesSearch = !searchTerm ||
      r.workOrder.workOrderNumber.toLowerCase().includes(search) ||
      r.workOrder.clientName.toLowerCase().includes(search) ||
      r.partName.toLowerCase().includes(search) ||
      `${r.requestedByUser.firstName} ${r.requestedByUser.lastName}`.toLowerCase().includes(search);
    const matchesStatus = statusFilter === "all" || r.status === statusFilter;
    const matchesUrgency = urgencyFilter === "all" || r.urgency === urgencyFilter;
    return matchesSearch && matchesStatus && matchesUrgency;
  });

  const stats = {
    total: allRequests.length,
    pending: allRequests.filter(r => r.status === "pending").length,
    approved: allRequests.filter(r => r.status === "approved").length,
    ordered: allRequests.filter(r => r.status === "ordered").length,
    received: allRequests.filter(r => r.status === "received").length,
    rejected: allRequests.filter(r => r.status === "rejected").length,
  };

  // Build work order cost summary — approved/ordered/received parts grouped by WO
  const woCostSummary = Object.values(
    allRequests.reduce((acc, r) => {
      const key = r.workOrder.workOrderNumber;
      if (!acc[key]) {
        acc[key] = {
          workOrderNumber: r.workOrder.workOrderNumber,
          clientName: r.workOrder.clientName,
          parts: [] as typeof allRequests,
        };
      }
      acc[key].parts.push(r);
      return acc;
    }, {} as Record<string, { workOrderNumber: string; clientName: string; parts: typeof allRequests }>)
  ).map(wo => {
    const approved = wo.parts.filter(r => ["approved", "ordered", "received"].includes(r.status));
    const pending  = wo.parts.filter(r => r.status === "pending").length;
    const total    = approved.reduce((s, r) => s + parseFloat(r.estimatedCost || "0") * (r.quantity || 1), 0);
    return { ...wo, approvedCount: approved.length, pendingCount: pending, approvedTotal: total };
  }).filter(wo => wo.approvedTotal > 0 || wo.pendingCount > 0);

  const openDetail = (r: PartsRequestWithDetails) => { setSelectedRequest(r); setIsDetailOpen(true); };
  const openReject = (r: PartsRequestWithDetails) => { setSelectedRequest(r); setRejectReason(""); setIsRejectOpen(true); };
  const { t } = useTranslation();

  return (
    <PageGuard pageName="parts">
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold">{t("partsRequests.title")}</h1>
          <p className="text-gray-600">Review and manage parts requests for your assigned work orders</p>
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {[
            { label: "Total",    value: stats.total,    color: "text-gray-700",   bg: "bg-gray-50" },
            { label: "Pending",  value: stats.pending,  color: "text-yellow-700", bg: "bg-yellow-50" },
            { label: "Approved", value: stats.approved, color: "text-blue-700",   bg: "bg-blue-50" },
            { label: "Ordered",  value: stats.ordered,  color: "text-purple-700", bg: "bg-purple-50" },
            { label: "Received", value: stats.received, color: "text-green-700",  bg: "bg-green-50" },
            { label: "Rejected", value: stats.rejected, color: "text-red-700",    bg: "bg-red-50" },
          ].map(s => (
            <Card key={s.label} className={`${s.bg} border-0`}>
              <CardContent className="p-4 text-center">
                <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
                <p className="text-xs text-gray-500 mt-1">{s.label}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Work Order Approved Parts Cost Summary */}
        {woCostSummary.length > 0 && (
          <Card className="border-blue-200 bg-blue-50/50">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2 text-blue-800">
                <BarChart3 className="h-5 w-5" />
                Approved Parts Cost by Work Order
                <span className="text-sm font-normal text-blue-600 ml-1">
                  (automatically included in invoice when requested)
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {woCostSummary.map(wo => (
                  <div key={wo.workOrderNumber}
                    className="bg-white rounded-lg border border-blue-200 p-4 space-y-2">
                    <div>
                      <p className="font-bold text-gray-900 text-sm">{wo.workOrderNumber}</p>
                      <p className="text-xs text-gray-500">{wo.clientName}</p>
                    </div>
                    <div className="flex items-center justify-between pt-1 border-t border-gray-100">
                      <div className="text-center">
                        <p className="text-lg font-bold text-green-700">
                          {formatCurrency(wo.approvedTotal)}
                        </p>
                        <p className="text-xs text-gray-500">Approved Total</p>
                      </div>
                      <div className="flex gap-3 text-center">
                        <div>
                          <p className="font-semibold text-blue-700">{wo.approvedCount}</p>
                          <p className="text-xs text-gray-500">Approved</p>
                        </div>
                        {wo.pendingCount > 0 && (
                          <div>
                            <p className="font-semibold text-yellow-600">{wo.pendingCount}</p>
                            <p className="text-xs text-gray-500">Pending</p>
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 text-xs text-blue-600 bg-blue-50 rounded px-2 py-1">
                      <Receipt className="h-3 w-3" />
                      Will appear in invoice as Materials cost
                    </div>
                  </div>
                ))}
              </div>
              {/* Grand total across all WOs */}
              <div className="mt-3 pt-3 border-t border-blue-200 flex justify-between items-center">
                <span className="text-sm font-medium text-blue-800">Total Approved Parts (all work orders)</span>
                <span className="text-lg font-bold text-green-700">
                  {formatCurrency(woCostSummary.reduce((s, wo) => s + wo.approvedTotal, 0))}
                </span>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <Input
              placeholder="Search by work order, client, part name, or requester..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full sm:w-44">
              <Filter className="h-4 w-4 mr-2" />
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="approved">Approved</SelectItem>
              <SelectItem value="rejected">Rejected</SelectItem>
              <SelectItem value="ordered">Ordered</SelectItem>
              <SelectItem value="received">Received</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
            </SelectContent>
          </Select>
          <Select value={urgencyFilter} onValueChange={setUrgencyFilter}>
            <SelectTrigger className="w-full sm:w-44">
              <SelectValue placeholder="Urgency" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Urgency</SelectItem>
              <SelectItem value="urgent">Urgent</SelectItem>
              <SelectItem value="high">High</SelectItem>
              <SelectItem value="normal">Normal</SelectItem>
              <SelectItem value="low">Low</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* List */}
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
          </div>
        ) : filteredRequests.length === 0 ? (
          <Card>
            <CardContent className="text-center py-12">
              <Package className="h-12 w-12 mx-auto mb-4 text-gray-300" />
              <p className="font-medium text-gray-600">No parts requests found</p>
              <p className="text-sm text-gray-500 mt-1">
                {searchTerm || statusFilter !== "all" || urgencyFilter !== "all"
                  ? "Try adjusting your filters."
                  : "Parts requests for your assigned work orders will appear here."}
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {filteredRequests.map((request) => {
              const total = (parseFloat(request.estimatedCost || "0")) * (request.quantity || 1);
              const stepIdx = STATUS_STEPS.indexOf(request.status);
              const pct = stepIdx < 0 ? 0 : Math.round(((stepIdx + 1) / STATUS_STEPS.length) * 100);

              return (
                <Card key={request.id} className={`border-2 transition-shadow hover:shadow-md ${
                  request.status === "pending"  ? "border-yellow-300" :
                  request.status === "approved" ? "border-blue-300" :
                  request.status === "ordered"  ? "border-purple-300" :
                  request.status === "received" ? "border-green-300" :
                  request.status === "rejected" ? "border-red-200" : "border-gray-200"
                }`}>
                  <CardContent className="p-5">
                    <div className="flex items-start gap-4">
                      {/* Icon */}
                      <div className="w-10 h-10 rounded-full bg-orange-100 flex items-center justify-center flex-shrink-0">
                        <Package className="h-5 w-5 text-orange-600" />
                      </div>

                      {/* Details */}
                      <div className="flex-1 min-w-0 space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-bold text-gray-900">{request.partName}</span>
                          {request.partNumber && (
                            <span className="text-xs text-gray-500">Store: {request.partNumber}</span>
                          )}
                          {getStatusBadge(request.status)}
                          {request.urgency && (
                            <Badge variant="outline" className={`text-xs ${URGENCY_CONFIG[request.urgency] || ""}`}>
                              {request.urgency}
                            </Badge>
                          )}
                        </div>

                        <div className="flex flex-wrap gap-4 text-sm text-gray-600">
                          <span className="font-medium text-gray-800">{request.workOrder.workOrderNumber}</span>
                          <span>{request.workOrder.clientName}</span>
                          <span>{request.workOrder.street}, {request.workOrder.city}</span>
                        </div>

                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                          <div>
                            <p className="text-xs text-gray-500">Qty</p>
                            <p className="font-semibold">{request.quantity}</p>
                          </div>
                          <div>
                            <p className="text-xs text-gray-500">Unit Cost</p>
                            <p className="font-semibold">{formatCurrency(request.estimatedCost)}</p>
                          </div>
                          <div>
                            <p className="text-xs text-gray-500">Total</p>
                            <p className="font-semibold text-green-700">{formatCurrency(total)}</p>
                          </div>
                          <div>
                            <p className="text-xs text-gray-500">Requested By</p>
                            <p className="font-semibold">{request.requestedByUser.firstName} {request.requestedByUser.lastName}</p>
                          </div>
                        </div>

                        {/* Status pipeline */}
                        {stepIdx >= 0 && (
                          <div className="space-y-1">
                            <div className="flex justify-between text-xs text-gray-400">
                              {STATUS_STEPS.map((s, i) => (
                                <span key={s} className={i <= stepIdx ? "text-blue-600 font-medium" : ""}>{s}</span>
                              ))}
                            </div>
                            <Progress value={pct} className="h-1.5" />
                          </div>
                        )}

                        {/* Rejection reason */}
                        {request.status === "rejected" && request.rejectionReason && (
                          <p className="text-sm text-red-700 bg-red-50 rounded px-3 py-1.5 border border-red-200">
                            Rejected: {request.rejectionReason}
                          </p>
                        )}

                        {request.supplier && (
                          <p className="text-xs text-gray-500">Store address: {request.supplier}</p>
                        )}

                        <p className="text-xs text-gray-400">
                          Submitted {new Date(request.createdAt).toLocaleDateString()}
                          {request.approvedAt && ` · Approved ${new Date(request.approvedAt).toLocaleDateString()}`}
                        </p>
                      </div>

                      {/* Actions */}
                      <div className="flex flex-col gap-2 flex-shrink-0">
                        <Button variant="outline" size="sm" onClick={() => openDetail(request)}>
                          <Eye className="h-3 w-3 mr-1" />View
                        </Button>

                        <AdvancedPermissionGuard permission="parts.approve">
                          <>
                            {request.status === "pending" && (
                              <>
                                <Button size="sm" className="bg-green-600 hover:bg-green-700 text-white"
                                  onClick={() => approveMutation.mutate(request.id)}
                                  disabled={approveMutation.isPending}>
                                  <CheckCircle className="h-3 w-3 mr-1" />Approve
                                </Button>
                                <Button size="sm" variant="destructive" onClick={() => openReject(request)}>
                                  <XCircle className="h-3 w-3 mr-1" />Reject
                                </Button>
                              </>
                            )}
                            {request.status === "approved" && (
                              <>
                                <Button size="sm" className="bg-purple-600 hover:bg-purple-700 text-white"
                                  onClick={() => orderMutation.mutate(request.id)}
                                  disabled={orderMutation.isPending}>
                                  <ShoppingCart className="h-3 w-3 mr-1" />Mark Ordered
                                </Button>
                                <Button size="sm" variant="outline" className="border-red-300 text-red-600"
                                  onClick={() => openReject(request)}>
                                  <XCircle className="h-3 w-3 mr-1" />Reject
                                </Button>
                              </>
                            )}
                            {request.status === "ordered" && (
                              <Button size="sm" className="bg-green-600 hover:bg-green-700 text-white"
                                onClick={() => receiveMutation.mutate(request.id)}
                                disabled={receiveMutation.isPending}>
                                <Inbox className="h-3 w-3 mr-1" />Mark Received
                              </Button>
                            )}
                          </>
                        </AdvancedPermissionGuard>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {/* ── Detail Modal ── */}
        <Dialog open={isDetailOpen} onOpenChange={setIsDetailOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Parts Request Details</DialogTitle>
            </DialogHeader>
            {selectedRequest && (
              <div className="space-y-4">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="font-bold text-lg">{selectedRequest.partName}</p>
                    {selectedRequest.partNumber && (
                      <p className="text-sm text-gray-500">Store: {selectedRequest.partNumber}</p>
                    )}
                    <p className="text-gray-600 text-sm">
                      {selectedRequest.workOrder.workOrderNumber} · {selectedRequest.workOrder.clientName}
                    </p>
                  </div>
                  {getStatusBadge(selectedRequest.status)}
                </div>

                <div className="bg-gray-50 rounded-lg border p-4 grid grid-cols-2 gap-3 text-sm">
                  <div><p className="text-xs text-gray-500">Quantity</p><p className="font-semibold">{selectedRequest.quantity}</p></div>
                  <div><p className="text-xs text-gray-500">Unit Cost</p><p className="font-semibold">{formatCurrency(selectedRequest.estimatedCost)}</p></div>
                  <div><p className="text-xs text-gray-500">Total Cost</p><p className="font-semibold text-green-700">{formatCurrency((parseFloat(selectedRequest.estimatedCost || "0")) * (selectedRequest.quantity || 1))}</p></div>
                  <div><p className="text-xs text-gray-500">Urgency</p><p className="font-semibold capitalize">{selectedRequest.urgency}</p></div>
                  {selectedRequest.supplier && <div className="col-span-2"><p className="text-xs text-gray-500">Store Address</p><p className="font-semibold">{selectedRequest.supplier}</p></div>}
                </div>

                <div className="text-sm space-y-1">
                  <p><span className="text-gray-500">Requested by:</span> {selectedRequest.requestedByUser.firstName} {selectedRequest.requestedByUser.lastName}</p>
                  <p><span className="text-gray-500">Date:</span> {new Date(selectedRequest.createdAt).toLocaleDateString()}</p>
                  {selectedRequest.approvedAt && <p><span className="text-gray-500">Approved:</span> {new Date(selectedRequest.approvedAt).toLocaleDateString()}</p>}
                </div>

                {selectedRequest.notes && (
                  <div><p className="text-sm font-medium text-gray-600 mb-1">Notes</p>
                    <p className="text-sm bg-blue-50 p-3 rounded border border-blue-200">{selectedRequest.notes}</p></div>
                )}

                {selectedRequest.status === "rejected" && selectedRequest.rejectionReason && (
                  <div className="bg-red-50 border border-red-200 rounded p-3">
                    <p className="text-sm font-medium text-red-800">Rejection Reason</p>
                    <p className="text-sm text-red-700 mt-1">{selectedRequest.rejectionReason}</p>
                  </div>
                )}

                <AdvancedPermissionGuard permission="parts.approve">
                  <div className="flex flex-wrap gap-2 pt-2 border-t">
                    {selectedRequest.status === "pending" && (
                      <>
                        <Button className="flex-1 bg-green-600 hover:bg-green-700"
                          onClick={() => approveMutation.mutate(selectedRequest.id)}
                          disabled={approveMutation.isPending}>
                          <CheckCircle className="h-4 w-4 mr-2" />
                          {approveMutation.isPending ? "Approving..." : "Approve"}
                        </Button>
                        <Button variant="destructive" className="flex-1"
                          onClick={() => { setIsDetailOpen(false); openReject(selectedRequest); }}>
                          <XCircle className="h-4 w-4 mr-2" />Reject
                        </Button>
                      </>
                    )}
                    {selectedRequest.status === "approved" && (
                      <>
                        <Button className="flex-1 bg-purple-600 hover:bg-purple-700"
                          onClick={() => orderMutation.mutate(selectedRequest.id)}
                          disabled={orderMutation.isPending}>
                          <ShoppingCart className="h-4 w-4 mr-2" />Mark as Ordered
                        </Button>
                        <Button variant="outline" className="border-red-300 text-red-600"
                          onClick={() => { setIsDetailOpen(false); openReject(selectedRequest); }}>
                          <XCircle className="h-4 w-4 mr-2" />Reject
                        </Button>
                      </>
                    )}
                    {selectedRequest.status === "ordered" && (
                      <Button className="w-full bg-green-600 hover:bg-green-700"
                        onClick={() => receiveMutation.mutate(selectedRequest.id)}
                        disabled={receiveMutation.isPending}>
                        <Inbox className="h-4 w-4 mr-2" />Mark as Received
                      </Button>
                    )}
                  </div>
                </AdvancedPermissionGuard>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* ── Reject Modal ── */}
        <Dialog open={isRejectOpen} onOpenChange={setIsRejectOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle>Reject Parts Request</DialogTitle></DialogHeader>
            <div className="space-y-4">
              {selectedRequest && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm">
                  <p className="font-semibold text-red-800">{selectedRequest.partName}</p>
                  <p className="text-red-700">{selectedRequest.workOrder.workOrderNumber} · Qty {selectedRequest.quantity}</p>
                </div>
              )}
              <p className="text-sm text-gray-600">
                Provide a reason. The requester will be notified and can re-submit a corrected request.
              </p>
              <div className="space-y-2">
                <Label>Rejection Reason</Label>
                <Textarea
                  placeholder="Explain why this parts request is being rejected..."
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  rows={3}
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => { setIsRejectOpen(false); setRejectReason(""); }}>Cancel</Button>
                <Button variant="destructive"
                  onClick={() => selectedRequest && rejectMutation.mutate({ id: selectedRequest.id, reason: rejectReason })}
                  disabled={rejectMutation.isPending || !rejectReason.trim()}>
                  <XCircle className="h-4 w-4 mr-2" />
                  {rejectMutation.isPending ? "Rejecting..." : "Reject Request"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </PageGuard>
  );
}
