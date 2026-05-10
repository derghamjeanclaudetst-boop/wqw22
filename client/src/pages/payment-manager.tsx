import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  DollarSign, History, CheckCircle2, XCircle, Clock, AlertCircle,
  Receipt, Eye, CreditCard, Banknote, User, AlertTriangle, Download
} from "lucide-react";
import { exportToCSV } from "@/lib/export";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { AdvancedPermissionGuard, PageGuard } from "@/components/rbac/advanced-permission-guard";

interface PaymentRequest {
  id: number;
  workOrderId: number;
  workOrderNumber: string;
  clientName: string;
  technicianId: number;
  technicianName: string;
  technicianPaymentMethods: string;
  technicianW9Status: string | null;
  paymentMethod: string;
  amountRequested: string;
  amountApproved: string;
  amountPaid: string;
  status: string;
  description: string;
  priority: string;
  rejectionReason?: string;
  requestedAt: string;
  approvedAt?: string;
  paidAt?: string;
}

interface InvoiceRequest {
  id: number;
  workOrderId: number;
  workOrderNumber: string;
  clientName: string;
  invoiceNumber: string;
  laborCost: string;
  materialCost: string;
  subtotal: string;
  taxRate: string;
  taxAmount: string;
  totalAmount: string;
  status: string;
  notes: string;
  rejectionReason?: string;
  createdAt: string;
  isLocked: boolean;
  workOrderStatus?: string;
}

