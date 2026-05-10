import { useState } from "react";
import { useLocation } from "wouter";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar, MapPin, User, FileText, MessageSquare, CreditCard, Receipt, Upload, Hammer, DollarSign, Plus, CheckCircle2, Clock, XCircle, AlertCircle, ChevronRight, Pencil, Phone, Mail, Building2, AlertTriangle, Wrench, ClipboardList, Save, X as XIcon, FileSignature, ExternalLink } from "lucide-react";
import { getStatusBadgeClass, getStatusInfo, PRIMARY_STATUSES } from "@/lib/work-order-statuses";
import { AdvancedPermissionGuard, TabGuard, ButtonGuard } from "@/components/rbac/advanced-permission-guard";
import { WorkOrderProposalModal } from "@/components/modals/work-order-proposal-modal";
import { PartsRequestModal } from "@/components/modals/parts-request-modal";
import { FileUploadModal } from "@/components/modals/file-upload-modal";
import { ChatModal } from "@/components/modals/chat-modal";
import { PaymentRequestModalNew as PaymentRequestModal } from "@/components/modals/payment-request-modal-new";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import type { Technician } from "@shared/schema";
import { InvoiceManagement } from "../invoice-management";

import { useAuth } from "@/hooks/use-auth";
import type { WorkOrderWithUsers } from "@shared/schema";

interface WorkOrderDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  workOrder: WorkOrderWithUsers;
}

const paymentRequestSchema = z.object({
  technicianId: z.number().min(1, "Technician is required"),
  paymentMethods: z.array(z.string()).min(1, "At least one payment method is required"),
  amountRequested: z.string().min(1, "Amount is required").refine(
    (val) => !isNaN(parseFloat(val)) && parseFloat(val) > 0,
    "Amount must be a positive number"
  ),
  description: z.string().optional(),
});

type PaymentRequestFormData = z.infer<typeof paymentRequestSchema>;

