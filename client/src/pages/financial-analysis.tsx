import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TrendingUp, TrendingDown, DollarSign, Calculator, Eye, Search } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface WorkOrderFinancial {
  workOrder: any;
  proposal: any;
  invoice: any;
  proposalTotal: number;
  invoiceTotal: number;
  difference: number;
  isProfitable: boolean;
}

export default function FinancialAnalysis() {
  const [selectedPeriod, setSelectedPeriod] = useState("all");
  const [viewingWorkOrder, setViewingWorkOrder] = useState<WorkOrderFinancial | null>(null);
  const [searchTerm, setSearchTerm] = useState("");

  const { data: workOrders = [] } = useQuery({
    queryKey: ["/api/work-orders"],
  });

  const { data: proposals = [] } = useQuery({
    queryKey: ["/api/proposals"],
  });

  const { data: invoices = [] } = useQuery({
    queryKey: ["/api/invoices/all"],
  });

  const calculateProposalTotal = (proposal: any) => {
    if (!proposal) return 0;
    // Use saved totalCost first — always accurate
    if (proposal.totalCost) {
      const saved = parseFloat(String(proposal.totalCost));
      if (!isNaN(saved)) return saved;
    }
    try {
      if (proposal.laborData) {
        const parsed = JSON.parse(proposal.laborData);
        // New format: { lines, scopeOfWork, taxRate }
        if (parsed && parsed.lines && Array.isArray(parsed.lines)) {
          const sub = parsed.lines.reduce((sum: number, line: any) =>
            sum + (parseFloat(line.rate) || 0) * (parseFloat(line.qty) || 0), 0);
          const taxRate = parseFloat(parsed.taxRate) || 0;
          return sub * (1 + taxRate / 100);
        }
        // Old format: array of labor entries
        if (Array.isArray(parsed)) {
          const labor = parsed.reduce((sum: number, item: any) => {
            const payRate = parseFloat(item.payRate || "0");
            const regularHours = parseFloat(item.regularHours || "0");
            const otHours = parseFloat(item.otHours || "0");
            const otScale = parseFloat(item.otScale || "1.5");
            return sum + (payRate * regularHours) + (payRate * otHours * otScale);
          }, 0);
          const partsData = JSON.parse(proposal.partsData || "[]");
          const servicesData = JSON.parse(proposal.servicesData || "[]");
          const parts = partsData.reduce((sum: number, item: any) =>
            sum + (parseFloat(item.unitCost || "0") * parseFloat(item.quantity || "1")), 0);
          const services = servicesData.reduce((sum: number, item: any) =>
            sum + (parseFloat(item.unitCost || "0") * parseFloat(item.quantity || "1")), 0);
          return labor + parts + services;
        }
      }
    } catch { /* ignore */ }
    return parseFloat(String(proposal.laborCost || 0)) +
           parseFloat(String(proposal.materialCost || 0)) +
           parseFloat(String(proposal.additionalCosts || 0));
  };

  const calculateInvoiceTotal = (invoice: any) => {
    if (!invoice) return 0;
    return parseFloat(invoice.totalAmount || "0");
  };

  // Remove debug logging for production

  // Get financial data for paid invoices only
  const financialData: WorkOrderFinancial[] = workOrders
    .map((workOrder: any) => {
      const proposal = proposals.find((p: any) => p.workOrderId === workOrder.id);
      const invoice = invoices.find((i: any) => i.workOrderId === workOrder.id);
      
      // Only include if invoice exists and is paid
      if (!invoice || invoice.status !== "paid") return null;
      
      const proposalTotal = calculateProposalTotal(proposal);
      const invoiceTotal = calculateInvoiceTotal(invoice);
      const difference = invoiceTotal - proposalTotal;
      const isProfitable = difference > 0;
      
      return {
        workOrder,
        proposal,
        invoice,
        proposalTotal,
        invoiceTotal,
        difference: Math.abs(difference),
        isProfitable
      };
    })
    .filter(Boolean) as WorkOrderFinancial[];

  // Calculate totals from filtered data

  // Filter financial data based on search term
  const filteredFinancialData = financialData.filter((item) => {
    if (!searchTerm) return true;
    const searchLower = searchTerm.toLowerCase();
    return (
      item.workOrder.workOrderNumber.toLowerCase().includes(searchLower) ||
      item.workOrder.clientName.toLowerCase().includes(searchLower)
    );
  });

  // Calculate totals from all data (not filtered by search)
  const totalProfit = financialData
    .filter(item => item.isProfitable)
    .reduce((sum, item) => sum + item.difference, 0);
    
  const totalLoss = financialData
    .filter(item => !item.isProfitable)
    .reduce((sum, item) => sum + item.difference, 0);
    
  const netProfit = totalProfit - totalLoss;
  const totalRevenue = financialData.reduce((sum, item) => sum + item.invoiceTotal, 0);
  const profitMargin = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Financial Analysis</h1>
          <p className="text-muted-foreground">
            Profit and loss analysis from completed work orders with paid invoices
          </p>
        </div>
        
        <div className="flex items-center space-x-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
            <Input
              placeholder="Search by work order or client..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 w-64"
            />
          </div>
          <Select value={selectedPeriod} onValueChange={setSelectedPeriod}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Time</SelectItem>
              <SelectItem value="month">This Month</SelectItem>
              <SelectItem value="quarter">This Quarter</SelectItem>
              <SelectItem value="year">This Year</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${totalRevenue.toFixed(2)}</div>
            <p className="text-xs text-muted-foreground">
              From {financialData.length} completed orders
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Profit</CardTitle>
            <TrendingUp className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">${totalProfit.toFixed(2)}</div>
            <p className="text-xs text-muted-foreground">
              {financialData.filter(i => i.isProfitable).length} profitable orders
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Loss</CardTitle>
            <TrendingDown className="h-4 w-4 text-red-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">${totalLoss.toFixed(2)}</div>
            <p className="text-xs text-muted-foreground">
              {financialData.filter(i => !i.isProfitable).length} loss-making orders
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Net Profit</CardTitle>
            <Calculator className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${netProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              ${netProfit.toFixed(2)}
            </div>
            <p className="text-xs text-muted-foreground">
              {profitMargin.toFixed(1)}% profit margin
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Detailed Analysis */}
      <Card>
        <CardHeader>
          <CardTitle>Work Order Analysis</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {filteredFinancialData.length === 0 ? (
              <div className="text-center py-8">
                <Calculator className="h-12 w-12 mx-auto mb-4 text-gray-400" />
                <h3 className="text-lg font-medium mb-2">No Financial Data</h3>
                <p className="text-gray-600">No completed work orders with paid invoices found.</p>
              </div>
            ) : (
              filteredFinancialData.map((item) => (
                <div key={item.workOrder.id} className="flex items-center justify-between p-4 border rounded-lg">
                  <div className="flex-1">
                    <div className="flex items-center space-x-3">
                      <h3 className="font-medium">{item.workOrder.workOrderNumber}</h3>
                      <Badge variant={item.isProfitable ? "default" : "destructive"}>
                        {item.isProfitable ? "Profit" : "Loss"}
                      </Badge>
                    </div>
                    <p className="text-sm text-gray-600 mt-1">{item.workOrder.clientName}</p>
                    
                    <div className="grid grid-cols-3 gap-4 mt-3 text-sm">
                      <div>
                        <span className="text-gray-500">Proposal:</span>
                        <div className="font-medium">${item.proposalTotal.toFixed(2)}</div>
                      </div>
                      <div>
                        <span className="text-gray-500">Invoice:</span>
                        <div className="font-medium">${item.invoiceTotal.toFixed(2)}</div>
                      </div>
                      <div>
                        <span className="text-gray-500">{item.isProfitable ? "Profit:" : "Loss:"}</span>
                        <div className={`font-medium ${item.isProfitable ? 'text-green-600' : 'text-red-600'}`}>
                          ${item.difference.toFixed(2)}
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setViewingWorkOrder(item)}
                  >
                    <Eye className="h-4 w-4 mr-2" />
                    View Details
                  </Button>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>

      {/* Detail Modal */}
      {viewingWorkOrder && (
        <Dialog open={!!viewingWorkOrder} onOpenChange={() => setViewingWorkOrder(null)}>
          <DialogContent className="max-w-4xl">
            <DialogHeader>
              <DialogTitle>
                Financial Analysis - {viewingWorkOrder.workOrder.workOrderNumber}
              </DialogTitle>
            </DialogHeader>
            
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-6">
                {/* Proposal Breakdown */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Proposal Breakdown</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {viewingWorkOrder.proposal ? (
                      <div className="space-y-3">
                        {(() => {
                          try {
                            const laborData = JSON.parse(viewingWorkOrder.proposal.laborData || "[]");
                            const partsData = JSON.parse(viewingWorkOrder.proposal.partsData || "[]");
                            const servicesData = JSON.parse(viewingWorkOrder.proposal.servicesData || "[]");
                            
                            const laborTotal = laborData.reduce((sum: number, item: any) => {
                              const payRate = parseFloat(item.payRate || "0");
                              const regularHours = parseFloat(item.regularHours || "0");
                              const otHours = parseFloat(item.otHours || "0");
                              const otScale = parseFloat(item.otScale || "1.5");
                              return sum + (payRate * regularHours) + (payRate * otHours * otScale);
                            }, 0);
                            
                            const partsTotal = partsData.reduce((sum: number, item: any) => 
                              sum + (parseFloat(item.unitCost || "0") * parseInt(item.quantity || "1")), 0);
                            
                            const servicesTotal = servicesData.reduce((sum: number, item: any) => 
                              sum + (parseFloat(item.unitCost || "0") * parseInt(item.quantity || "1")), 0);
                            
                            return (
                              <>
                                <div className="flex justify-between">
                                  <span>Labor:</span>
                                  <span className="font-medium">${laborTotal.toFixed(2)}</span>
                                </div>
                                <div className="flex justify-between">
                                  <span>Parts:</span>
                                  <span className="font-medium">${partsTotal.toFixed(2)}</span>
                                </div>
                                <div className="flex justify-between">
                                  <span>Services:</span>
                                  <span className="font-medium">${servicesTotal.toFixed(2)}</span>
                                </div>
                                <div className="border-t pt-2 flex justify-between font-bold">
                                  <span>Total:</span>
                                  <span>${viewingWorkOrder.proposalTotal.toFixed(2)}</span>
                                </div>
                              </>
                            );
                          } catch {
                            return <p className="text-gray-500">Unable to parse proposal data</p>;
                          }
                        })()}
                      </div>
                    ) : (
                      <p className="text-gray-500">No proposal found</p>
                    )}
                  </CardContent>
                </Card>

                {/* Invoice Breakdown */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Invoice Breakdown</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {viewingWorkOrder.invoice ? (
                      <div className="space-y-3">
                        <div className="flex justify-between">
                          <span>Labor Cost:</span>
                          <span className="font-medium">${parseFloat(viewingWorkOrder.invoice.laborCost || "0").toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Material Cost:</span>
                          <span className="font-medium">${parseFloat(viewingWorkOrder.invoice.materialCost || "0").toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Tax ({viewingWorkOrder.invoice.taxRate || "0"}%):</span>
                          <span className="font-medium">${parseFloat(viewingWorkOrder.invoice.taxAmount || "0").toFixed(2)}</span>
                        </div>
                        <div className="border-t pt-2 flex justify-between font-bold">
                          <span>Total:</span>
                          <span>${viewingWorkOrder.invoiceTotal.toFixed(2)}</span>
                        </div>
                      </div>
                    ) : (
                      <p className="text-gray-500">No invoice found</p>
                    )}
                  </CardContent>
                </Card>
              </div>

              {/* Profit/Loss Analysis */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Financial Impact</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-3 gap-6 text-center">
                    <div>
                      <div className="text-sm text-gray-500">Proposal Total</div>
                      <div className="text-2xl font-bold text-blue-600">${viewingWorkOrder.proposalTotal.toFixed(2)}</div>
                    </div>
                    <div>
                      <div className="text-sm text-gray-500">Invoice Total</div>
                      <div className="text-2xl font-bold text-purple-600">${viewingWorkOrder.invoiceTotal.toFixed(2)}</div>
                    </div>
                    <div>
                      <div className="text-sm text-gray-500">{viewingWorkOrder.isProfitable ? "Profit" : "Loss"}</div>
                      <div className={`text-2xl font-bold ${viewingWorkOrder.isProfitable ? 'text-green-600' : 'text-red-600'}`}>
                        ${viewingWorkOrder.difference.toFixed(2)}
                      </div>
                    </div>
                  </div>
                  
                  <div className="mt-4 p-4 rounded-lg bg-gray-50">
                    <p className="text-sm">
                      {viewingWorkOrder.isProfitable ? (
                        <>You made <strong className="text-green-600">${viewingWorkOrder.difference.toFixed(2)}</strong> profit on this work order because the invoice amount was higher than the proposed amount.</>
                      ) : (
                        <>You lost <strong className="text-red-600">${viewingWorkOrder.difference.toFixed(2)}</strong> on this work order because the invoice amount was lower than the proposed amount.</>
                      )}
                    </p>
                  </div>
                </CardContent>
              </Card>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}