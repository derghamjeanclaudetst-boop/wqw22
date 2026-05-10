import { useState, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Plus, Trash2, AlertTriangle, Printer } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { AdvancedPermissionGuard } from "@/components/rbac/advanced-permission-guard";
import type { WorkOrderWithUsers, WorkOrderProposal } from "@shared/schema";

interface WorkOrderProposalModalProps {
  isOpen: boolean;
  onClose: () => void;
  workOrder: WorkOrderWithUsers;
}

const CHARGE_TYPES = ["Freight", "Labor", "Material", "Part", "Trip Charge"] as const;
type ChargeType = typeof CHARGE_TYPES[number];

interface LineItem {
  chargeType: ChargeType | "";
  item: string;
  option: string;
  description: string;
  rate: string;
  qty: string;
}

function createEmptyLine(): LineItem {
  return { chargeType: "", item: "Standard", option: "Standard", description: "", rate: "", qty: "" };
}

function lineTotal(line: LineItem): number {
  const r = parseFloat(line.rate) || 0;
  const q = parseFloat(line.qty) || 0;
  return r * q;
}

export function WorkOrderProposalModal({ isOpen, onClose, workOrder }: WorkOrderProposalModalProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [lines, setLines] = useState<LineItem[]>([createEmptyLine()]);
  const [scopeOfWork, setScopeOfWork] = useState("");
  const [taxRate, setTaxRate] = useState("0");

  const { data: proposal, isLoading } = useQuery<WorkOrderProposal | null>({
    queryKey: [`/api/work-orders/${workOrder?.id}/proposal`],
    enabled: isOpen && !!workOrder?.id,
  });

  useEffect(() => {
    if (!isOpen) return;
    if (proposal) {
      try {
        const parsed = proposal.laborData ? JSON.parse(proposal.laborData) : null;
        if (parsed && parsed.lines) {
          setLines(parsed.lines.length > 0 ? parsed.lines : [createEmptyLine()]);
          setScopeOfWork(parsed.scopeOfWork || proposal.message || "");
          setTaxRate(parsed.taxRate ?? "0");
        } else {
          setLines([createEmptyLine()]);
          setScopeOfWork(proposal.message || "");
          setTaxRate("0");
        }
      } catch {
        setLines([createEmptyLine()]);
        setScopeOfWork(proposal.message || "");
        setTaxRate("0");
      }
    } else {
      setLines([createEmptyLine()]);
      setScopeOfWork("");
      setTaxRate("0");
    }
  }, [proposal, isOpen]);

  const saveProposalMutation = useMutation({
    mutationFn: (data: any) =>
      proposal
        ? apiRequest("PUT", `/api/work-orders/${workOrder.id}/proposal`, data)
        : apiRequest("POST", `/api/work-orders/${workOrder.id}/proposal`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/work-orders/${workOrder.id}/proposal`] });
      queryClient.invalidateQueries({ queryKey: ["/api/proposals"] });
      queryClient.invalidateQueries({ queryKey: ["/api/work-orders"] });
      toast({ title: "Success", description: "Proposal saved successfully" });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to save proposal", variant: "destructive" });
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: (status: string) =>
      apiRequest("PUT", `/api/work-orders/${workOrder.id}/proposal/status`, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/work-orders/${workOrder.id}/proposal`] });
      queryClient.invalidateQueries({ queryKey: ["/api/proposals"] });
      queryClient.invalidateQueries({ queryKey: ["/api/work-orders"] });
      toast({ title: "Success", description: "Proposal status updated" });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to update status", variant: "destructive" });
    },
  });

  const subTotal = lines.reduce((s, l) => s + lineTotal(l), 0);
  const totalCost = subTotal;

  const laborCost = lines.filter(l => l.chargeType === "Labor").reduce((s, l) => s + lineTotal(l), 0);
  const materialCost = lines.filter(l => l.chargeType === "Material" || l.chargeType === "Part").reduce((s, l) => s + lineTotal(l), 0);
  const additionalCosts = lines.filter(l => l.chargeType === "Freight" || l.chargeType === "Trip Charge").reduce((s, l) => s + lineTotal(l), 0);

  const handleSave = () => {
    const payload = {
      workOrderId: workOrder.id,
      laborCost: laborCost.toFixed(2),
      materialCost: materialCost.toFixed(2),
      additionalCosts: additionalCosts.toFixed(2),
      totalCost: totalCost.toFixed(2),
      estimatedDuration: "TBD",
      description: scopeOfWork,
      message: scopeOfWork,
      laborData: JSON.stringify({ lines, scopeOfWork, taxRate: "0" }),
      partsData: JSON.stringify([]),
      servicesData: JSON.stringify([]),
      status: proposal?.status || "pending",
    };
    saveProposalMutation.mutate(payload);
  };

  const handlePrint = () => {
    const address = [workOrder?.street, workOrder?.city].filter(Boolean).join(", ") || workOrder?.location || "—";
    const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<title>Proposal — ${workOrder?.workOrderNumber}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: Arial, sans-serif; font-size: 13px; color: #111; padding: 40px; }
  h1 { font-size: 22px; font-weight: bold; margin-bottom: 4px; }
  .subtitle { color: #555; font-size: 13px; margin-bottom: 24px; }
  h2 { font-size: 14px; font-weight: bold; margin: 20px 0 8px; border-bottom: 1px solid #ddd; padding-bottom: 4px; }
  .scope { background: #f9f9f9; border: 1px solid #e0e0e0; padding: 10px 14px; border-radius: 4px; margin-bottom: 20px; white-space: pre-wrap; line-height: 1.5; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  th { background: #f0f0f0; text-align: left; padding: 7px 10px; border: 1px solid #ddd; font-weight: bold; }
  td { padding: 6px 10px; border: 1px solid #ddd; }
  tr:nth-child(even) td { background: #fafafa; }
  .totals { margin-top: 16px; float: right; width: 260px; }
  .totals-row { display: flex; justify-content: space-between; padding: 5px 0; border-bottom: 1px solid #eee; }
  .totals-row.total { font-weight: bold; font-size: 14px; border-bottom: 2px solid #111; }
  .clearfix::after { content: ""; display: table; clear: both; }
  @media print { body { padding: 20px; } }
</style>
</head>
<body>
<h1>Proposal — ${workOrder?.workOrderNumber}</h1>
<div class="subtitle">${workOrder?.clientName || "Unknown Client"} &nbsp;·&nbsp; ${address}</div>

<h2>Description of Work</h2>
<div class="scope">${scopeOfWork || "—"}</div>

<h2>Line Items</h2>
<table>
  <thead>
    <tr>
      <th>Charge Type</th><th>Item</th><th>Option</th><th>Description</th>
      <th style="text-align:right">Rate ($)</th><th style="text-align:right">Qty</th>
      <th style="text-align:right">Total ($)</th>
    </tr>
  </thead>
  <tbody>
    ${lines.map(l => `<tr>
      <td>${l.chargeType}</td><td>${l.item}</td><td>${l.option}</td><td>${l.description}</td>
      <td style="text-align:right">${parseFloat(l.rate || "0").toFixed(2)}</td>
      <td style="text-align:right">${l.qty}</td>
      <td style="text-align:right">${lineTotal(l).toFixed(2)}</td>
    </tr>`).join("")}
  </tbody>
</table>

<div class="clearfix">
  <div class="totals">
    <div class="totals-row"><span>Sub Total</span><span>USD ${subTotal.toFixed(2)}</span></div>
    <div class="totals-row total"><span>Total Cost</span><span>USD ${totalCost.toFixed(2)}</span></div>
  </div>
</div>

<p style="margin-top:60px; color:#666; font-size:11px;">Generated on ${new Date().toLocaleDateString("en-US", { year:"numeric", month:"long", day:"numeric" })}</p>
</body>
</html>`;
    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(html);
    win.document.close();
    win.focus();
    setTimeout(() => { win.print(); }, 300);
  };

  const updateLine = (i: number, field: keyof LineItem, value: string) => {
    setLines(prev => {
      const next = [...prev];
      next[i] = { ...next[i], [field]: value };
      return next;
    });
  };

  const addLine = () => setLines(prev => [...prev, createEmptyLine()]);

  const removeLine = (i: number) =>
    setLines(prev => prev.length === 1 ? prev : prev.filter((_, idx) => idx !== i));

  const getStatusColor = (status: string) => {
    if (status === "approved") return "bg-green-100 text-green-800";
    if (status === "cancelled" || status === "rejected") return "bg-red-100 text-red-800";
    return "bg-yellow-100 text-yellow-800";
  };

  const nte = parseFloat(workOrder?.nte || "0");
  const tnte = parseFloat(workOrder?.tnte || "0");
  const overNte = nte > 0 && totalCost > nte;
  const overTnte = tnte > 0 && totalCost > tnte;

  if (isLoading) {
    return (
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader><DialogTitle>Loading Proposal</DialogTitle></DialogHeader>
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
            <span className="ml-3">Loading...</span>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[1100px] max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-start justify-between gap-4">
            <div>
              <DialogTitle className="text-xl">
                Proposal — {workOrder?.workOrderNumber || "—"}
              </DialogTitle>
              <DialogDescription className="mt-1">
                {workOrder?.clientName || "Unknown Client"}&nbsp;·&nbsp;
                {[workOrder?.street, workOrder?.city].filter(Boolean).join(", ") || workOrder?.location || "—"}
              </DialogDescription>
            </div>
            {proposal && (
              <Badge className={getStatusColor(proposal.status)}>
                {proposal.status.charAt(0).toUpperCase() + proposal.status.slice(1)}
              </Badge>
            )}
          </div>
        </DialogHeader>

        <div className="space-y-6 pt-2">

          {/* Scope of Work */}
          <div className="space-y-1.5">
            <Label htmlFor="scope">Description of work performed</Label>
            <Textarea
              id="scope"
              rows={3}
              placeholder={"Scope of work\nDescribe tasks to be performed..."}
              value={scopeOfWork}
              onChange={e => setScopeOfWork(e.target.value)}
              className="resize-none"
            />
          </div>

          {/* Line Items Table */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-muted-foreground">All values shown are in USD</p>
              <Button size="sm" onClick={addLine} type="button">
                <Plus className="h-4 w-4 mr-1" /> Add Line
              </Button>
            </div>

            {/* Table Header */}
            <div className="rounded-md border overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/50 border-b">
                    <th className="text-left px-3 py-2 font-medium w-36">Charge Type</th>
                    <th className="text-left px-3 py-2 font-medium w-28">Item</th>
                    <th className="text-left px-3 py-2 font-medium w-36">Option</th>
                    <th className="text-left px-3 py-2 font-medium">Description</th>
                    <th className="text-right px-3 py-2 font-medium w-24">Rate ($)</th>
                    <th className="text-right px-3 py-2 font-medium w-20">Qty</th>
                    <th className="text-right px-3 py-2 font-medium w-24">Total ($)</th>
                    <th className="w-10" />
                  </tr>
                </thead>
                <tbody>
                  {lines.map((line, i) => (
                    <tr key={i} className="border-b last:border-0 hover:bg-muted/20">
                      <td className="px-2 py-1.5">
                        <Select
                          value={line.chargeType}
                          onValueChange={v => updateLine(i, "chargeType", v)}
                        >
                          <SelectTrigger className="h-8 text-xs">
                            <SelectValue placeholder="Select…" />
                          </SelectTrigger>
                          <SelectContent>
                            {CHARGE_TYPES.map(ct => (
                              <SelectItem key={ct} value={ct}>{ct}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="px-2 py-1.5">
                        <Input
                          className="h-8 text-xs"
                          placeholder="Standard"
                          value={line.item}
                          onChange={e => updateLine(i, "item", e.target.value)}
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <Input
                          className="h-8 text-xs"
                          placeholder="Standard"
                          value={line.option}
                          onChange={e => updateLine(i, "option", e.target.value)}
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <Input
                          className="h-8 text-xs"
                          placeholder="Description…"
                          value={line.description}
                          onChange={e => updateLine(i, "description", e.target.value)}
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <Input
                          className="h-8 text-xs text-right"
                          type="number"
                          step="0.01"
                          min="0"
                          placeholder="0.00"
                          value={line.rate}
                          onChange={e => updateLine(i, "rate", e.target.value)}
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <Input
                          className="h-8 text-xs text-right"
                          type="number"
                          step="0.001"
                          min="0"
                          placeholder="0"
                          value={line.qty}
                          onChange={e => updateLine(i, "qty", e.target.value)}
                        />
                      </td>
                      <td className="px-3 py-1.5 text-right font-medium tabular-nums">
                        {lineTotal(line).toFixed(2)}
                      </td>
                      <td className="px-1 py-1.5 text-center">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-destructive"
                          onClick={() => removeLine(i)}
                          disabled={lines.length === 1}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Totals Block */}
          <div className="flex justify-end">
            <div className="w-64 space-y-1 text-sm">
              <div className="flex justify-between py-1">
                <span className="text-muted-foreground">Sub Total</span>
                <span className="font-medium tabular-nums">USD {subTotal.toFixed(2)}</span>
              </div>
              <Separator />
              <div className="flex justify-between py-1 font-semibold">
                <span>Total Cost</span>
                <span className="tabular-nums">USD {totalCost.toFixed(2)}</span>
              </div>
              {nte > 0 && (
                <div className={`flex justify-between py-0.5 text-xs ${overNte ? "text-red-600" : "text-green-600"}`}>
                  <span>NTE limit</span>
                  <span className="tabular-nums">
                    USD {nte.toFixed(2)} {overNte ? `(OVER by $${(totalCost - nte).toFixed(2)})` : `($${(nte - totalCost).toFixed(2)} left)`}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* NTE Warning */}
          {(overNte || overTnte) && (
            <Alert className="border-red-300 bg-red-50">
              <AlertTriangle className="h-4 w-4 text-red-600" />
              <AlertDescription className="text-red-800">
                <strong>NTE Limit Exceeded.</strong>{" "}
                {overNte && `This proposal ($${totalCost.toFixed(2)}) exceeds the NTE of $${nte.toFixed(2)} by $${(totalCost - nte).toFixed(2)}.`}
                {overTnte && ` TNTE is $${tnte.toFixed(2)}.`}
                {" "}Client approval may be required.
              </AlertDescription>
            </Alert>
          )}

          <Separator />

          {/* Action Buttons */}
          <div className="flex items-center justify-between pt-2">
            <div className="flex gap-2">
              {proposal && proposal.status === "pending" && (
                <AdvancedPermissionGuard permission="proposals.approve">
                  <>
                    <Button
                      onClick={() => updateStatusMutation.mutate("approved")}
                      disabled={updateStatusMutation.isPending}
                      className="bg-green-600 hover:bg-green-700"
                    >
                      Approve
                    </Button>
                    <Button
                      variant="destructive"
                      onClick={() => updateStatusMutation.mutate("cancelled")}
                      disabled={updateStatusMutation.isPending}
                    >
                      Reject
                    </Button>
                  </>
                </AdvancedPermissionGuard>
              )}
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={onClose}>
                Cancel
              </Button>
              {proposal && (
                <Button type="button" variant="outline" onClick={handlePrint}>
                  <Printer className="h-4 w-4 mr-2" />
                  Print Proposal
                </Button>
              )}
              <Button
                type="button"
                onClick={handleSave}
                disabled={saveProposalMutation.isPending}
              >
                {saveProposalMutation.isPending ? "Saving…" : proposal ? "Update Proposal" : "Save Proposal"}
              </Button>
            </div>
          </div>

        </div>
      </DialogContent>
    </Dialog>
  );
}