export function WorkOrderDetailsModal({ isOpen, onClose, workOrder }: WorkOrderDetailsModalProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();
  
  const [activeTab, setActiveTab] = useState("overview");
  const [isProposalModalOpen, setIsProposalModalOpen] = useState(false);
  const [isPaymentRequestModalOpen, setIsPaymentRequestModalOpen] = useState(false);
  const [isPartsRequestModalOpen, setIsPartsRequestModalOpen] = useState(false);
  const [isFileUploadModalOpen, setIsFileUploadModalOpen] = useState(false);
  const [isChatModalOpen, setIsChatModalOpen] = useState(false);
  const [isPaymentRequestOpen, setIsPaymentRequestOpen] = useState(false);
  const [isViewProposalModalOpen, setIsViewProposalModalOpen] = useState(false);
  const [isViewPartsModalOpen, setIsViewPartsModalOpen] = useState(false);
  const [isViewFilesModalOpen, setIsViewFilesModalOpen] = useState(false);
  const [isViewChatModalOpen, setIsViewChatModalOpen] = useState(false);
  const [isViewPaymentModalOpen, setIsViewPaymentModalOpen] = useState(false);

  // NTE / TNTE inline edit state
  const [editingNte, setEditingNte] = useState(false);
  const [editingTnte, setEditingTnte] = useState(false);
  const [nteValue, setNteValue] = useState(workOrder?.nte || "");
  const [tnteValue, setTnteValue] = useState(workOrder?.tnte || "");

  const updateFinancialMutation = useMutation({
    mutationFn: (data: { nte?: string; tnte?: string }) =>
      apiRequest("PUT", `/api/work-orders/${workOrder.id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/work-orders"] });
      toast({ title: "Saved", description: "Financial details updated." });
      setEditingNte(false);
      setEditingTnte(false);
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to update", variant: "destructive" });
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: (status: string) =>
      apiRequest("PUT", `/api/work-orders/${workOrder.id}`, { status }),
    onSuccess: (_data, status) => {
      queryClient.invalidateQueries({ queryKey: ["/api/work-orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/work-orders-without-proposals"] });
      const info = getStatusInfo(status);
      toast({ title: "Status Updated", description: `Work order status set to "${info.label}".` });
      if (status === "needs_proposal") {
        toast({
          title: "Proposal Required",
          description: "This work order has been flagged for a proposal. Head to the Proposals page to create it.",
        });
      }
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to update status", variant: "destructive" });
    },
  });

  const { data: technicians = [] } = useQuery<Technician[]>({
    queryKey: ["/api/technicians"],
  });

  const { data: proposalData } = useQuery({
    queryKey: [`/api/work-orders/${workOrder?.id}/proposal`],
    enabled: !!workOrder?.id,
  });

  const { data: partsRequests = [] } = useQuery({
    queryKey: [`/api/work-orders/${workOrder?.id}/parts-requests`],
    enabled: !!workOrder?.id,
  });

  const { data: workOrderFiles = [] } = useQuery({
    queryKey: [`/api/work-orders/${workOrder?.id}/files`],
    enabled: !!workOrder?.id,
  });

  const { data: workOrderChats = [] } = useQuery({
    queryKey: [`/api/work-orders/${workOrder?.id}/chats`],
    enabled: !!workOrder?.id,
  });



  const { data: existingPayments = [] } = useQuery({
    queryKey: [`/api/work-orders/${workOrder?.id}/payments`],
    enabled: !!workOrder?.id,
  });

  const { data: invoiceData } = useQuery({
    queryKey: [`/api/work-orders/${workOrder?.id}/invoice`],
    enabled: !!workOrder?.id,
  });

  const paymentForm = useForm<PaymentRequestFormData>({
    resolver: zodResolver(paymentRequestSchema),
    defaultValues: {
      technicianId: 0,
      paymentMethods: [],
      amountRequested: "",
      description: "",
    },
  });

  const [selectedTechnician, setSelectedTechnician] = useState<Technician | null>(null);
  const [selectedPaymentMethods, setSelectedPaymentMethods] = useState<string[]>([]);

  // Available payment methods with details
  const paymentMethodsInfo = {
    bank_transfer: {
      name: "Bank Transfer",
      description: "Direct bank account transfer",
      icon: "🏦",
      details: ["Account Number", "Routing Number", "Bank Name"]
    },
    cash: {
      name: "Cash",
      description: "Cash payment on-site", 
      icon: "💵",
      details: ["On-site pickup location"]
    },
    check: {
      name: "Check",
      description: "Physical or digital check",
      icon: "📋",
      details: ["Payable to", "Mailing address"]
    },
    digital_wallet: {
      name: "Digital Wallet",
      description: "PayPal, Venmo, CashApp, etc.",
      icon: "📱",
      details: ["PayPal Link", "Venmo", "CashApp", "Zelle", "QR Code"]
    },
    wire_transfer: {
      name: "Wire Transfer", 
      description: "International wire transfer",
      icon: "🌐",
      details: ["SWIFT Code", "Account Details", "Bank Address"]
    }
  };

  // Get technician's available payment methods
  const getAvailablePaymentMethods = (technician: Technician) => {
    try {
      return technician.paymentMethods ? JSON.parse(technician.paymentMethods) : ["bank_transfer", "cash"];
    } catch {
      return ["bank_transfer", "cash"];
    }
  };

  // Get technician's payment details
  const getPaymentDetails = (technician: Technician) => {
    try {
      return technician.paymentDetails ? JSON.parse(technician.paymentDetails) : {};
    } catch {
      return {};
    }
  };



  const createPaymentMutation = useMutation({
    mutationFn: (data: PaymentRequestFormData) => 
      apiRequest("POST", "/api/payments", {
        workOrderId: workOrder.id,
        technicianId: data.technicianId,
        paymentMethod: JSON.stringify(data.paymentMethods),
        amountRequested: data.amountRequested,
        description: data.description || "",
      }),
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Payment request created successfully",
      });
      setIsPaymentRequestOpen(false);
      paymentForm.reset();
      setSelectedTechnician(null);
      setSelectedPaymentMethods([]);
      // Invalidate payment cache to refresh payment manager and work order payments
      queryClient.invalidateQueries({ queryKey: ["/api/payments/all"] });
      queryClient.invalidateQueries({ queryKey: [`/api/work-orders/${workOrder.id}/payments`] });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create payment request",
        variant: "destructive",
      });
    },
  });

  const handlePaymentSubmit = (data: PaymentRequestFormData) => {
    console.log("Submitting payment request:", data);
    console.log("Selected payment methods:", selectedPaymentMethods);
    createPaymentMutation.mutate({
      ...data,
      paymentMethods: selectedPaymentMethods
    });
  };

  const handleTechnicianChange = (value: string) => {
    const technicianId = parseInt(value);
    const technician = technicians.find(t => t.id === technicianId);
    setSelectedTechnician(technician || null);
    setSelectedPaymentMethods([]);
    paymentForm.setValue("technicianId", technicianId);
    paymentForm.setValue("paymentMethods", []);
  };

  const handlePaymentMethodToggle = (method: string, checked: boolean) => {
    const newMethods = checked 
      ? [...selectedPaymentMethods, method]
      : selectedPaymentMethods.filter(m => m !== method);
    
    setSelectedPaymentMethods(newMethods);
    paymentForm.setValue("paymentMethods", newMethods);
  };


  const getStatusColor = (status: string) => getStatusBadgeClass(status);

  const formatDate = (date: Date) => {
    return new Date(date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  const formatCurrency = (amount: string) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(parseFloat(amount));
  };

  // For now, allow all authenticated users to view work order details
  // The backend already has proper permission checking on the API endpoints
  const canAccess = true;

  if (!canAccess) {
    return (
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>Access Denied</DialogTitle>
          </DialogHeader>
          <div className="text-center py-8">
            <p className="text-gray-600">You don't have permission to view this work order.</p>
            <Button onClick={onClose} className="mt-4">Close</Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[900px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-start justify-between gap-4">
            <div>
              <DialogTitle className="text-xl font-bold text-blue-600">
                {workOrder.workOrderNumber}
              </DialogTitle>
              <p className="text-lg font-medium text-gray-900 mt-1">
                {workOrder.clientName}
              </p>
            </div>
            {/* Status selector */}
            <div className="shrink-0">
              {workOrder.isLocked ? (
                <Badge className={getStatusColor(workOrder.status)}>
                  {getStatusInfo(workOrder.status).label}
                </Badge>
              ) : (
                <Select
                  value={workOrder.status}
                  onValueChange={v => updateStatusMutation.mutate(v)}
                  disabled={updateStatusMutation.isPending}
                >
                  <SelectTrigger className={`h-7 text-xs border-0 font-semibold px-2 w-auto ${getStatusColor(workOrder.status)}`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="max-h-80">
                    {PRIMARY_STATUSES.map(s => (
                      <SelectItem key={s.value} value={s.value} className="text-xs">
                        <span className={`inline-block px-1.5 py-0.5 rounded text-xs font-medium ${s.color} ${s.textColor}`}>
                          {s.label}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          </div>
        </DialogHeader>

        {/* Lock notification if work order is locked */}
        {workOrder.isLocked && (
          <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg">
            <div className="flex items-center gap-2 text-red-800">
              <Receipt className="h-5 w-5" />
              <span className="font-medium">Work Order Locked</span>
            </div>
            <p className="text-red-700 text-sm mt-1">
              This work order is locked because its invoice has been marked as paid. 
              All editing, creation, and modification functions are disabled. Data is read-only.
            </p>
          </div>
        )}

        {/* Needs Proposal banner */}
        {workOrder.status === "needs_proposal" && !workOrder.isLocked && (
          <div className="mb-4 p-4 bg-amber-50 border border-amber-300 rounded-lg">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-2 text-amber-900">
                <FileSignature className="h-5 w-5 shrink-0" />
                <div>
                  <p className="font-semibold text-sm">Proposal Required</p>
                  <p className="text-xs text-amber-800 mt-0.5">
                    This work order has been flagged as needing a proposal. Go to the Proposals page to create one.
                  </p>
                </div>
              </div>
              <Button
                size="sm"
                className="shrink-0 bg-amber-600 hover:bg-amber-700 text-white gap-1.5"
                onClick={() => { onClose(); navigate("/proposals"); }}
              >
                <ExternalLink className="h-3.5 w-3.5" />
                Go to Proposals
              </Button>
            </div>
          </div>
        )}

        {/* ── Work Order Stage Pipeline ── */}
        {(() => {
          const proposalStatus: string = !proposalData
            ? "none"
            : proposalData.status === "approved"
            ? "approved"
            : proposalData.status === "rejected"
            ? "rejected"
            : "pending";

          const partsArr = Array.isArray(partsRequests) ? partsRequests : [];
          const partsStatus: string =
            partsArr.length === 0
              ? "none"
              : partsArr.every((r: any) => r.status === "received" || r.status === "approved")
              ? "done"
              : partsArr.some((r: any) => r.status === "ordered" || r.status === "approved")
              ? "ordered"
              : "pending";

          const paymentsArr = Array.isArray(existingPayments) ? existingPayments : [];
          const paymentStatus: string =
            paymentsArr.length === 0
              ? "none"
              : paymentsArr.every((p: any) => p.status === "paid")
              ? "paid"
              : paymentsArr.some((p: any) => p.status === "approved" || p.status === "partially_paid")
              ? "approved"
              : "pending";

          const invoiceStatus: string = !(invoiceData as any)
            ? "none"
            : (invoiceData as any).status === "paid"
            ? "paid"
            : (invoiceData as any).status === "sent"
            ? "sent"
            : "created";

          type StageState = "none" | "pending" | "approved" | "rejected" | "done" | "ordered" | "paid" | "sent" | "created";

          const stages: { label: string; icon: any; state: StageState; detail: string }[] = [
            {
              label: "Proposal",
              icon: FileText,
              state: proposalStatus as StageState,
              detail:
                proposalStatus === "none" ? "Not created"
                : proposalStatus === "pending" ? "Under review"
                : proposalStatus === "approved" ? "Approved"
                : "Rejected",
            },
            {
              label: "Parts",
              icon: Hammer,
              state: partsStatus as StageState,
              detail:
                partsStatus === "none" ? "Not requested"
                : partsStatus === "pending" ? `${partsArr.length} request${partsArr.length > 1 ? "s" : ""} pending`
                : partsStatus === "ordered" ? "Ordered / In progress"
                : `${partsArr.length} request${partsArr.length > 1 ? "s" : ""} fulfilled`,
            },
            {
              label: "Invoice",
              icon: Receipt,
              state: invoiceStatus as StageState,
              detail:
                invoiceStatus === "none" ? "Not created"
                : invoiceStatus === "created" ? "Draft created"
                : invoiceStatus === "sent" ? "Sent to client"
                : "Paid",
            },
            {
              label: "Payment",
              icon: CreditCard,
              state: paymentStatus as StageState,
              detail:
                paymentStatus === "none" ? "Not requested"
                : paymentStatus === "pending" ? `${paymentsArr.length} request${paymentsArr.length > 1 ? "s" : ""} pending`
                : paymentStatus === "approved" ? "Approved"
                : `${paymentsArr.length} payment${paymentsArr.length > 1 ? "s" : ""} paid`,
            },
          ];

          const getStageColor = (state: StageState) => {
            switch (state) {
              case "approved":
              case "done":
              case "paid":
                return { bg: "bg-green-100", border: "border-green-400", icon: "text-green-600", label: "text-green-700", dot: "bg-green-500" };
              case "pending":
              case "ordered":
              case "sent":
              case "created":
                return { bg: "bg-blue-100", border: "border-blue-400", icon: "text-blue-600", label: "text-blue-700", dot: "bg-blue-500" };
              case "rejected":
                return { bg: "bg-red-100", border: "border-red-400", icon: "text-red-600", label: "text-red-700", dot: "bg-red-500" };
              default:
                return { bg: "bg-gray-100", border: "border-gray-300", icon: "text-gray-400", label: "text-gray-500", dot: "bg-gray-300" };
            }
          };

          const getStageIcon = (state: StageState) => {
            switch (state) {
              case "approved":
              case "done":
              case "paid":
                return <CheckCircle2 className="h-5 w-5 text-green-600" />;
              case "rejected":
                return <XCircle className="h-5 w-5 text-red-600" />;
              case "pending":
              case "ordered":
              case "sent":
              case "created":
                return <Clock className="h-5 w-5 text-blue-600" />;
              default:
                return <AlertCircle className="h-5 w-5 text-gray-400" />;
            }
          };

          return (
            <div className="mb-6 p-4 bg-white border border-gray-200 rounded-xl shadow-sm">
              <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">Work Order Progress</h3>
              <div className="flex items-stretch gap-0">
                {stages.map((stage, idx) => {
                  const colors = getStageColor(stage.state);
                  const Icon = stage.icon;
                  return (
                    <div key={stage.label} className="flex items-center flex-1 min-w-0">
                      <div className={`flex-1 rounded-lg border-2 p-3 ${colors.bg} ${colors.border} flex flex-col items-center text-center gap-1`}>
                        <div className="flex items-center gap-1.5 mb-1">
                          <Icon className={`h-4 w-4 ${colors.icon}`} />
                          <span className="text-xs font-bold text-gray-700">{stage.label}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          {getStageIcon(stage.state)}
                        </div>
                        <p className={`text-xs font-medium ${colors.label} leading-tight`}>{stage.detail}</p>
                      </div>
                      {idx < stages.length - 1 && (
                        <ChevronRight className="h-5 w-5 text-gray-300 flex-shrink-0 mx-1" />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })()}

        {/* Action Buttons - Disabled when locked */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <ButtonGuard buttonType="create">
            <Button
              onClick={() => workOrder.isLocked ? toast({
                title: "Action Blocked",
                description: "Cannot create proposals - work order is locked due to paid invoice.",
                variant: "destructive"
              }) : setIsProposalModalOpen(true)}
              className="flex items-center justify-center gap-2"
              disabled={workOrder.isLocked}
            >
              <FileText className="h-4 w-4" />
              {workOrder.isLocked ? "Locked" : "Create Proposal"}
            </Button>
          </ButtonGuard>
          
          <ButtonGuard buttonType="create">
            <Button
              onClick={() => setActiveTab("invoice")}
              className="flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700"
            >
              <Receipt className="h-4 w-4" />
              View Invoice
            </Button>
          </ButtonGuard>
          
          <ButtonGuard buttonType="create">
            <Button
              onClick={() => workOrder.isLocked ? toast({
                title: "Action Blocked",
                description: "Cannot request parts - work order is locked due to paid invoice.",
                variant: "destructive"
              }) : setIsPartsRequestModalOpen(true)}
              className="flex items-center justify-center gap-2"
              disabled={workOrder.isLocked}
            >
              <Hammer className="h-4 w-4" />
              {workOrder.isLocked ? "Locked" : "Request Parts"}
            </Button>
          </ButtonGuard>
          
          <ButtonGuard buttonType="create">
            <Button
              onClick={() => workOrder.isLocked ? toast({
                title: "Action Blocked",
                description: "Cannot upload files - work order is locked due to paid invoice.",
                variant: "destructive"
              }) : setIsFileUploadModalOpen(true)}
              className="flex items-center justify-center gap-2"
              disabled={workOrder.isLocked}
            >
              <Upload className="h-4 w-4" />
              {workOrder.isLocked ? "Locked" : "Upload Files"}
            </Button>
          </ButtonGuard>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-7">
            <TabsTrigger value="overview" className="flex items-center gap-1">
              <FileText className="h-3 w-3" />
              Overview
            </TabsTrigger>
            <TabsTrigger value="proposal" className="flex items-center gap-1">
              <Receipt className="h-3 w-3" />
              Proposal
            </TabsTrigger>
            <TabsTrigger value="invoice" className="flex items-center gap-1">
              <DollarSign className="h-3 w-3" />
              Invoice
            </TabsTrigger>
            <TabsTrigger value="parts" className="flex items-center gap-1">
              <Hammer className="h-3 w-3" />
              Parts
            </TabsTrigger>
            <TabsTrigger value="files" className="flex items-center gap-1">
              <Upload className="h-3 w-3" />
              Files
            </TabsTrigger>
            <TabsTrigger value="chat" className="flex items-center gap-1">
              <MessageSquare className="h-3 w-3" />
              Chat
            </TabsTrigger>
            <TabsTrigger value="payment" className="flex items-center gap-1">
              <CreditCard className="h-3 w-3" />
              Payment
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

              {/* Client Information */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center text-sm font-semibold text-gray-700">
                    <User className="h-4 w-4 mr-2 text-blue-500" />
                    Client Information
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  {workOrder.clientName && (
                    <div className="flex items-start gap-2">
                      <Building2 className="h-4 w-4 text-gray-400 mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="text-xs text-gray-500 font-medium">Client Name</p>
                        <p className="text-gray-800 font-semibold">{workOrder.clientName}</p>
                      </div>
                    </div>
                  )}
                  {workOrder.clientWorkOrderNumber && (
                    <div className="flex items-start gap-2">
                      <ClipboardList className="h-4 w-4 text-gray-400 mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="text-xs text-gray-500 font-medium">Client WO #</p>
                        <p className="text-gray-800">{workOrder.clientWorkOrderNumber}</p>
                      </div>
                    </div>
                  )}
                  {workOrder.clientPhone && (
                    <div className="flex items-start gap-2">
                      <Phone className="h-4 w-4 text-gray-400 mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="text-xs text-gray-500 font-medium">Phone</p>
                        <p className="text-gray-800">{workOrder.clientPhone}</p>
                      </div>
                    </div>
                  )}
                  {workOrder.clientEmail && (
                    <div className="flex items-start gap-2">
                      <Mail className="h-4 w-4 text-gray-400 mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="text-xs text-gray-500 font-medium">Email</p>
                        <p className="text-gray-800">{workOrder.clientEmail}</p>
                      </div>
                    </div>
                  )}
                  {!workOrder.clientName && !workOrder.clientPhone && !workOrder.clientEmail && (
                    <p className="text-gray-400 text-xs italic">No client info provided</p>
                  )}
                </CardContent>
              </Card>

              {/* Location Details */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center text-sm font-semibold text-gray-700">
                    <MapPin className="h-4 w-4 mr-2 text-orange-500" />
                    Location
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-1 text-sm">
                  {workOrder.street && <p className="text-gray-800">{workOrder.street}</p>}
                  {(workOrder.city || workOrder.zipCode) && (
                    <p className="text-gray-800">
                      {[workOrder.city, workOrder.zipCode].filter(Boolean).join(", ")}
                    </p>
                  )}
                  {workOrder.country && <p className="text-gray-800">{workOrder.country}</p>}
                  {!workOrder.street && !workOrder.city && !workOrder.country && (
                    <p className="text-gray-400 text-xs italic">No location provided</p>
                  )}
                </CardContent>
              </Card>

              {/* Work Details */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center text-sm font-semibold text-gray-700">
                    <Wrench className="h-4 w-4 mr-2 text-purple-500" />
                    Work Details
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  {workOrder.equipmentType && (
                    <div>
                      <p className="text-xs text-gray-500 font-medium">Equipment Type</p>
                      <p className="text-gray-800">{workOrder.equipmentType}</p>
                    </div>
                  )}
                  {workOrder.urgency && (
                    <div>
                      <p className="text-xs text-gray-500 font-medium">Urgency / Priority</p>
                      <Badge className={
                        workOrder.urgency === "critical" ? "bg-red-100 text-red-800 border-0" :
                        workOrder.urgency === "high" ? "bg-orange-100 text-orange-800 border-0" :
                        workOrder.urgency === "medium" ? "bg-yellow-100 text-yellow-800 border-0" :
                        "bg-green-100 text-green-800 border-0"
                      }>
                        {workOrder.urgency.charAt(0).toUpperCase() + workOrder.urgency.slice(1)}
                      </Badge>
                    </div>
                  )}
                  {workOrder.estimatedHours && (
                    <div>
                      <p className="text-xs text-gray-500 font-medium">Estimated Hours</p>
                      <p className="text-gray-800">{workOrder.estimatedHours}h</p>
                    </div>
                  )}
                  {workOrder.description && (
                    <div>
                      <p className="text-xs text-gray-500 font-medium">Description</p>
                      <p className="text-gray-700 whitespace-pre-wrap">{workOrder.description}</p>
                    </div>
                  )}
                  {workOrder.problemDescription && (
                    <div>
                      <p className="text-xs text-gray-500 font-medium">Problem Description</p>
                      <p className="text-gray-700 whitespace-pre-wrap">{workOrder.problemDescription}</p>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Financial Details — NTE / TNTE with inline editing */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center text-sm font-semibold text-gray-700">
                    <DollarSign className="h-4 w-4 mr-2 text-green-500" />
                    Financial Details
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  {/* NTE */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex-1">
                      <p className="text-xs text-gray-500 font-medium mb-1">NTE — Not to Exceed (excl. tax)</p>
                      {editingNte ? (
                        <div className="flex items-center gap-1">
                          <span className="text-gray-500">$</span>
                          <Input
                            type="number"
                            step="0.01"
                            min="0"
                            value={nteValue}
                            onChange={e => setNteValue(e.target.value)}
                            className="h-7 text-sm w-32"
                            autoFocus
                          />
                          <Button size="sm" className="h-7 px-2" onClick={() => updateFinancialMutation.mutate({ nte: nteValue, tnte: workOrder.tnte || undefined })} disabled={updateFinancialMutation.isPending}>
                            <Save className="h-3 w-3" />
                          </Button>
                          <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => { setEditingNte(false); setNteValue(workOrder.nte || ""); }}>
                            <XIcon className="h-3 w-3" />
                          </Button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <p className="text-gray-800 font-semibold text-base">
                            {workOrder.nte ? formatCurrency(workOrder.nte) : <span className="text-gray-400 text-sm font-normal italic">Not set</span>}
                          </p>
                          {!workOrder.isLocked && (
                            <button onClick={() => { setNteValue(workOrder.nte || ""); setEditingNte(true); }} className="text-gray-400 hover:text-blue-500 transition-colors">
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="border-t border-gray-100" />

                  {/* TNTE */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex-1">
                      <p className="text-xs text-gray-500 font-medium mb-1">TNTE — Total NTE (incl. tax)</p>
                      {editingTnte ? (
                        <div className="flex items-center gap-1">
                          <span className="text-gray-500">$</span>
                          <Input
                            type="number"
                            step="0.01"
                            min="0"
                            value={tnteValue}
                            onChange={e => setTnteValue(e.target.value)}
                            className="h-7 text-sm w-32"
                            autoFocus
                          />
                          <Button size="sm" className="h-7 px-2" onClick={() => updateFinancialMutation.mutate({ tnte: tnteValue, nte: workOrder.nte || undefined })} disabled={updateFinancialMutation.isPending}>
                            <Save className="h-3 w-3" />
                          </Button>
                          <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => { setEditingTnte(false); setTnteValue(workOrder.tnte || ""); }}>
                            <XIcon className="h-3 w-3" />
                          </Button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <p className="text-green-700 font-bold text-lg">
                            {workOrder.tnte ? formatCurrency(workOrder.tnte) : <span className="text-gray-400 text-sm font-normal italic">Not set</span>}
                          </p>
                          {!workOrder.isLocked && (
                            <button onClick={() => { setTnteValue(workOrder.tnte || ""); setEditingTnte(true); }} className="text-gray-400 hover:text-blue-500 transition-colors">
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Timeline */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center text-sm font-semibold text-gray-700">
                    <Calendar className="h-4 w-4 mr-2 text-blue-500" />
                    Timeline
                  </CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-xs text-gray-500 font-medium">Start Date</p>
                    <p className="text-gray-800">{workOrder.startDate ? formatDate(workOrder.startDate) : <span className="text-gray-400 italic text-xs">Not set</span>}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 font-medium">End Date</p>
                    <p className="text-gray-800">{workOrder.endDate ? formatDate(workOrder.endDate) : <span className="text-gray-400 italic text-xs">Not set</span>}</p>
                  </div>
                  {workOrder.scheduledDate && (
                    <div>
                      <p className="text-xs text-gray-500 font-medium">Scheduled Date</p>
                      <p className="text-gray-800">{formatDate(workOrder.scheduledDate)}</p>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Assignment */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center text-sm font-semibold text-gray-700">
                    <User className="h-4 w-4 mr-2 text-indigo-500" />
                    Assigned Users
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-sm">
                  {workOrder.assignedUsers && workOrder.assignedUsers.length > 0 ? (
                    <div className="space-y-2">
                      {workOrder.assignedUsers.map((u) => (
                        <div key={u.id} className="flex items-center gap-2 p-2 bg-gray-50 rounded-lg">
                          <div className="w-7 h-7 bg-indigo-100 rounded-full flex items-center justify-center flex-shrink-0">
                            <span className="text-indigo-700 text-xs font-bold">
                              {u.firstName?.charAt(0)}{u.lastName?.charAt(0)}
                            </span>
                          </div>
                          <div>
                            <p className="text-gray-800 font-medium text-xs">{u.firstName} {u.lastName}</p>
                            <p className="text-gray-500 text-xs">{u.email}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-gray-400 text-xs italic">No users assigned</p>
                  )}
                </CardContent>
              </Card>

              {/* Instructions — full width */}
              {(workOrder.specialInstructions || workOrder.accessInstructions || workOrder.safetyRequirements) && (
                <Card className="md:col-span-2">
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center text-sm font-semibold text-gray-700">
                      <AlertTriangle className="h-4 w-4 mr-2 text-yellow-500" />
                      Instructions & Requirements
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                    {workOrder.specialInstructions && (
                      <div>
                        <p className="text-xs font-medium text-gray-500 mb-1">Special Instructions</p>
                        <p className="text-gray-700 whitespace-pre-wrap text-xs bg-yellow-50 rounded p-2">{workOrder.specialInstructions}</p>
                      </div>
                    )}
                    {workOrder.accessInstructions && (
                      <div>
                        <p className="text-xs font-medium text-gray-500 mb-1">Access Instructions</p>
                        <p className="text-gray-700 whitespace-pre-wrap text-xs bg-blue-50 rounded p-2">{workOrder.accessInstructions}</p>
                      </div>
                    )}
                    {workOrder.safetyRequirements && (
                      <div>
                        <p className="text-xs font-medium text-gray-500 mb-1">Safety Requirements</p>
                        <p className="text-gray-700 whitespace-pre-wrap text-xs bg-red-50 rounded p-2">{workOrder.safetyRequirements}</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

            </div>
          </TabsContent>

          <TabGuard tabName="proposal">
            <TabsContent value="proposal" className="space-y-4">
            {proposalData ? (
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <h3 className="text-lg font-medium">Work Order Proposal</h3>
                  <ButtonGuard buttonType="edit">
                    <Button 
                      onClick={() => workOrder.isLocked ? toast({
                        title: "Action Blocked",
                        description: "Cannot edit proposals - work order is locked due to paid invoice.",
                        variant: "destructive"
                      }) : setIsProposalModalOpen(true)}
                      disabled={workOrder.isLocked}
                      variant="outline"
                      size="sm"
                    >
                      {workOrder.isLocked ? "Locked" : "Edit Proposal"}
                    </Button>
                  </ButtonGuard>
                </div>
                
                <Card>
                  <CardHeader>
                    <div className="flex justify-between items-start">
                      <CardTitle>Proposal Details</CardTitle>
                      <Badge variant={
                        proposalData.status === "approved" ? "default" :
                        (proposalData.status === "cancelled" || proposalData.status === "rejected") ? "destructive" :
                        "secondary"
                      }>
                        {proposalData.status === "cancelled" ? "Rejected" : proposalData.status.charAt(0).toUpperCase() + proposalData.status.slice(1)}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {(() => {
                      try {
                        const parsed = proposalData.laborData ? JSON.parse(proposalData.laborData) : null;
                        const lines: any[] = Array.isArray(parsed?.lines) ? parsed.lines : [];
                        const scopeOfWork: string = parsed?.scopeOfWork || proposalData.message || "";
                        const taxRatePct: number = parseFloat(parsed?.taxRate || "0");

                        const subTotal = lines.reduce((s: number, l: any) =>
                          s + parseFloat(l.rate || "0") * parseFloat(l.qty || "0"), 0);
                        const taxAmt = subTotal * (taxRatePct / 100);
                        const grandTotal = subTotal + taxAmt;

                        return (
                          <div className="space-y-4">
                            {/* Summary row */}
                            <div className="grid grid-cols-3 gap-4">
                              <div className="bg-gray-50 rounded-lg p-3 text-center">
                                <p className="text-xs text-gray-500 mb-0.5">Subtotal</p>
                                <p className="text-lg font-bold text-gray-900">${subTotal.toFixed(2)}</p>
                              </div>
                              <div className="bg-gray-50 rounded-lg p-3 text-center">
                                <p className="text-xs text-gray-500 mb-0.5">Tax ({taxRatePct}%)</p>
                                <p className="text-lg font-bold text-gray-900">${taxAmt.toFixed(2)}</p>
                              </div>
                              <div className="bg-blue-50 rounded-lg p-3 text-center border border-blue-100">
                                <p className="text-xs text-blue-600 mb-0.5">Total Cost</p>
                                <p className="text-lg font-bold text-blue-700">${grandTotal.toFixed(2)}</p>
                              </div>
                            </div>

                            {/* Line items table */}
                            {lines.length > 0 ? (
                              <div className="rounded-md border overflow-hidden">
                                <table className="w-full text-sm">
                                  <thead className="bg-gray-50 border-b">
                                    <tr>
                                      <th className="text-left px-3 py-2 font-medium text-gray-600 w-32">Charge Type</th>
                                      <th className="text-left px-3 py-2 font-medium text-gray-600 w-24">Item</th>
                                      <th className="text-left px-3 py-2 font-medium text-gray-600">Description</th>
                                      <th className="text-right px-3 py-2 font-medium text-gray-600 w-20">Rate</th>
                                      <th className="text-right px-3 py-2 font-medium text-gray-600 w-16">Qty</th>
                                      <th className="text-right px-3 py-2 font-medium text-gray-600 w-24">Total</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {lines.map((line: any, idx: number) => {
                                      const lineTotal = parseFloat(line.rate || "0") * parseFloat(line.qty || "0");
                                      return (
                                        <tr key={idx} className="border-b last:border-0 hover:bg-gray-50/50">
                                          <td className="px-3 py-2 text-gray-700">{line.chargeType || "—"}</td>
                                          <td className="px-3 py-2 text-gray-600 text-xs">{line.item || "—"}</td>
                                          <td className="px-3 py-2 text-gray-700">{line.description || "—"}</td>
                                          <td className="px-3 py-2 text-right tabular-nums">${parseFloat(line.rate || "0").toFixed(2)}</td>
                                          <td className="px-3 py-2 text-right tabular-nums">{line.qty || 0}</td>
                                          <td className="px-3 py-2 text-right font-semibold tabular-nums">${lineTotal.toFixed(2)}</td>
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>
                              </div>
                            ) : (
                              <p className="text-sm text-gray-500 italic">No line items in this proposal.</p>
                            )}

                            {/* Scope of work */}
                            {scopeOfWork && (
                              <div>
                                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Scope of Work</p>
                                <p className="text-sm text-gray-700 bg-gray-50 p-3 rounded border whitespace-pre-wrap">{scopeOfWork}</p>
                              </div>
                            )}
                          </div>
                        );
                      } catch {
                        return (
                          <div className="text-center py-4">
                            <p className="text-gray-500 text-sm">Unable to display proposal data. Please open "Edit Proposal" to view.</p>
                          </div>
                        );
                      }
                    })()}

                    <div className="text-xs text-gray-500 pt-2 border-t">
                      Created: {new Date(proposalData.createdAt).toLocaleDateString()}
                    </div>
                  </CardContent>
                </Card>
              </div>
            ) : (
              <div className="text-center py-8">
                <Hammer className="h-12 w-12 mx-auto mb-4 text-gray-400" />
                <h3 className="text-lg font-medium mb-2">No Proposal Yet</h3>
                <p className="text-gray-600 mb-4">
                  Create a proposal for this work order using the button below.
                </p>
                <Button
                  onClick={() => workOrder.isLocked ? toast({
                    title: "Action Blocked",
                    description: "Cannot create a proposal — work order is locked.",
                    variant: "destructive"
                  }) : setIsProposalModalOpen(true)}
                  disabled={workOrder.isLocked}
                >
                  {workOrder.isLocked ? "Locked" : "Create Proposal"}
                </Button>
              </div>
            )}
          </TabsContent>
          </TabGuard>

          <TabGuard tabName="invoice">
            <TabsContent value="invoice" className="space-y-4">
            <InvoiceManagement 
              workOrder={workOrder}
            />
          </TabsContent>
          </TabGuard>

          <TabGuard tabName="parts">
            <TabsContent value="parts" className="space-y-4">
            {partsRequests.length > 0 ? (
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <h3 className="text-lg font-medium">Parts Requests</h3>
                  <Button 
                    onClick={() => workOrder.isLocked ? toast({
                      title: "Action Blocked",
                      description: "Cannot request parts - work order is locked due to paid invoice.",
                      variant: "destructive"
                    }) : setIsPartsRequestModalOpen(true)}
                    disabled={workOrder.isLocked}
                    variant="outline"
                    size="sm"
                  >
                    {workOrder.isLocked ? "Locked" : "Add Parts Request"}
                  </Button>
                </div>
                
                <div className="space-y-3">
                  {partsRequests.map((request: any) => (
                    <Card key={request.id}>
                      <CardContent className="p-4">
                        <div className="flex justify-between items-start">
                          <div className="space-y-2">
                            <div className="flex items-center space-x-2">
                              <h4 className="font-medium">{request.partName}</h4>
                              <Badge variant={
                                request.status === "approved" ? "default" : 
                                request.status === "rejected" ? "destructive" : 
                                request.status === "ordered" ? "secondary" : "outline"
                              }>
                                {request.status}
                              </Badge>
                            </div>
                            <div className="text-sm text-gray-600">
                              <div>Status: {request.status}</div>
                              <div>Reason: {request.reason || "Not specified"}</div>
                              <div>Requested: {new Date(request.createdAt).toLocaleDateString()}</div>
                              {(() => {
                                try {
                                  const parts = JSON.parse(request.parts || "[]");
                                  return (
                                    <div className="mt-2">
                                      <div className="font-medium">Parts:</div>
                                      {parts.map((part: any, idx: number) => (
                                        <div key={idx} className="ml-2 text-xs">
                                          • {part.name} (Qty: {part.quantity}) - ${parseFloat(part.estimatedCost || "0").toFixed(2)} each
                                        </div>
                                      ))}
                                    </div>
                                  );
                                } catch {
                                  return null;
                                }
                              })()}
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="text-lg font-medium">
                              ${((parseFloat(request.estimatedCost || "0") * (request.quantity || 1)).toFixed(2))}
                            </div>
                            <div className="text-sm text-gray-500">Total Cost</div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            ) : (
              <div className="text-center py-8">
                <Receipt className="h-12 w-12 mx-auto mb-4 text-gray-400" />
                <h3 className="text-lg font-medium mb-2">No Parts Requested</h3>
                <p className="text-gray-600 mb-4">
                  Request parts and materials needed for this work order.
                </p>
                <div className="space-x-2">
                  <Button 
                    onClick={() => workOrder.isLocked ? toast({
                      title: "Action Blocked",
                      description: "Cannot request parts - work order is locked due to paid invoice.",
                      variant: "destructive"
                    }) : setIsPartsRequestModalOpen(true)}
                    disabled={workOrder.isLocked}
                  >
                    {workOrder.isLocked ? "Locked" : "Request Parts"}
                  </Button>
                  <Button variant="outline" onClick={() => setIsViewPartsModalOpen(true)}>
                    View Parts Details
                  </Button>
                </div>
              </div>
            )}
          </TabsContent>
          </TabGuard>

          <TabGuard tabName="files">
            <TabsContent value="files" className="space-y-4">
            <div className="text-center py-8">
              <Upload className="h-12 w-12 mx-auto mb-4 text-gray-400" />
              <h3 className="text-lg font-medium mb-2">File Management</h3>
              <p className="text-gray-600 mb-4">
                Upload before/after photos, signatures, and documents.
              </p>
              <div className="space-x-2">
                <Button 
                  onClick={() => workOrder.isLocked ? toast({
                    title: "Action Blocked",
                    description: "Cannot upload files - work order is locked due to paid invoice.",
                    variant: "destructive"
                  }) : setIsFileUploadModalOpen(true)}
                  disabled={workOrder.isLocked}
                >
                  {workOrder.isLocked ? "Locked" : "Manage Files"}
                </Button>
                <Button variant="outline" onClick={() => setIsViewFilesModalOpen(true)}>
                  View Files Details
                </Button>
              </div>
            </div>
          </TabsContent>
          </TabGuard>

          <TabGuard tabName="chat">
            <TabsContent value="chat" className="space-y-4">
            <div className="text-center py-8">
              <MessageSquare className="h-12 w-12 mx-auto mb-4 text-gray-400" />
              <h3 className="text-lg font-medium mb-2">Work Order Chat</h3>
              <p className="text-gray-600 mb-4">
                Communicate with team members about this work order.
              </p>
              <div className="space-x-2">
                <Button 
                  onClick={() => workOrder.isLocked ? toast({
                    title: "Action Blocked",
                    description: "Cannot access chat - work order is locked due to paid invoice.",
                    variant: "destructive"
                  }) : setIsChatModalOpen(true)}
                  disabled={workOrder.isLocked}
                >
                  {workOrder.isLocked ? "Locked" : "Open Chat"}
                </Button>
                <Button variant="outline" onClick={() => setIsViewChatModalOpen(true)}>
                  View Chat History
                </Button>
              </div>
            </div>
          </TabsContent>
          </TabGuard>

          <TabGuard tabName="payments">
            <TabsContent value="payment" className="space-y-4">
            <div className="text-center py-8">
              <CreditCard className="h-12 w-12 mx-auto mb-4 text-gray-400" />
              <h3 className="text-lg font-medium mb-2">Payment Requests</h3>
              <p className="text-gray-600 mb-6">
                Create payment requests for technicians working on this order.
              </p>
              
              <ButtonGuard buttonType="create">
                <div className="space-x-2 mb-4">
                  <Button 
                    onClick={() => workOrder.isLocked ? toast({
                      title: "Action Blocked",
                      description: "Cannot create payment requests - work order is locked due to paid invoice.",
                      variant: "destructive"
                    }) : setIsPaymentRequestModalOpen(true)} 
                    disabled={workOrder.isLocked}
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    {workOrder.isLocked ? "Locked" : "Create Payment Request"}
                  </Button>
                  <Button variant="outline" onClick={() => setIsViewPaymentModalOpen(true)}>
                    View Payment Details
                  </Button>
                </div>
              </ButtonGuard>



              {/* Existing Payment Requests */}
              {existingPayments.length > 0 && (
                <div className="mt-8">
                  <h3 className="text-lg font-medium mb-4">Existing Payment Requests</h3>
                  <div className="space-y-3">
                    {existingPayments.map((payment: any) => {
                      const technician = technicians.find(t => t.id === payment.technicianId);
                      const paymentMethods = JSON.parse(payment.paymentMethod || "[]");
                      const requested = parseFloat(payment.amountRequested || "0");
                      const paid = parseFloat(payment.amountPaid || "0");
                      const remaining = Math.max(0, requested - paid);
                      
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
                        <Card key={payment.id} className="p-4">
                          <div className="flex justify-between items-start">
                            <div className="space-y-2">
                              <div className="flex items-center space-x-2">
                                <span className="font-medium">
                                  {technician ? `${technician.firstName} ${technician.lastName}` : `Technician #${payment.technicianId}`}
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
                    })}
                  </div>
                </div>
              )}
            </div>
          </TabsContent>
          </TabGuard>
        </Tabs>

        <div className="flex justify-end pt-4 border-t">
          <Button onClick={onClose}>
            Close
          </Button>
        </div>
      </DialogContent>

      {isProposalModalOpen && (
        <WorkOrderProposalModal
          isOpen={isProposalModalOpen}
          onClose={() => setIsProposalModalOpen(false)}
          workOrder={workOrder}
        />
      )}


      {isPartsRequestModalOpen && (
        <PartsRequestModal
          isOpen={isPartsRequestModalOpen}
          onClose={() => setIsPartsRequestModalOpen(false)}
          workOrder={workOrder}
        />
      )}

      {isFileUploadModalOpen && (
        <FileUploadModal
          isOpen={isFileUploadModalOpen}
          onClose={() => setIsFileUploadModalOpen(false)}
          workOrder={workOrder}
        />
      )}

      {isChatModalOpen && (
        <ChatModal
          isOpen={isChatModalOpen}
          onClose={() => setIsChatModalOpen(false)}
          workOrder={workOrder}
        />
      )}

      {isViewProposalModalOpen && (
        <Dialog open={isViewProposalModalOpen} onOpenChange={setIsViewProposalModalOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Proposal Details - {workOrder.workOrderNumber}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              {proposalData ? (
                <Card>
                  <CardHeader>
                    <div className="flex justify-between items-start">
                      <CardTitle>Work Order Proposal</CardTitle>
                      <Badge variant={proposalData.status === "approved" ? "default" : 
                                   proposalData.status === "rejected" ? "destructive" : "secondary"}>
                        {proposalData.status}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    {(() => {
                      try {
                        const laborData = JSON.parse(proposalData.laborData || "[]");
                        const partsData = JSON.parse(proposalData.partsData || "[]");
                        const servicesData = JSON.parse(proposalData.servicesData || "[]");
                        
                        const laborTotal = laborData.reduce((sum: number, item: any) => {
                          const payRate = parseFloat(item.payRate || "0");
                          const regularHours = parseFloat(item.regularHours || "0");
                          const otHours = parseFloat(item.otHours || "0");
                          const otScale = parseFloat(item.otScale || "1.5");
                          return sum + (payRate * regularHours) + (payRate * otHours * otScale);
                        }, 0);
                        const partsTotal = partsData.reduce((sum: number, item: any) => sum + (parseFloat(item.unitCost || "0") * parseInt(item.quantity || "1")), 0);
                        const servicesTotal = servicesData.reduce((sum: number, item: any) => sum + (parseFloat(item.unitCost || "0") * parseInt(item.quantity || "1")), 0);
                        const grandTotal = laborTotal + partsTotal + servicesTotal;
                        
                        return (
                          <div>
                            <div className="grid grid-cols-2 gap-6 mb-6">
                              <div className="space-y-2">
                                <h4 className="font-medium text-sm text-gray-700">Labor Total</h4>
                                <p className="text-2xl font-bold text-blue-600">${laborTotal.toFixed(2)}</p>
                              </div>
                              <div className="space-y-2">
                                <h4 className="font-medium text-sm text-gray-700">Parts Total</h4>
                                <p className="text-2xl font-bold text-green-600">${partsTotal.toFixed(2)}</p>
                              </div>
                              <div className="space-y-2">
                                <h4 className="font-medium text-sm text-gray-700">Services Total</h4>
                                <p className="text-2xl font-bold text-purple-600">${servicesTotal.toFixed(2)}</p>
                              </div>
                              <div className="space-y-2">
                                <h4 className="font-medium text-sm text-gray-700">Grand Total</h4>
                                <p className="text-3xl font-bold text-gray-900">${grandTotal.toFixed(2)}</p>
                              </div>
                            </div>
                            
                            {laborData.length > 0 && (
                              <div className="mb-6">
                                <h4 className="font-medium text-gray-700 mb-3">Labor Details</h4>
                                <div className="space-y-2">
                                  {laborData.map((item: any, idx: number) => (
                                    <div key={idx} className="flex justify-between items-center p-3 bg-blue-50 rounded-lg">
                                      <div>
                                        <div className="font-medium">{item.description}</div>
                                        <div className="text-sm text-gray-600">{item.hours} hours × ${parseFloat(item.cost || "0").toFixed(2)}/hr</div>
                                      </div>
                                      <div className="font-bold">${(parseFloat(item.cost || "0") * parseFloat(item.hours || "1")).toFixed(2)}</div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                            
                            {partsData.length > 0 && (
                              <div className="mb-6">
                                <h4 className="font-medium text-gray-700 mb-3">Parts Details</h4>
                                <div className="space-y-2">
                                  {partsData.map((item: any, idx: number) => (
                                    <div key={idx} className="flex justify-between items-center p-3 bg-green-50 rounded-lg">
                                      <div>
                                        <div className="font-medium">{item.description}</div>
                                        <div className="text-sm text-gray-600">Qty: {item.quantity} × ${parseFloat(item.cost || "0").toFixed(2)} each</div>
                                      </div>
                                      <div className="font-bold">${(parseFloat(item.cost || "0") * parseInt(item.quantity || "1")).toFixed(2)}</div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                            
                            {servicesData.length > 0 && (
                              <div className="mb-6">
                                <h4 className="font-medium text-gray-700 mb-3">Services Details</h4>
                                <div className="space-y-2">
                                  {servicesData.map((item: any, idx: number) => (
                                    <div key={idx} className="flex justify-between items-center p-3 bg-purple-50 rounded-lg">
                                      <div className="font-medium">{item.description}</div>
                                      <div className="font-bold">${parseFloat(item.cost || "0").toFixed(2)}</div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      } catch {
                        return (
                          <div className="text-center py-8">
                            <p className="text-gray-500">Unable to parse proposal data</p>
                          </div>
                        );
                      }
                    })()}
                    
                    {proposalData.message && (
                      <div className="space-y-2">
                        <h4 className="font-medium text-gray-700">Message</h4>
                        <div className="p-4 bg-gray-50 rounded-lg border">
                          <p className="text-gray-900 whitespace-pre-wrap">{proposalData.message}</p>
                        </div>
                      </div>
                    )}
                    
                    <div className="pt-4 border-t">
                      <div className="flex justify-between text-sm text-gray-500">
                        <span>Created: {new Date(proposalData.createdAt).toLocaleDateString()}</span>
                        {proposalData.updatedAt && proposalData.updatedAt !== proposalData.createdAt && (
                          <span>Updated: {new Date(proposalData.updatedAt).toLocaleDateString()}</span>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ) : (
                <div className="text-center py-8">
                  <Hammer className="h-12 w-12 mx-auto mb-4 text-gray-400" />
                  <h3 className="text-lg font-medium mb-2">No Proposal Available</h3>
                  <p className="text-gray-600">No proposal has been created for this work order yet.</p>
                </div>
              )}
            </div>
            <div className="flex justify-end pt-4 border-t">
              <Button onClick={() => setIsViewProposalModalOpen(false)}>
                Close
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {isViewPartsModalOpen && (
        <Dialog open={isViewPartsModalOpen} onOpenChange={setIsViewPartsModalOpen}>
          <DialogContent className="max-w-3xl">
            <DialogHeader>
              <DialogTitle>Parts Requests - {workOrder.workOrderNumber}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              {partsRequests.length > 0 ? (
                <div className="space-y-3">
                  {partsRequests.map((request: any) => (
                    <Card key={request.id}>
                      <CardContent className="p-6">
                        <div className="flex justify-between items-start mb-4">
                          <div className="space-y-2">
                            <div className="flex items-center space-x-3">
                              <h4 className="text-xl font-bold text-gray-900">Parts Request #{request.id}</h4>
                              <Badge variant={
                                request.status === "approved" ? "default" : 
                                request.status === "rejected" ? "destructive" : 
                                request.status === "ordered" ? "secondary" : "outline"
                              }>
                                {request.status}
                              </Badge>
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="text-2xl font-bold text-green-600">
                              ${((parseFloat(request.estimatedCost || "0") * (request.quantity || 1)).toFixed(2))}
                            </div>
                            <div className="text-sm text-gray-500">Total Cost</div>
                          </div>
                        </div>
                        
                        <div className="grid grid-cols-2 gap-6 mb-4">
                          <div>
                            <h5 className="font-medium text-gray-700 mb-1">Status</h5>
                            <p className="text-lg font-semibold capitalize">{request.status}</p>
                          </div>
                          <div>
                            <h5 className="font-medium text-gray-700 mb-1">Requested By</h5>
                            <p className="text-lg">User #{request.requestedBy}</p>
                          </div>
                        </div>
                        
                        {request.notes && (
                          <div className="mb-4">
                            <h5 className="font-medium text-gray-700 mb-2">Notes</h5>
                            <div className="p-3 bg-gray-50 rounded-lg border">
                              <p className="text-gray-900">{request.notes}</p>
                            </div>
                          </div>
                        )}
                        
                        <div className="mb-4">
                          <h5 className="font-medium text-gray-700 mb-2">Parts Details</h5>
                          <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
                            <div className="flex justify-between items-start">
                              <div>
                                <div className="font-medium">{request.partName}</div>
                                <div className="text-sm text-gray-600">Quantity: {request.quantity}</div>
                                {request.partNumber && <div className="text-sm text-gray-600">Part Number: {request.partNumber}</div>}
                                {request.supplier && <div className="text-sm text-gray-600">Supplier: {request.supplier}</div>}
                                <div className="text-sm text-gray-600">Urgency: {request.urgency}</div>
                              </div>
                              <div className="text-right">
                                <div className="font-bold">${parseFloat(request.estimatedCost || "0").toFixed(2)}</div>
                                <div className="text-sm text-gray-500">per unit</div>
                              </div>
                            </div>
                          </div>
                        </div>
                        
                        <div className="text-sm text-gray-500 pt-3 border-t">
                          Requested: {new Date(request.createdAt).toLocaleDateString()}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <Receipt className="h-12 w-12 mx-auto mb-4 text-gray-400" />
                  <h3 className="text-lg font-medium mb-2">No Parts Requests</h3>
                  <p className="text-gray-600">No parts have been requested for this work order yet.</p>
                </div>
              )}
            </div>
            <div className="flex justify-end pt-4 border-t">
              <Button onClick={() => setIsViewPartsModalOpen(false)}>
                Close
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {isViewFilesModalOpen && (
        <Dialog open={isViewFilesModalOpen} onOpenChange={setIsViewFilesModalOpen}>
          <DialogContent className="max-w-4xl">
            <DialogHeader>
              <DialogTitle>Files & Documents - {workOrder.workOrderNumber}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              {workOrderFiles.length > 0 ? (
                <div className="space-y-4">
                  {['before', 'after', 'signature', 'document'].map(category => {
                    const categoryFiles = workOrderFiles.filter((file: any) => file.category === category);
                    if (categoryFiles.length === 0) return null;
                    
                    return (
                      <div key={category} className="space-y-3">
                        <h4 className="text-lg font-semibold capitalize text-gray-800">
                          {category === 'before' ? 'Before Photos' : 
                           category === 'after' ? 'After Photos' :
                           category === 'signature' ? 'Signatures' : 'Documents'}
                        </h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {categoryFiles.map((file: any) => (
                            <Card key={file.id}>
                              <CardContent className="p-4">
                                <div className="flex items-start space-x-3">
                                  <div className="flex-shrink-0">
                                    {file.mimeType?.startsWith('image/') ? (
                                      <div className="w-16 h-16 bg-blue-100 rounded-lg flex items-center justify-center">
                                        <Upload className="h-8 w-8 text-blue-600" />
                                      </div>
                                    ) : (
                                      <div className="w-16 h-16 bg-gray-100 rounded-lg flex items-center justify-center">
                                        <FileText className="h-8 w-8 text-gray-600" />
                                      </div>
                                    )}
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <h5 className="font-medium text-gray-900 truncate">{file.fileName}</h5>
                                    <p className="text-sm text-gray-500 mt-1">{file.mimeType}</p>
                                    {file.description && (
                                      <p className="text-sm text-gray-600 mt-2">{file.description}</p>
                                    )}
                                    <div className="flex items-center justify-between mt-3">
                                      <span className="text-xs text-gray-500">
                                        {new Date(file.createdAt).toLocaleDateString()}
                                      </span>
                                      <Button 
                                        variant="outline" 
                                        size="sm"
                                        onClick={() => window.open(file.filePath, '_blank')}
                                      >
                                        View
                                      </Button>
                                    </div>
                                  </div>
                                </div>
                              </CardContent>
                            </Card>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center py-8">
                  <Upload className="h-12 w-12 mx-auto mb-4 text-gray-400" />
                  <h3 className="text-lg font-medium mb-2">No Files Uploaded</h3>
                  <p className="text-gray-600">No files have been uploaded for this work order yet.</p>
                </div>
              )}
            </div>
            <div className="flex justify-end pt-4 border-t">
              <Button onClick={() => setIsViewFilesModalOpen(false)}>
                Close
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {isViewChatModalOpen && (
        <Dialog open={isViewChatModalOpen} onOpenChange={setIsViewChatModalOpen}>
          <DialogContent className="max-w-4xl">
            <DialogHeader>
              <DialogTitle>Chat History - {workOrder.workOrderNumber}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              {workOrderChats.length > 0 ? (
                <div className="space-y-3 max-h-96 overflow-y-auto">
                  {workOrderChats.map((chat: any) => (
                    <Card key={chat.id}>
                      <CardContent className="p-4">
                        <div className="flex items-start space-x-3">
                          <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                            <MessageSquare className="h-4 w-4 text-blue-600" />
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center space-x-2 mb-2">
                              <span className="font-medium text-gray-900">User #{chat.userId}</span>
                              <span className="text-xs text-gray-500">
                                {new Date(chat.createdAt).toLocaleString()}
                              </span>
                            </div>
                            <div className="bg-gray-50 rounded-lg p-3">
                              <p className="text-gray-900 whitespace-pre-wrap">{chat.message}</p>
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <MessageSquare className="h-12 w-12 mx-auto mb-4 text-gray-400" />
                  <h3 className="text-lg font-medium mb-2">No Chat Messages</h3>
                  <p className="text-gray-600">No messages have been sent for this work order yet.</p>
                </div>
              )}
            </div>
            <div className="flex justify-end pt-4 border-t">
              <Button onClick={() => setIsViewChatModalOpen(false)}>
                Close
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {isViewPaymentModalOpen && (
        <Dialog open={isViewPaymentModalOpen} onOpenChange={setIsViewPaymentModalOpen}>
          <DialogContent className="max-w-4xl">
            <DialogHeader>
              <DialogTitle>Payment Requests - {workOrder.workOrderNumber}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              {existingPayments.length > 0 ? (
                <div className="space-y-4">
                  {existingPayments.map((payment: any) => {
                    const technician = technicians.find(t => t.id === payment.technicianId);
                    const paymentMethods = JSON.parse(payment.paymentMethod || "[]");
                    const requested = parseFloat(payment.amountRequested || "0");
                    const paid = parseFloat(payment.amountPaid || "0");
                    const remaining = Math.max(0, requested - paid);
                    
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
                      <Card key={payment.id}>
                        <CardContent className="p-6">
                          <div className="flex justify-between items-start mb-4">
                            <div className="space-y-2">
                              <div className="flex items-center space-x-3">
                                <h4 className="text-xl font-bold text-gray-900">
                                  {technician ? `${technician.firstName} ${technician.lastName}` : `Technician #${payment.technicianId}`}
                                </h4>
                                <Badge className={getStatusColor(payment.status)}>
                                  {payment.status.replace("_", " ")}
                                </Badge>
                              </div>
                            </div>
                            <div className="text-right">
                              <div className="text-2xl font-bold text-green-600">${requested.toFixed(2)}</div>
                              <div className="text-sm text-gray-500">Requested</div>
                            </div>
                          </div>
                          
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-4">
                            <div>
                              <h5 className="font-medium text-gray-700 mb-2">Payment Methods</h5>
                              <div className="flex flex-wrap gap-2">
                                {paymentMethods.map((method: string, idx: number) => (
                                  <Badge key={idx} variant="outline">{method}</Badge>
                                ))}
                              </div>
                            </div>
                            <div>
                              <h5 className="font-medium text-gray-700 mb-2">Payment Status</h5>
                              {payment.amountPaid && (
                                <div className="space-y-1">
                                  <div className="text-sm text-gray-600">
                                    Paid: ${paid.toFixed(2)}
                                  </div>
                                  {remaining > 0 && (
                                    <div className="text-sm text-red-600">
                                      Remaining: ${remaining.toFixed(2)}
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                          
                          {payment.description && (
                            <div className="mb-4">
                              <h5 className="font-medium text-gray-700 mb-2">Description</h5>
                              <div className="p-3 bg-gray-50 rounded-lg border">
                                <p className="text-gray-900">{payment.description}</p>
                              </div>
                            </div>
                          )}
                          
                          <div className="text-sm text-gray-500 pt-3 border-t">
                            <div className="flex justify-between">
                              <span>Requested: {new Date(payment.requestedAt).toLocaleDateString()}</span>
                              {payment.updatedAt && payment.updatedAt !== payment.requestedAt && (
                                <span>Updated: {new Date(payment.updatedAt).toLocaleDateString()}</span>
                              )}
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center py-8">
                  <CreditCard className="h-12 w-12 mx-auto mb-4 text-gray-400" />
                  <h3 className="text-lg font-medium mb-2">No Payment Requests</h3>
                  <p className="text-gray-600">No payment requests have been created for this work order yet.</p>
                </div>
              )}
            </div>
            <div className="flex justify-end pt-4 border-t">
              <Button onClick={() => setIsViewPaymentModalOpen(false)}>
                Close
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Payment Request Modal */}
      {isPaymentRequestModalOpen && (
        <PaymentRequestModal 
          isOpen={isPaymentRequestModalOpen}
          onClose={() => setIsPaymentRequestModalOpen(false)}
          workOrder={workOrder}
        />
      )}
    </Dialog>
  );
}