export default function PaymentManager() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("payments");

  // Payment state
  const [selectedPayment, setSelectedPayment] = useState<PaymentRequest | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [isApproveOpen, setIsApproveOpen] = useState(false);
  const [isRejectPayOpen, setIsRejectPayOpen] = useState(false);
  const [isPayOpen, setIsPayOpen] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [selectedTechId, setSelectedTechId] = useState<number | null>(null);

  // Approve form
  const [approveAmount, setApproveAmount] = useState("");
  // Reject form
  const [rejectReason, setRejectReason] = useState("");
  // Pay form
  const [payAmount, setPayAmount] = useState("");
  const [payType, setPayType] = useState<"full" | "partial">("full");

  // Invoice state
  const [selectedInvoice, setSelectedInvoice] = useState<InvoiceRequest | null>(null);
  const [isInvoiceDetailOpen, setIsInvoiceDetailOpen] = useState(false);
  const [isInvoiceRejectOpen, setIsInvoiceRejectOpen] = useState(false);
  const [invoiceRejectReason, setInvoiceRejectReason] = useState("");

  // Queries
  const { data: payments = [], isLoading } = useQuery<PaymentRequest[]>({
    queryKey: ["/api/payments/all"],
  });

  const { data: invoiceRequests = [], isLoading: isLoadingInvoices } = useQuery<InvoiceRequest[]>({
    queryKey: ["/api/invoices/all"],
  });

  const { data: technicianHistory = [] } = useQuery<PaymentRequest[]>({
    queryKey: [`/api/payments/technician/${selectedTechId}`],
    enabled: !!selectedTechId,
  });

  const pendingPayments = payments.filter(p => p.status === "pending");
  const pendingInvoices = invoiceRequests.filter(i => i.status === "pending_approval");

  // ── Payment mutations ──
  const approveMutation = useMutation({
    mutationFn: ({ id, amount }: { id: number; amount: string }) =>
      apiRequest("POST", `/api/payments/${id}/approve`, { amountApproved: amount }),
    onSuccess: () => {
      toast({ title: "Payment Approved" });
      queryClient.invalidateQueries({ queryKey: ["/api/payments/all"] });
      setIsApproveOpen(false);
      setApproveAmount("");
      setSelectedPayment(null);
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message || "Failed to approve", variant: "destructive" });
    },
  });

  const rejectPayMutation = useMutation({
    mutationFn: ({ id, reason }: { id: number; reason: string }) =>
      apiRequest("POST", `/api/payments/${id}/reject`, { reason }),
    onSuccess: () => {
      toast({ title: "Payment Rejected", description: "Requester has been notified." });
      queryClient.invalidateQueries({ queryKey: ["/api/payments/all"] });
      setIsRejectPayOpen(false);
      setRejectReason("");
      setSelectedPayment(null);
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message || "Failed to reject", variant: "destructive" });
    },
  });

  const payMutation = useMutation({
    mutationFn: ({ id, amount }: { id: number; amount: string }) =>
      apiRequest("POST", `/api/payments/${id}/pay`, { amountPaid: amount }),
    onSuccess: (data: any) => {
      const remaining = parseFloat(data?.remaining || "0");
      toast({
        title: remaining <= 0 ? "Payment Complete" : "Partial Payment Recorded",
        description: remaining <= 0
          ? "Technician has been fully paid."
          : `${formatCurrency(remaining)} remaining.`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/payments/all"] });
      if (selectedTechId) queryClient.invalidateQueries({ queryKey: [`/api/payments/technician/${selectedTechId}`] });
      setIsPayOpen(false);
      setPayAmount("");
      setSelectedPayment(null);
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message || "Failed to record payment", variant: "destructive" });
    },
  });

  // ── Invoice mutations ──
  const approveInvoiceMutation = useMutation({
    mutationFn: (id: number) => apiRequest("POST", `/api/invoices/${id}/approve`, {}),
    onSuccess: () => {
      toast({ title: "Invoice Approved", description: "The invoice is approved. The work order will be locked once the invoice is paid." });
      queryClient.invalidateQueries({ queryKey: ["/api/invoices/all"] });
      queryClient.invalidateQueries({ queryKey: ["/api/work-orders"] });
      setIsInvoiceDetailOpen(false);
    },
    onError: (err: any) => toast({ title: "Cannot Approve Invoice", description: err.message, variant: "destructive" }),
  });

  const rejectInvoiceMutation = useMutation({
    mutationFn: ({ id, reason }: { id: number; reason: string }) =>
      apiRequest("POST", `/api/invoices/${id}/reject`, { reason }),
    onSuccess: () => {
      toast({ title: "Invoice Rejected", description: "Requester has been notified." });
      queryClient.invalidateQueries({ queryKey: ["/api/invoices/all"] });
      setIsInvoiceRejectOpen(false);
      setIsInvoiceDetailOpen(false);
      setInvoiceRejectReason("");
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  // ── Helpers ──
  const formatCurrency = (val: string | number) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(parseFloat(String(val || "0")) || 0);

  const getStatusBadge = (status: string) => {
    const map: Record<string, { label: string; class: string }> = {
      pending:        { label: "⏳ Pending",        class: "bg-yellow-100 text-yellow-800 border-yellow-300" },
      approved:       { label: "✓ Approved",         class: "bg-blue-100 text-blue-800 border-blue-300" },
      partially_paid: { label: "◑ Partially Paid",   class: "bg-orange-100 text-orange-800 border-orange-300" },
      paid:           { label: "✓ Paid",              class: "bg-green-100 text-green-800 border-green-300" },
      rejected:       { label: "✗ Rejected",          class: "bg-red-100 text-red-800 border-red-300" },
      pending_approval: { label: "⏳ Pending Review", class: "bg-yellow-100 text-yellow-800 border-yellow-300" },
    };
    const s = map[status] || { label: status, class: "bg-gray-100 text-gray-700" };
    return <Badge className={`border ${s.class}`}>{s.label}</Badge>;
  };

  const getPriorityBadge = (priority: string) => {
    const map: Record<string, string> = {
      urgent: "bg-red-100 text-red-800",
      high: "bg-orange-100 text-orange-800",
      normal: "bg-gray-100 text-gray-700",
      low: "bg-blue-100 text-blue-800",
    };
    return <Badge variant="outline" className={map[priority] || ""}>{priority}</Badge>;
  };

  const getPaymentMethods = (methods: string) => {
    try {
      const arr = JSON.parse(methods || "[]");
      return Array.isArray(arr) ? arr : [methods];
    } catch { return [methods].filter(Boolean); }
  };

  const openApprove = (p: PaymentRequest) => {
    setSelectedPayment(p);
    setApproveAmount(p.amountRequested);
    setIsApproveOpen(true);
  };

  const openReject = (p: PaymentRequest) => {
    setSelectedPayment(p);
    setRejectReason("");
    setIsRejectPayOpen(true);
  };

  const openPay = (p: PaymentRequest) => {
    setSelectedPayment(p);
    const remaining = parseFloat(p.amountApproved || p.amountRequested) - parseFloat(p.amountPaid || "0");
    setPayAmount(remaining.toFixed(2));
    setPayType("full");
    setIsPayOpen(true);
  };

  const handlePayTypeChange = (type: "full" | "partial") => {
    setPayType(type);
    if (type === "full" && selectedPayment) {
      const remaining = parseFloat(selectedPayment.amountApproved || selectedPayment.amountRequested) - parseFloat(selectedPayment.amountPaid || "0");
      setPayAmount(remaining.toFixed(2));
    } else {
      setPayAmount("");
    }
  };

  const { t } = useTranslation();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <PageGuard pageName="payments">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">{t("payments.title")}</h1>
            <p className="text-gray-600">Manage technician payments and invoice approvals for your assigned work orders</p>
          </div>
          <div className="flex items-center gap-3">
            {pendingPayments.length > 0 && (
              <Badge className="bg-yellow-100 text-yellow-800 border border-yellow-300 text-sm px-3 py-1">
                {pendingPayments.length} payment{pendingPayments.length > 1 ? "s" : ""} need review
              </Badge>
            )}
            {pendingInvoices.length > 0 && (
              <Badge className="bg-blue-100 text-blue-800 border border-blue-300 text-sm px-3 py-1">
                {pendingInvoices.length} invoice{pendingInvoices.length > 1 ? "s" : ""} need review
              </Badge>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const rows = payments.map((p) => ({
                  "Work Order #": p.workOrderNumber,
                  Client: p.clientName,
                  Technician: p.technicianName,
                  "W9 Status": p.technicianW9Status || "None",
                  "Amount Requested ($)": parseFloat(p.amountRequested || "0").toFixed(2),
                  "Amount Approved ($)": parseFloat(p.amountApproved || "0").toFixed(2),
                  "Amount Paid ($)": parseFloat(p.amountPaid || "0").toFixed(2),
                  Status: p.status,
                  Priority: p.priority,
                  "Requested Date": new Date(p.requestedAt).toLocaleDateString(),
                  "Approved Date": p.approvedAt ? new Date(p.approvedAt).toLocaleDateString() : "",
                  "Paid Date": p.paidAt ? new Date(p.paidAt).toLocaleDateString() : "",
                  Description: p.description || "",
                }));
                exportToCSV(rows, "payment_requests");
              }}
            >
              <Download className="h-4 w-4 mr-2" />
              Export CSV
            </Button>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-2 max-w-sm">
            <TabsTrigger value="payments" className="flex items-center gap-2">
              <DollarSign className="h-4 w-4" />
              Payment Requests
              {pendingPayments.length > 0 && (
                <span className="ml-1 bg-yellow-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center font-bold">
                  {pendingPayments.length}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="invoices" className="flex items-center gap-2">
              <Receipt className="h-4 w-4" />
              Invoice Requests
              {pendingInvoices.length > 0 && (
                <span className="ml-1 bg-yellow-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center font-bold">
                  {pendingInvoices.length}
                </span>
              )}
            </TabsTrigger>
          </TabsList>

          {/* ════ PAYMENT REQUESTS TAB ════ */}
          <TabsContent value="payments">
            <AdvancedPermissionGuard permission="payments.view">
              <div className="space-y-3">
                {payments.length === 0 ? (
                  <Card>
                    <CardContent className="text-center py-12">
                      <DollarSign className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                      <p className="font-medium text-gray-600">No payment requests</p>
                      <p className="text-sm text-gray-500 mt-1">
                        Payment requests for your assigned work orders will appear here.
                      </p>
                    </CardContent>
                  </Card>
                ) : (
                  payments.map((payment) => {
                    const requested = parseFloat(payment.amountRequested || "0");
                    const approved = parseFloat(payment.amountApproved || "0");
                    const paid = parseFloat(payment.amountPaid || "0");
                    const remaining = Math.max(0, approved - paid);
                    const paidPct = approved > 0 ? Math.min(100, (paid / approved) * 100) : 0;
                    const methods = getPaymentMethods(payment.paymentMethod);

                    return (
                      <Card key={payment.id} className={`border-2 transition-shadow hover:shadow-md ${
                        payment.status === "pending" ? "border-yellow-300" :
                        payment.status === "approved" ? "border-blue-300" :
                        payment.status === "paid" ? "border-green-300" :
                        payment.status === "partially_paid" ? "border-orange-300" :
                        payment.status === "rejected" ? "border-red-200" : "border-gray-200"
                      }`}>
                        <CardContent className="p-5">
                          <div className="flex items-start gap-4">
                            {/* Left: Technician avatar */}
                            <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center flex-shrink-0">
                              <User className="h-5 w-5 text-indigo-600" />
                            </div>

                            {/* Middle: Details */}
                            <div className="flex-1 min-w-0 space-y-2">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="font-bold text-gray-900">{payment.technicianName}</span>
                                <span className="text-gray-400">·</span>
                                <span className="text-gray-600 text-sm">{payment.workOrderNumber}</span>
                                <span className="text-gray-400 text-sm">{payment.clientName}</span>
                                {getStatusBadge(payment.status)}
                                {payment.priority && getPriorityBadge(payment.priority)}
                              </div>

                              {/* Payment methods */}
                              <div className="flex flex-wrap gap-1">
                                {methods.map((m: string) => (
                                  <Badge key={m} variant="outline" className="text-xs">
                                    <CreditCard className="h-3 w-3 mr-1" />{m}
                                  </Badge>
                                ))}
                              </div>

                              {payment.description && (
                                <p className="text-sm text-gray-600 italic">{payment.description}</p>
                              )}

                              {/* Amounts */}
                              <div className="grid grid-cols-3 gap-3 text-sm">
                                <div>
                                  <p className="text-xs text-gray-500">Requested</p>
                                  <p className="font-semibold">{formatCurrency(requested)}</p>
                                </div>
                                <div>
                                  <p className="text-xs text-gray-500">Approved</p>
                                  <p className="font-semibold text-blue-700">
                                    {approved > 0 ? formatCurrency(approved) : "—"}
                                  </p>
                                </div>
                                <div>
                                  <p className="text-xs text-gray-500">Remaining</p>
                                  <p className={`font-semibold ${remaining > 0 ? "text-red-600" : "text-green-600"}`}>
                                    {approved > 0 ? formatCurrency(remaining) : "—"}
                                  </p>
                                </div>
                              </div>

                              {/* Payment progress (for approved/partial/paid) */}
                              {(payment.status === "approved" || payment.status === "partially_paid" || payment.status === "paid") && approved > 0 && (
                                <div className="space-y-1">
                                  <Progress value={paidPct} className="h-2" />
                                  <p className="text-xs text-gray-500">
                                    Paid {formatCurrency(paid)} of {formatCurrency(approved)} ({paidPct.toFixed(0)}%)
                                  </p>
                                </div>
                              )}

                              {/* Rejection reason */}
                              {payment.status === "rejected" && payment.rejectionReason && (
                                <p className="text-sm text-red-700 bg-red-50 rounded px-3 py-1.5 border border-red-200">
                                  Rejected: {payment.rejectionReason}
                                </p>
                              )}

                              <p className="text-xs text-gray-400">
                                Requested {new Date(payment.requestedAt).toLocaleDateString()}
                                {payment.approvedAt && ` · Approved ${new Date(payment.approvedAt).toLocaleDateString()}`}
                                {payment.paidAt && ` · Paid ${new Date(payment.paidAt).toLocaleDateString()}`}
                              </p>
                            </div>

                            {/* Right: Actions */}
                            <div className="flex flex-col gap-2 flex-shrink-0">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => { setSelectedPayment(payment); setIsDetailOpen(true); }}
                              >
                                <Eye className="h-3 w-3 mr-1" />View
                              </Button>

                              <Button
                                variant="outline"
                                size="sm"
                                className="text-gray-600"
                                onClick={() => { setSelectedTechId(payment.technicianId); setIsHistoryOpen(true); }}
                              >
                                <History className="h-3 w-3 mr-1" />History
                              </Button>

                              {payment.status === "pending" && (
                                <>
                                  <Button size="sm" className="bg-green-600 hover:bg-green-700 text-white" onClick={() => openApprove(payment)}>
                                    <CheckCircle2 className="h-3 w-3 mr-1" />Approve
                                  </Button>
                                  <Button size="sm" variant="destructive" onClick={() => openReject(payment)}>
                                    <XCircle className="h-3 w-3 mr-1" />Reject
                                  </Button>
                                </>
                              )}

                              {(payment.status === "approved" || payment.status === "partially_paid") && (
                                <>
                                  <Button size="sm" className="bg-indigo-600 hover:bg-indigo-700 text-white" onClick={() => openPay(payment)}>
                                    <Banknote className="h-3 w-3 mr-1" />Pay
                                  </Button>
                                  <Button size="sm" variant="outline" className="border-red-300 text-red-600" onClick={() => openReject(payment)}>
                                    <XCircle className="h-3 w-3 mr-1" />Reject
                                  </Button>
                                </>
                              )}
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })
                )}
              </div>
            </AdvancedPermissionGuard>
          </TabsContent>

          {/* ════ INVOICE REQUESTS TAB ════ */}
          <TabsContent value="invoices">
            <div className="space-y-3">
              {isLoadingInvoices ? (
                <div className="flex items-center justify-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
                </div>
              ) : invoiceRequests.length === 0 ? (
                <Card>
                  <CardContent className="text-center py-12">
                    <Receipt className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                    <p className="font-medium text-gray-600">No invoice requests</p>
                    <p className="text-sm text-gray-500 mt-1">
                      Invoice requests for your assigned work orders will appear here.
                    </p>
                  </CardContent>
                </Card>
              ) : (
                invoiceRequests.map((invoice) => (
                  <Card key={invoice.id} className={`border-2 transition-shadow hover:shadow-md ${
                    invoice.status === "pending_approval" ? "border-yellow-300" :
                    invoice.status === "approved" ? "border-green-300" :
                    invoice.status === "rejected" ? "border-red-200" : "border-gray-200"
                  }`}>
                    <CardContent className="p-5">
                      <div className="flex items-start gap-4">
                        <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                          <Receipt className="h-5 w-5 text-blue-600" />
                        </div>
                        <div className="flex-1 space-y-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-bold">{invoice.workOrderNumber}</span>
                            <span className="text-gray-400">·</span>
                            <span className="text-gray-600 text-sm">{invoice.clientName}</span>
                            {getStatusBadge(invoice.status)}
                          </div>
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                            <div><p className="text-xs text-gray-500">Labor</p><p className="font-semibold text-blue-700">{formatCurrency(invoice.laborCost)}</p></div>
                            <div><p className="text-xs text-gray-500">Materials</p><p className="font-semibold text-green-700">{formatCurrency(invoice.materialCost)}</p></div>
                            <div><p className="text-xs text-gray-500">Tax</p><p className="font-semibold">{formatCurrency(invoice.taxAmount)}</p></div>
                            <div><p className="text-xs text-gray-500">Total</p><p className="font-bold text-lg">{formatCurrency(invoice.totalAmount)}</p></div>
                          </div>
                          {invoice.status === "rejected" && invoice.rejectionReason && (
                            <p className="text-sm text-red-700 bg-red-50 rounded px-3 py-1.5 border border-red-200">
                              Rejected: {invoice.rejectionReason}
                            </p>
                          )}
                          {invoice.status === "pending_approval" && invoice.workOrderStatus !== "job_done" && (
                            <p className="text-xs text-orange-700 bg-orange-50 rounded px-3 py-1.5 border border-orange-200 flex items-center gap-1">
                              ⚠ Work order must be set to <strong className="mx-1">Job Done</strong> before this invoice can be approved. (Current: {invoice.workOrderStatus?.replace(/_/g, " ")})
                            </p>
                          )}
                          <p className="text-xs text-gray-400">#{invoice.invoiceNumber} · {new Date(invoice.createdAt).toLocaleDateString()}</p>
                        </div>
                        <div className="flex flex-col gap-2 flex-shrink-0">
                          <Button variant="outline" size="sm" onClick={() => { setSelectedInvoice(invoice); setIsInvoiceDetailOpen(true); }}>
                            <Eye className="h-3 w-3 mr-1" />View
                          </Button>
                          {invoice.status === "pending_approval" && (
                            <>
                              <Button size="sm"
                                className={invoice.workOrderStatus === "job_done" ? "bg-green-600 hover:bg-green-700 text-white" : "bg-gray-300 text-gray-500 cursor-not-allowed"}
                                onClick={() => {
                                  if (invoice.workOrderStatus !== "job_done") {
                                    toast({ title: "Cannot Approve Invoice", description: `Work order must be in "Job Done" status first. Current status: "${invoice.workOrderStatus?.replace(/_/g," ")}".`, variant: "destructive" });
                                    return;
                                  }
                                  approveInvoiceMutation.mutate(invoice.id);
                                }}
                                disabled={approveInvoiceMutation.isPending}>
                                <CheckCircle2 className="h-3 w-3 mr-1" />Approve
                              </Button>
                              <Button size="sm" variant="destructive"
                                onClick={() => { setSelectedInvoice(invoice); setIsInvoiceRejectOpen(true); }}>
                                <XCircle className="h-3 w-3 mr-1" />Reject
                              </Button>
                            </>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          </TabsContent>
        </Tabs>

        {/* ══════════════════════════════════════
            PAYMENT DETAIL MODAL
        ══════════════════════════════════════ */}
        <Dialog open={isDetailOpen} onOpenChange={setIsDetailOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle>Payment Request Details</DialogTitle></DialogHeader>
            {selectedPayment && (
              <div className="space-y-4">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="font-bold text-lg">{selectedPayment.technicianName}</p>
                    <p className="text-gray-600 text-sm">{selectedPayment.workOrderNumber} · {selectedPayment.clientName}</p>
                  </div>
                  {getStatusBadge(selectedPayment.status)}
                </div>
                <div className="bg-gray-50 rounded-lg border p-4 space-y-2 text-sm">
                  <div className="flex justify-between"><span className="text-gray-600">Amount Requested</span><span className="font-semibold">{formatCurrency(selectedPayment.amountRequested)}</span></div>
                  {parseFloat(selectedPayment.amountApproved || "0") > 0 && (
                    <div className="flex justify-between"><span className="text-gray-600">Amount Approved</span><span className="font-semibold text-blue-700">{formatCurrency(selectedPayment.amountApproved)}</span></div>
                  )}
                  {parseFloat(selectedPayment.amountPaid || "0") > 0 && (
                    <div className="flex justify-between"><span className="text-gray-600">Amount Paid</span><span className="font-semibold text-green-700">{formatCurrency(selectedPayment.amountPaid)}</span></div>
                  )}
                  {(selectedPayment.status === "approved" || selectedPayment.status === "partially_paid") && (
                    <div className="flex justify-between border-t pt-2"><span className="text-gray-600">Remaining</span>
                      <span className="font-bold text-red-600">
                        {formatCurrency(Math.max(0, parseFloat(selectedPayment.amountApproved || selectedPayment.amountRequested) - parseFloat(selectedPayment.amountPaid || "0")))}
                      </span>
                    </div>
                  )}
                </div>
                {selectedPayment.description && (
                  <div><p className="text-sm font-medium text-gray-600 mb-1">Description</p>
                    <p className="text-sm bg-gray-50 p-3 rounded border">{selectedPayment.description}</p></div>
                )}
                {selectedPayment.rejectionReason && (
                  <div className="bg-red-50 border border-red-200 rounded p-3">
                    <p className="text-sm font-medium text-red-800">Rejection Reason</p>
                    <p className="text-sm text-red-700 mt-1">{selectedPayment.rejectionReason}</p>
                  </div>
                )}
                {selectedPayment.status === "pending" && (
                  <div className="flex gap-2 pt-2 border-t">
                    <Button className="flex-1 bg-green-600 hover:bg-green-700" onClick={() => { setIsDetailOpen(false); openApprove(selectedPayment); }}>
                      <CheckCircle2 className="h-4 w-4 mr-2" />Approve
                    </Button>
                    <Button variant="destructive" className="flex-1" onClick={() => { setIsDetailOpen(false); openReject(selectedPayment); }}>
                      <XCircle className="h-4 w-4 mr-2" />Reject
                    </Button>
                  </div>
                )}
                {(selectedPayment.status === "approved" || selectedPayment.status === "partially_paid") && (
                  <div className="flex gap-2 pt-2 border-t">
                    <Button className="flex-1 bg-indigo-600 hover:bg-indigo-700" onClick={() => { setIsDetailOpen(false); openPay(selectedPayment); }}>
                      <Banknote className="h-4 w-4 mr-2" />Record Payment
                    </Button>
                    <Button variant="outline" className="border-red-300 text-red-600" onClick={() => { setIsDetailOpen(false); openReject(selectedPayment); }}>
                      <XCircle className="h-4 w-4 mr-2" />Reject
                    </Button>
                  </div>
                )}
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* ══════════════════════════════════════
            APPROVE PAYMENT MODAL
        ══════════════════════════════════════ */}
        <Dialog open={isApproveOpen} onOpenChange={setIsApproveOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle>Approve Payment Request</DialogTitle></DialogHeader>
            {selectedPayment && (() => {
              const approveAmt = parseFloat(approveAmount || selectedPayment.amountRequested || "0");
              const needsW9 = approveAmt > 500 && !selectedPayment.technicianW9Status;
              const w9Pending = approveAmt > 500 && selectedPayment.technicianW9Status === "submitted";
              return (
                <div className="space-y-4">
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <p className="font-semibold text-blue-900">{selectedPayment.technicianName}</p>
                    <p className="text-sm text-blue-700">{selectedPayment.workOrderNumber} · Requested: {formatCurrency(selectedPayment.amountRequested)}</p>
                  </div>
                  {needsW9 && (
                    <div className="flex gap-2 p-3 bg-red-50 border border-red-300 rounded-lg text-sm text-red-800">
                      <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5 text-red-600" />
                      <div>
                        <strong>W9 Required</strong> — This technician has no W9 on file. Payments over $500 to non-W9 contractors must be reported to the IRS. Upload their W9 under Technicians before approving.
                      </div>
                    </div>
                  )}
                  {w9Pending && (
                    <div className="flex gap-2 p-3 bg-yellow-50 border border-yellow-300 rounded-lg text-sm text-yellow-800">
                      <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5 text-yellow-600" />
                      <div>
                        <strong>W9 Submitted (Not Verified)</strong> — The technician has submitted a W9 but it has not been verified yet. Proceed with caution.
                      </div>
                    </div>
                  )}
                  <div className="space-y-2">
                    <Label>Amount to Approve</Label>
                    <div className="relative">
                      <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
                      <Input type="number" step="0.01" min="0.01" className="pl-9"
                        placeholder={selectedPayment.amountRequested}
                        value={approveAmount}
                        onChange={(e) => setApproveAmount(e.target.value)} />
                    </div>
                    <p className="text-xs text-gray-500">
                      You can approve a different amount than requested. Payments over $500 require a verified W9.
                    </p>
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button variant="outline" onClick={() => setIsApproveOpen(false)}>Cancel</Button>
                    <Button
                      className="bg-green-600 hover:bg-green-700"
                      onClick={() => approveMutation.mutate({ id: selectedPayment.id, amount: approveAmount || selectedPayment.amountRequested })}
                      disabled={approveMutation.isPending}
                    >
                      <CheckCircle2 className="h-4 w-4 mr-2" />
                      {approveMutation.isPending ? "Approving..." : needsW9 ? "Approve Anyway" : "Approve Payment"}
                    </Button>
                  </div>
                </div>
              );
            })()}
          </DialogContent>
        </Dialog>

        {/* ══════════════════════════════════════
            REJECT PAYMENT MODAL
        ══════════════════════════════════════ */}
        <Dialog open={isRejectPayOpen} onOpenChange={setIsRejectPayOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle>Reject Payment Request</DialogTitle></DialogHeader>
            <div className="space-y-4">
              {selectedPayment && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm">
                  <p className="font-semibold text-red-800">{selectedPayment.technicianName}</p>
                  <p className="text-red-700">{selectedPayment.workOrderNumber} · {formatCurrency(selectedPayment.amountRequested)}</p>
                </div>
              )}
              <div className="space-y-2">
                <Label>Rejection Reason</Label>
                <Textarea placeholder="Explain why this payment request is being rejected..." value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} rows={3} />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => { setIsRejectPayOpen(false); setRejectReason(""); }}>Cancel</Button>
                <Button variant="destructive"
                  onClick={() => selectedPayment && rejectPayMutation.mutate({ id: selectedPayment.id, reason: rejectReason })}
                  disabled={rejectPayMutation.isPending || !rejectReason.trim()}>
                  <XCircle className="h-4 w-4 mr-2" />
                  {rejectPayMutation.isPending ? "Rejecting..." : "Reject Payment"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* ══════════════════════════════════════
            PAY MODAL
        ══════════════════════════════════════ */}
        <Dialog open={isPayOpen} onOpenChange={setIsPayOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle>Record Payment</DialogTitle></DialogHeader>
            {selectedPayment && (() => {
              const approved = parseFloat(selectedPayment.amountApproved || selectedPayment.amountRequested);
              const paid = parseFloat(selectedPayment.amountPaid || "0");
              const remaining = Math.max(0, approved - paid);
              return (
                <div className="space-y-5">
                  <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4">
                    <p className="font-semibold text-indigo-900">{selectedPayment.technicianName}</p>
                    <p className="text-sm text-indigo-700">{selectedPayment.workOrderNumber}</p>
                    <div className="grid grid-cols-3 gap-3 mt-3 text-sm">
                      <div><p className="text-xs text-indigo-500">Approved</p><p className="font-bold">{formatCurrency(approved)}</p></div>
                      <div><p className="text-xs text-indigo-500">Paid So Far</p><p className="font-bold">{formatCurrency(paid)}</p></div>
                      <div><p className="text-xs text-indigo-500">Remaining</p><p className="font-bold text-red-600">{formatCurrency(remaining)}</p></div>
                    </div>
                    {approved > 0 && (
                      <Progress value={Math.min(100, (paid / approved) * 100)} className="mt-3 h-2" />
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label>Payment Type</Label>
                    <div className="grid grid-cols-2 gap-2">
                      <Button
                        type="button"
                        variant={payType === "full" ? "default" : "outline"}
                        onClick={() => handlePayTypeChange("full")}
                        className={payType === "full" ? "bg-indigo-600 hover:bg-indigo-700" : ""}
                      >
                        Full Payment ({formatCurrency(remaining)})
                      </Button>
                      <Button
                        type="button"
                        variant={payType === "partial" ? "default" : "outline"}
                        onClick={() => handlePayTypeChange("partial")}
                        className={payType === "partial" ? "bg-orange-500 hover:bg-orange-600" : ""}
                      >
                        Partial Payment
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Amount to Pay Now</Label>
                    <div className="relative">
                      <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
                      <Input
                        type="number" step="0.01" min="0.01"
                        max={remaining}
                        className="pl-9"
                        value={payAmount}
                        onChange={(e) => setPayAmount(e.target.value)}
                        readOnly={payType === "full"}
                      />
                    </div>
                    {payType === "partial" && parseFloat(payAmount) > 0 && (
                      <p className="text-xs text-orange-600">
                        After this payment: {formatCurrency(Math.max(0, remaining - parseFloat(payAmount)))} remaining
                      </p>
                    )}
                  </div>

                  {parseFloat(payAmount) > remaining + 0.001 && (
                    <div className="flex items-center gap-2 text-sm text-amber-600 bg-amber-50 border border-amber-200 rounded p-2">
                      <AlertTriangle className="h-4 w-4 flex-shrink-0" />
                      Amount exceeds the remaining balance.
                    </div>
                  )}

                  <div className="flex justify-end gap-2">
                    <Button variant="outline" onClick={() => setIsPayOpen(false)}>Cancel</Button>
                    <Button
                      className="bg-indigo-600 hover:bg-indigo-700"
                      onClick={() => payMutation.mutate({ id: selectedPayment.id, amount: payAmount })}
                      disabled={payMutation.isPending || !payAmount || parseFloat(payAmount) <= 0}
                    >
                      <Banknote className="h-4 w-4 mr-2" />
                      {payMutation.isPending ? "Recording..." : "Confirm Payment"}
                    </Button>
                  </div>
                </div>
              );
            })()}
          </DialogContent>
        </Dialog>

        {/* ══════════════════════════════════════
            TECHNICIAN HISTORY MODAL
        ══════════════════════════════════════ */}
        <Dialog open={isHistoryOpen} onOpenChange={setIsHistoryOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader><DialogTitle>Technician Payment History</DialogTitle></DialogHeader>
            {technicianHistory.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <History className="h-10 w-10 mx-auto mb-3 opacity-40" />
                <p>No payment history found</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Work Order</TableHead>
                    <TableHead>Requested</TableHead>
                    <TableHead>Paid</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {technicianHistory.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell>{new Date(p.requestedAt).toLocaleDateString()}</TableCell>
                      <TableCell>{p.workOrderNumber}</TableCell>
                      <TableCell>{formatCurrency(p.amountRequested)}</TableCell>
                      <TableCell>{formatCurrency(p.amountPaid || "0")}</TableCell>
                      <TableCell>{getStatusBadge(p.status)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </DialogContent>
        </Dialog>

        {/* ══════════════════════════════════════
            INVOICE DETAIL MODAL
        ══════════════════════════════════════ */}
        <Dialog open={isInvoiceDetailOpen} onOpenChange={setIsInvoiceDetailOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle>Invoice Request Details</DialogTitle></DialogHeader>
            {selectedInvoice && (
              <div className="space-y-4">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="font-bold text-lg">{selectedInvoice.workOrderNumber}</p>
                    <p className="text-gray-600">{selectedInvoice.clientName}</p>
                    <p className="text-xs text-gray-400">#{selectedInvoice.invoiceNumber}</p>
                  </div>
                  {getStatusBadge(selectedInvoice.status)}
                </div>
                <div className="bg-gray-50 rounded-lg border p-4 space-y-2 text-sm">
                  <div className="flex justify-between"><span className="text-gray-600">Labor</span><span className="font-medium">{formatCurrency(selectedInvoice.laborCost)}</span></div>
                  <div className="flex justify-between"><span className="text-gray-600">Materials</span><span className="font-medium">{formatCurrency(selectedInvoice.materialCost)}</span></div>
                  <div className="flex justify-between border-t pt-2"><span className="text-gray-600">Subtotal</span><span className="font-medium">{formatCurrency(selectedInvoice.subtotal)}</span></div>
                  <div className="flex justify-between"><span className="text-gray-600">Tax ({(parseFloat(selectedInvoice.taxRate || "0") * 100).toFixed(1)}%)</span><span className="font-medium">{formatCurrency(selectedInvoice.taxAmount)}</span></div>
                  <div className="flex justify-between border-t pt-2 font-bold text-base"><span>Total</span><span className="text-blue-600">{formatCurrency(selectedInvoice.totalAmount)}</span></div>
                </div>
                {selectedInvoice.notes && (
                  <div><p className="text-sm font-medium text-gray-600 mb-1">Notes</p>
                    <p className="text-sm bg-gray-50 p-3 rounded border">{selectedInvoice.notes}</p></div>
                )}
                {selectedInvoice.status === "pending_approval" && (
                  <div className="flex gap-2 pt-2 border-t">
                    <Button className="flex-1 bg-green-600 hover:bg-green-700"
                      onClick={() => approveInvoiceMutation.mutate(selectedInvoice.id)}
                      disabled={approveInvoiceMutation.isPending}>
                      <CheckCircle2 className="h-4 w-4 mr-2" />
                      {approveInvoiceMutation.isPending ? "Approving..." : "Approve — Lock Work Order"}
                    </Button>
                    <Button variant="destructive" className="flex-1"
                      onClick={() => setIsInvoiceRejectOpen(true)}>
                      <XCircle className="h-4 w-4 mr-2" />Reject
                    </Button>
                  </div>
                )}
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* ══════════════════════════════════════
            INVOICE REJECT MODAL
        ══════════════════════════════════════ */}
        <Dialog open={isInvoiceRejectOpen} onOpenChange={setIsInvoiceRejectOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle>Reject Invoice Request</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <p className="text-sm text-gray-600">
                Provide a reason. The requester will be notified and can re-submit a corrected invoice.
              </p>
              <div className="space-y-2">
                <Label>Rejection Reason</Label>
                <Textarea placeholder="Explain why this invoice request is being rejected..." value={invoiceRejectReason} onChange={(e) => setInvoiceRejectReason(e.target.value)} rows={3} />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => { setIsInvoiceRejectOpen(false); setInvoiceRejectReason(""); }}>Cancel</Button>
                <Button variant="destructive"
                  onClick={() => selectedInvoice && rejectInvoiceMutation.mutate({ id: selectedInvoice.id, reason: invoiceRejectReason })}
                  disabled={rejectInvoiceMutation.isPending || !invoiceRejectReason.trim()}>
                  <XCircle className="h-4 w-4 mr-2" />
                  {rejectInvoiceMutation.isPending ? "Rejecting..." : "Reject Invoice"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </PageGuard>
  );
}
