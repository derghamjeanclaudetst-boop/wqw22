import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Receipt, Send, CheckCircle2, XCircle, Clock, AlertTriangle, RefreshCw, ImageOff, FileSignature } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { WorkOrder } from "@shared/schema";

interface InvoiceManagementProps {
  workOrder: WorkOrder;
  onOpenInvoiceModal?: () => void;
}

const INVOICE_ALLOWED_STATUSES = ["invoiced", "job_done", "approved_pending", "approved_scheduled"];

function parseLaborData(raw: any): { lines: any[]; scopeOfWork: string; taxRate: string } {
  if (!raw) return { lines: [], scopeOfWork: "", taxRate: "0" };
  try {
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    return {
      lines: Array.isArray(parsed?.lines) ? parsed.lines : [],
      scopeOfWork: parsed?.scopeOfWork || "",
      taxRate: parsed?.taxRate || "0",
    };
  } catch {
    return { lines: [], scopeOfWork: "", taxRate: "0" };
  }
}

export function InvoiceManagement({ workOrder }: InvoiceManagementProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isRequestModalOpen, setIsRequestModalOpen] = useState(false);
  const [isRejectModalOpen, setIsRejectModalOpen] = useState(false);
  const [taxRate, setTaxRate] = useState("0");
  const [notes, setNotes] = useState("");
  const [rejectReason, setRejectReason] = useState("");

  const { data: invoice, isLoading } = useQuery<any>({
    queryKey: [`/api/work-orders/${workOrder.id}/invoice`],
    enabled: !!workOrder.id,
  });

  const { data: proposal } = useQuery<any>({
    queryKey: [`/api/work-orders/${workOrder.id}/proposal`],
    enabled: !!workOrder.id,
  });

  const { data: workOrderFiles = [] } = useQuery<any[]>({
    queryKey: [`/api/work-orders/${workOrder.id}/files`],
    enabled: !!workOrder.id,
  });

  const proposalContent = parseLaborData(proposal?.laborData);
  const proposalLines = proposalContent.lines;
  const proposalScopeOfWork = proposalContent.scopeOfWork;

  const proposalSubtotal = proposalLines.reduce((sum: number, line: any) => {
    return sum + parseFloat(line.rate || "0") * parseFloat(line.qty || "1");
  }, 0);

  const taxRateNum = parseFloat(taxRate) || 0;
  const taxAmount = proposalSubtotal * (taxRateNum / 100);
  const totalAmount = proposalSubtotal + taxAmount;

  const hasBeforePicture = (workOrderFiles as any[]).some((f: any) => f.category === "before");
  const canRequestInvoice = INVOICE_ALLOWED_STATUSES.includes(workOrder.status || "");

  const formatCurrency = (n: number) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);

  const submitInvoiceMutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", `/api/work-orders/${workOrder.id}/invoice`, {
        laborCost: proposalSubtotal.toString(),
        materialCost: "0",
        additionalCosts: "0",
        subtotal: proposalSubtotal.toString(),
        taxRate: (taxRateNum / 100).toString(),
        taxAmount: taxAmount.toString(),
        totalAmount: totalAmount.toString(),
        notes,
      }),
    onSuccess: () => {
      toast({ title: "Invoice Requested", description: "Your invoice request has been sent for approval." });
      queryClient.invalidateQueries({ queryKey: [`/api/work-orders/${workOrder.id}/invoice`] });
      queryClient.invalidateQueries({ queryKey: ["/api/invoices/all"] });
      setIsRequestModalOpen(false);
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message || "Failed to submit invoice request", variant: "destructive" });
    },
  });

  const approveMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/invoices/${invoice?.id}/approve`, {}),
    onSuccess: () => {
      toast({ title: "Invoice Approved", description: "The invoice has been approved. The work order will be locked once the invoice is paid." });
      queryClient.invalidateQueries({ queryKey: [`/api/work-orders/${workOrder.id}/invoice`] });
      queryClient.invalidateQueries({ queryKey: ["/api/work-orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/invoices/all"] });
    },
    onError: (err: any) => {
      toast({ title: "Cannot Approve Invoice", description: err.message || "Failed to approve", variant: "destructive" });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/invoices/${invoice?.id}/reject`, { reason: rejectReason }),
    onSuccess: () => {
      toast({ title: "Invoice Rejected", description: "A notification has been sent to the requester." });
      queryClient.invalidateQueries({ queryKey: [`/api/work-orders/${workOrder.id}/invoice`] });
      queryClient.invalidateQueries({ queryKey: ["/api/invoices/all"] });
      setIsRejectModalOpen(false);
      setRejectReason("");
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message || "Failed to reject", variant: "destructive" });
    },
  });

  const handleApprove = () => {
    if (workOrder.status !== "job_done") {
      toast({
        title: "Work Order Not Ready",
        description: `The work order must be in "Job Done" status before the invoice can be approved. Current status: "${workOrder.status}".`,
        variant: "destructive",
      });
      return;
    }
    if (!hasBeforePicture) {
      toast({
        title: "Before Image Required",
        description: "A before photo must be uploaded in the Files tab before this invoice can be approved.",
        variant: "destructive",
      });
      return;
    }
    approveMutation.mutate();
  };

  const handleOpenRequest = () => {
    setTaxRate(proposalContent.taxRate || "0");
    setIsRequestModalOpen(true);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  const status = invoice?.status;
  const displayTaxRate = invoice ? parseFloat(invoice.taxRate || "0") * 100 : 0;
  const displaySubtotal = parseFloat(invoice?.subtotal || "0");
  const displayTaxAmount = parseFloat(invoice?.taxAmount || "0");
  const displayTotal = parseFloat(invoice?.totalAmount || "0");

  const LineItemsTable = ({ lines }: { lines: any[] }) => (
    <div className="rounded-lg border overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 border-b">
          <tr>
            <th className="text-left p-3 font-medium text-gray-600">Charge Type</th>
            <th className="text-left p-3 font-medium text-gray-600">Item</th>
            <th className="text-left p-3 font-medium text-gray-600">Description</th>
            <th className="text-right p-3 font-medium text-gray-600">Rate</th>
            <th className="text-right p-3 font-medium text-gray-600">Qty</th>
            <th className="text-right p-3 font-medium text-gray-600">Total</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((line: any, i: number) => {
            const lineTotal = parseFloat(line.rate || "0") * parseFloat(line.qty || "1");
            return (
              <tr key={i} className="border-b last:border-0 hover:bg-gray-50/50">
                <td className="p-3 text-gray-700">{line.chargeType || "—"}</td>
                <td className="p-3 text-gray-600">{line.item || "—"}</td>
                <td className="p-3 text-gray-700">{line.description || "—"}</td>
                <td className="p-3 text-right">${parseFloat(line.rate || "0").toFixed(2)}</td>
                <td className="p-3 text-right">{line.qty || 1}</td>
                <td className="p-3 text-right font-semibold">${lineTotal.toFixed(2)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );

  return (
    <div className="space-y-4">
      {/* Before-picture warning — always visible */}
      {!hasBeforePicture && (
        <div className="flex items-center gap-3 p-3 bg-orange-50 border border-orange-300 rounded-lg">
          <ImageOff className="h-5 w-5 text-orange-600 shrink-0" />
          <div>
            <p className="font-semibold text-orange-900 text-sm">Before image required to close this work order</p>
            <p className="text-xs text-orange-700 mt-0.5">
              Upload a "Before" photo in the <strong>Files</strong> tab. Without it, the invoice cannot be approved.
            </p>
          </div>
        </div>
      )}

      {/* Status restriction notice */}
      {!canRequestInvoice && !invoice && (
        <div className="flex items-center gap-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
          <AlertTriangle className="h-4 w-4 text-blue-600 shrink-0" />
          <p className="text-sm text-blue-800">
            Invoice can only be requested when the status is <strong>Invoiced</strong> or <strong>Job Done</strong>.
            Current status: <strong className="capitalize">{(workOrder.status || "").replace(/_/g, " ")}</strong>.
          </p>
        </div>
      )}

      {/* Status banners */}
      {status === "pending_approval" && (
        <div className="flex items-center gap-3 p-4 bg-yellow-50 border border-yellow-300 rounded-lg">
          <Clock className="h-5 w-5 text-yellow-600 flex-shrink-0" />
          <div className="flex-1">
            <p className="font-semibold text-yellow-800">Invoice Request Pending Review</p>
            <p className="text-sm text-yellow-700">Awaiting approval from the Payment Manager.</p>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline"
              className="border-green-500 text-green-700 hover:bg-green-50"
              onClick={handleApprove}
              disabled={approveMutation.isPending}
            >
              <CheckCircle2 className="h-4 w-4 mr-1" /> Approve
            </Button>
            <Button size="sm" variant="outline"
              className="border-red-500 text-red-700 hover:bg-red-50"
              onClick={() => setIsRejectModalOpen(true)}
            >
              <XCircle className="h-4 w-4 mr-1" /> Reject
            </Button>
          </div>
        </div>
      )}

      {status === "approved" && (
        <div className="flex items-center gap-3 p-4 bg-green-50 border border-green-300 rounded-lg">
          <CheckCircle2 className="h-5 w-5 text-green-600 flex-shrink-0" />
          <div>
            <p className="font-semibold text-green-800">Invoice Approved</p>
            <p className="text-sm text-green-700">This invoice has been approved. The work order will be locked once the invoice is marked as paid.</p>
          </div>
        </div>
      )}

      {status === "rejected" && (
        <div className="flex items-center gap-3 p-4 bg-red-50 border border-red-300 rounded-lg">
          <XCircle className="h-5 w-5 text-red-600 flex-shrink-0" />
          <div className="flex-1">
            <p className="font-semibold text-red-800">Invoice Request Rejected</p>
            {invoice?.rejectionReason && (
              <p className="text-sm text-red-700">Reason: {invoice.rejectionReason}</p>
            )}
            <p className="text-sm text-red-600 mt-1">You can re-submit a corrected invoice request.</p>
          </div>
          <Button size="sm" onClick={handleOpenRequest}
            disabled={workOrder.isLocked || !canRequestInvoice}
          >
            <RefreshCw className="h-4 w-4 mr-1" /> Re-request
          </Button>
        </div>
      )}

      {/* Invoice content */}
      {invoice ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex justify-between items-center">
              <div>
                <span className="text-blue-600">Invoice {invoice.invoiceNumber}</span>
                <p className="text-sm text-gray-500 font-normal mt-0.5">Work Order: {workOrder.workOrderNumber}</p>
              </div>
              <Badge className={
                status === "approved" ? "bg-green-100 text-green-800 border-green-300" :
                status === "rejected" ? "bg-red-100 text-red-800 border-red-300" :
                status === "pending_approval" ? "bg-yellow-100 text-yellow-800 border-yellow-300" :
                "bg-gray-100 text-gray-700"
              }>
                {status === "pending_approval" ? "Pending Approval" :
                 status === "approved" ? "✓ Approved" :
                 status === "rejected" ? "✗ Rejected" :
                 status || "Draft"}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {proposalLines.length > 0 ? (
              <>
                <div className="text-xs text-gray-500 font-medium uppercase tracking-wide">
                  Line Items — From Proposal
                </div>
                <LineItemsTable lines={proposalLines} />
              </>
            ) : null}

            {/* Totals */}
            <div className="bg-gray-50 rounded-lg border p-4 space-y-1.5 text-sm ml-auto max-w-xs">
              <div className="flex justify-between">
                <span className="text-gray-600">Sub Total</span>
                <span className="font-medium">{formatCurrency(displaySubtotal)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Tax ({displayTaxRate.toFixed(1)}%)</span>
                <span className="font-medium">{formatCurrency(displayTaxAmount)}</span>
              </div>
              <div className="flex justify-between font-bold text-base border-t pt-2">
                <span>Total Cost</span>
                <span className="text-blue-600">{formatCurrency(displayTotal)}</span>
              </div>
            </div>

            {proposalScopeOfWork && (
              <div>
                <p className="text-sm font-medium text-gray-600 mb-1">Scope of Work</p>
                <p className="text-sm text-gray-700 bg-gray-50 p-3 rounded border">{proposalScopeOfWork}</p>
              </div>
            )}

            {invoice.notes && (
              <div>
                <p className="text-sm font-medium text-gray-600 mb-1">Notes</p>
                <p className="text-sm text-gray-700 bg-gray-50 p-3 rounded border">{invoice.notes}</p>
              </div>
            )}

            <div className="text-xs text-gray-500">
              Requested: {new Date(invoice.createdAt).toLocaleDateString()}
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="text-center py-12">
            <Receipt className="h-16 w-16 mx-auto mb-4 text-blue-400" />
            <h3 className="text-lg font-semibold mb-2">No Invoice Requested</h3>
            <p className="text-gray-600 mb-4 max-w-sm mx-auto">
              The invoice will be automatically populated with the line items from this work order's approved proposal — no manual entry needed.
            </p>
            {!proposal && (
              <div className="flex items-center gap-2 justify-center text-sm text-amber-600 mb-4">
                <AlertTriangle className="h-4 w-4" />
                No proposal found. Create a proposal first.
              </div>
            )}
            {proposal && proposalLines.length === 0 && (
              <div className="flex items-center gap-2 justify-center text-sm text-amber-600 mb-4">
                <AlertTriangle className="h-4 w-4" />
                Proposal has no line items yet. Add items to the proposal first.
              </div>
            )}
            <Button
              onClick={handleOpenRequest}
              className="bg-blue-600 hover:bg-blue-700"
              disabled={workOrder.isLocked || !canRequestInvoice || !proposal || proposalLines.length === 0}
            >
              <Send className="h-4 w-4 mr-2" />
              Request Invoice
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Request Invoice Modal */}
      <Dialog open={isRequestModalOpen} onOpenChange={setIsRequestModalOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileSignature className="h-5 w-5 text-blue-600" />
              Invoice Request — {workOrder.workOrderNumber}
            </DialogTitle>
            <p className="text-sm text-gray-500 mt-1">
              Line items are automatically cloned from the proposal. Review and submit for approval.
            </p>
          </DialogHeader>

          <div className="space-y-5">
            {/* Line items from proposal */}
            {proposalLines.length > 0 ? (
              <div className="space-y-2">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  Line Items — Cloned from Proposal
                </p>
                <LineItemsTable lines={proposalLines} />
              </div>
            ) : (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-800">
                No line items found in the proposal.
              </div>
            )}

            {proposalScopeOfWork && (
              <div className="bg-gray-50 border rounded-lg p-3">
                <p className="text-xs font-semibold text-gray-500 uppercase mb-1">Scope of Work</p>
                <p className="text-sm text-gray-700">{proposalScopeOfWork}</p>
              </div>
            )}

            {/* Tax rate */}
            <div className="grid grid-cols-2 gap-4 items-end">
              <div className="space-y-2">
                <Label htmlFor="taxRate">Tax Rate (%) — pre-filled from proposal</Label>
                <Input
                  id="taxRate"
                  type="number"
                  min="0"
                  max="100"
                  step="0.1"
                  value={taxRate}
                  onChange={(e) => setTaxRate(e.target.value)}
                />
              </div>
              <div />
            </div>

            {/* Totals */}
            <div className="bg-gray-50 rounded-lg border p-4 space-y-1.5 text-sm ml-auto max-w-xs">
              <div className="flex justify-between">
                <span className="text-gray-600">Sub Total</span>
                <span>{formatCurrency(proposalSubtotal)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Tax ({taxRateNum.toFixed(1)}%)</span>
                <span>{formatCurrency(taxAmount)}</span>
              </div>
              <div className="flex justify-between font-bold text-base border-t pt-2">
                <span>Total Cost</span>
                <span className="text-blue-600">{formatCurrency(totalAmount)}</span>
              </div>
            </div>

            {/* Notes */}
            <div className="space-y-2">
              <Label htmlFor="notes">Notes (optional)</Label>
              <Textarea
                id="notes"
                placeholder="Add any notes for the payment manager..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setIsRequestModalOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={() => submitInvoiceMutation.mutate()}
                disabled={submitInvoiceMutation.isPending}
                className="bg-blue-600 hover:bg-blue-700"
              >
                <Send className="h-4 w-4 mr-2" />
                {submitInvoiceMutation.isPending ? "Submitting..." : "Submit Invoice Request"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Reject Modal */}
      <Dialog open={isRejectModalOpen} onOpenChange={setIsRejectModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Reject Invoice Request</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              Provide a reason for rejection. The requester will be notified and can re-submit.
            </p>
            <div className="space-y-2">
              <Label htmlFor="rejectReason">Rejection Reason</Label>
              <Textarea
                id="rejectReason"
                placeholder="Explain why this invoice request is being rejected..."
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                rows={3}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setIsRejectModalOpen(false)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={() => rejectMutation.mutate()}
                disabled={rejectMutation.isPending || !rejectReason.trim()}
              >
                <XCircle className="h-4 w-4 mr-2" />
                {rejectMutation.isPending ? "Rejecting..." : "Reject Invoice"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
