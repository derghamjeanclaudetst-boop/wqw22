import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DollarSign, Eye, Calculator, TrendingUp, Download } from "lucide-react";
import { PageGuard } from "@/components/rbac/advanced-permission-guard";
import { exportToCSV } from "@/lib/export";

interface Technician {
  id: number;
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  location: string;
  hourlyRate: string;
  paymentMethods: string;
  paymentDetails: string;
}

interface PaymentRequest {
  id: number;
  workOrderId: number;
  technicianId: number;
  paymentMethod: string;
  amountRequested: string;
  amountApproved: string;
  amountPaid: string;
  status: string;
  description: string;
  requestedAt: string;
  workOrderNumber: string;
}

interface TechnicianPaymentSummary {
  technician: Technician;
  totalRequested: number;
  totalApproved: number;
  totalPaid: number;
  totalOwed: number;
  paymentCount: number;
  payments: PaymentRequest[];
}

export default function TechnicianPayments() {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedTechnician, setSelectedTechnician] = useState<TechnicianPaymentSummary | null>(null);
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);

  const { data: technicians = [] } = useQuery<Technician[]>({
    queryKey: ["/api/technicians"],
  });

  const { data: allPayments = [] } = useQuery<PaymentRequest[]>({
    queryKey: ["/api/payments/all"],
  });

  // Calculate payment summaries for each technician
  const technicianSummaries: TechnicianPaymentSummary[] = technicians.map(technician => {
    const technicianPayments = allPayments.filter(payment => payment.technicianId === technician.id);
    
    const totalRequested = technicianPayments.reduce((sum, payment) => 
      sum + parseFloat(payment.amountRequested || "0"), 0);
    const totalApproved = technicianPayments.reduce((sum, payment) => 
      sum + parseFloat(payment.amountApproved || "0"), 0);
    const totalPaid = technicianPayments.reduce((sum, payment) => 
      sum + parseFloat(payment.amountPaid || "0"), 0);
    const totalOwed = totalApproved - totalPaid;

    return {
      technician,
      totalRequested,
      totalApproved,
      totalPaid,
      totalOwed,
      paymentCount: technicianPayments.length,
      payments: technicianPayments.sort((a, b) => 
        new Date(b.requestedAt).getTime() - new Date(a.requestedAt).getTime())
    };
  });

  // Calculate overall totals
  const overallTotals = technicianSummaries.reduce((totals, summary) => ({
    totalRequested: totals.totalRequested + summary.totalRequested,
    totalApproved: totals.totalApproved + summary.totalApproved,
    totalPaid: totals.totalPaid + summary.totalPaid,
    totalOwed: totals.totalOwed + summary.totalOwed,
    totalPayments: totals.totalPayments + summary.paymentCount
  }), { totalRequested: 0, totalApproved: 0, totalPaid: 0, totalOwed: 0, totalPayments: 0 });

  const handleViewHistory = (summary: TechnicianPaymentSummary) => {
    setSelectedTechnician(summary);
    setIsHistoryModalOpen(true);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "paid": return "bg-green-100 text-green-800";
      case "partially_paid": return "bg-yellow-100 text-yellow-800";
      case "approved": return "bg-blue-100 text-blue-800";
      case "rejected": return "bg-red-100 text-red-800";
      default: return "bg-gray-100 text-gray-800";
    }
  };

  return (
    <PageGuard pageName="payments">
      <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">Technician Payments Overview</h1>
        <Button
          variant="outline"
          onClick={() => {
            const rows = technicianSummaries.map((s) => ({
              "Technician": `${s.technician.firstName} ${s.technician.lastName}`,
              Email: s.technician.email,
              Phone: s.technician.phone,
              "# Requests": s.paymentCount,
              "Total Requested ($)": s.totalRequested.toFixed(2),
              "Total Approved ($)": s.totalApproved.toFixed(2),
              "Total Paid ($)": s.totalPaid.toFixed(2),
              "Amount Owed ($)": s.totalOwed.toFixed(2),
            }));
            exportToCSV(rows, "technician_payments");
          }}
        >
          <Download className="h-4 w-4 mr-2" />
          Export CSV
        </Button>
      </div>

      {/* Overall Statistics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Requested</CardTitle>
            <Calculator className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${overallTotals.totalRequested.toFixed(2)}</div>
            <p className="text-xs text-muted-foreground">
              {overallTotals.totalPayments} total requests
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Approved</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${overallTotals.totalApproved.toFixed(2)}</div>
            <p className="text-xs text-muted-foreground">
              Ready for payment
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Paid</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${overallTotals.totalPaid.toFixed(2)}</div>
            <p className="text-xs text-muted-foreground">
              Already disbursed
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Amount Owed</CardTitle>
            <DollarSign className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">${overallTotals.totalOwed.toFixed(2)}</div>
            <p className="text-xs text-muted-foreground">
              Pending payment
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Technician Payment Summary Table */}
      <Card>
        <CardHeader>
          <CardTitle>Technician Payment Summary</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Technician</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead>Requests</TableHead>
                <TableHead>Requested</TableHead>
                <TableHead>Approved</TableHead>
                <TableHead>Paid</TableHead>
                <TableHead>Owed</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {technicianSummaries.map((summary) => (
                <TableRow key={summary.technician.id}>
                  <TableCell className="font-medium">
                    {summary.technician.firstName} {summary.technician.lastName}
                  </TableCell>
                  <TableCell>
                    <div className="text-sm">
                      <div>{summary.technician.phone}</div>
                      <div className="text-gray-600">{summary.technician.email}</div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">
                      {summary.paymentCount}
                    </Badge>
                  </TableCell>
                  <TableCell>${summary.totalRequested.toFixed(2)}</TableCell>
                  <TableCell>${summary.totalApproved.toFixed(2)}</TableCell>
                  <TableCell>${summary.totalPaid.toFixed(2)}</TableCell>
                  <TableCell>
                    <span className={summary.totalOwed > 0 ? "text-red-600 font-medium" : "text-green-600"}>
                      ${summary.totalOwed.toFixed(2)}
                    </span>
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleViewHistory(summary)}
                      disabled={summary.paymentCount === 0}
                    >
                      <Eye className="h-4 w-4 mr-1" />
                      History
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Payment History Modal */}
      <Dialog open={isHistoryModalOpen} onOpenChange={setIsHistoryModalOpen}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Payment History - {selectedTechnician?.technician.firstName} {selectedTechnician?.technician.lastName}
            </DialogTitle>
          </DialogHeader>
          
          {selectedTechnician && (
            <div className="space-y-4">
              {/* Technician Summary */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="text-center p-3 bg-gray-50 rounded">
                  <div className="text-lg font-bold">${selectedTechnician.totalRequested.toFixed(2)}</div>
                  <div className="text-sm text-gray-600">Total Requested</div>
                </div>
                <div className="text-center p-3 bg-blue-50 rounded">
                  <div className="text-lg font-bold">${selectedTechnician.totalApproved.toFixed(2)}</div>
                  <div className="text-sm text-gray-600">Total Approved</div>
                </div>
                <div className="text-center p-3 bg-green-50 rounded">
                  <div className="text-lg font-bold">${selectedTechnician.totalPaid.toFixed(2)}</div>
                  <div className="text-sm text-gray-600">Total Paid</div>
                </div>
                <div className="text-center p-3 bg-red-50 rounded">
                  <div className="text-lg font-bold text-red-600">${selectedTechnician.totalOwed.toFixed(2)}</div>
                  <div className="text-sm text-gray-600">Amount Owed</div>
                </div>
              </div>

              {/* Payment Details */}
              <div className="space-y-3">
                <h3 className="text-lg font-medium">Payment History</h3>
                {selectedTechnician.payments.length === 0 ? (
                  <p className="text-gray-500 text-center py-4">No payment requests found.</p>
                ) : (
                  selectedTechnician.payments.map((payment) => {
                    const paymentMethods = JSON.parse(payment.paymentMethod || "[]");
                    const requested = parseFloat(payment.amountRequested || "0");
                    const paid = parseFloat(payment.amountPaid || "0");
                    const remaining = Math.max(0, requested - paid);

                    return (
                      <Card key={payment.id} className="p-4">
                        <div className="flex justify-between items-start">
                          <div className="space-y-2">
                            <div className="flex items-center space-x-2">
                              <span className="font-medium">
                                Work Order: {payment.workOrderNumber}
                              </span>
                              <Badge className={getStatusColor(payment.status)}>
                                {payment.status.replace("_", " ")}
                              </Badge>
                            </div>
                            
                            <div className="text-sm text-gray-600">
                              <div>Payment Methods: {paymentMethods.join(", ")}</div>
                              <div>Description: {payment.description || "No description"}</div>
                              <div>Requested: {new Date(payment.requestedAt).toLocaleDateString()}</div>
                            </div>
                          </div>
                          
                          <div className="text-right">
                            <div className="text-lg font-medium">${requested.toFixed(2)}</div>
                            {payment.amountPaid && (
                              <div className="text-sm text-gray-600">
                                Paid: ${paid.toFixed(2)}
                              </div>
                            )}
                            {remaining > 0 && (
                              <div className="text-sm text-red-600">
                                Remaining: ${remaining.toFixed(2)}
                              </div>
                            )}
                          </div>
                        </div>
                      </Card>
                    );
                  })
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
      </div>
    </PageGuard>
  );
}