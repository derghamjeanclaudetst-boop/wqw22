import { useState, useEffect, useMemo, useRef } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  DollarSign,
  User,
  Mail,
  Phone,
  MapPin,
  CreditCard,
  Building,
  Smartphone,
  ArrowLeftRight,
  FileText,
  Upload,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Map,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { AdvancedPermissionGuard } from "@/components/rbac/advanced-permission-guard";
import { TechnicianMapPickerModal } from "@/components/modals/technician-map-picker-modal";

const paymentRequestSchema = z.object({
  technicianId: z.string().min(1, "Technician is required"),
  amountRequested: z.string().min(1, "Amount is required"),
  description: z.string().optional(),
  paymentMethods: z.array(z.string()).min(1, "At least one payment method is required"),
  priority: z.enum(["low", "normal", "high", "urgent"]),
  dueDate: z.string().optional(),
});

type PaymentRequestForm = z.infer<typeof paymentRequestSchema>;

interface PaymentRequestModalProps {
  isOpen: boolean;
  onClose: () => void;
  workOrder: any;
}

const paymentMethodsInfo = {
  paypal: {
    name: "PayPal",
    icon: <CreditCard className="h-4 w-4" />,
    color: "bg-blue-50 border-blue-200 text-blue-700",
    description: "Secure online payments via PayPal",
    features: ["Instant transfers", "Buyer protection", "Mobile payments"],
  },
  credit_card: {
    name: "Credit/Debit Cards",
    icon: <CreditCard className="h-4 w-4" />,
    color: "bg-purple-50 border-purple-200 text-purple-700",
    description: "Accept all major credit and debit cards",
    features: ["Visa, MasterCard, Amex", "Secure processing", "Real-time approval"],
  },
  bank_transfer: {
    name: "Bank Transfer",
    icon: <Building className="h-4 w-4" />,
    color: "bg-green-50 border-green-200 text-green-700",
    description: "Direct bank-to-bank transfers",
    features: ["ACH transfers", "Wire transfers", "Lower fees"],
  },
  cash: {
    name: "Cash Payment",
    icon: <DollarSign className="h-4 w-4" />,
    color: "bg-yellow-50 border-yellow-200 text-yellow-700",
    description: "Cash payments accepted on-site",
    features: ["No processing fees", "Immediate payment", "Receipt provided"],
  },
  venmo: {
    name: "Venmo",
    icon: <Smartphone className="h-4 w-4" />,
    color: "bg-indigo-50 border-indigo-200 text-indigo-700",
    description: "Popular peer-to-peer payment app",
    features: ["Social payments", "Instant transfers", "Mobile-first"],
  },
  cashapp: {
    name: "Cash App",
    icon: <Smartphone className="h-4 w-4" />,
    color: "bg-emerald-50 border-emerald-200 text-emerald-700",
    description: "Square's mobile payment service",
    features: ["Bitcoin support", "Stock investing", "Direct deposit"],
  },
  zelle: {
    name: "Zelle",
    icon: <ArrowLeftRight className="h-4 w-4" />,
    color: "bg-orange-50 border-orange-200 text-orange-700",
    description: "Bank-to-bank transfers in minutes",
    features: ["Direct bank integration", "Fast transfers", "No fees"],
  },
  check: {
    name: "Check Payment",
    icon: <Mail className="h-4 w-4" />,
    color: "bg-gray-50 border-gray-200 text-gray-700",
    description: "Traditional check payments by mail",
    features: ["Mailed checks", "Paper trail", "Bank clearing"],
  }
};

export function PaymentRequestModalNew({ isOpen, onClose, workOrder }: PaymentRequestModalProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const w9FileInputRef = useRef<HTMLInputElement>(null);

  const [selectedTechnician, setSelectedTechnician] = useState<any>(null);
  const [w9Uploading, setW9Uploading] = useState(false);
  const [showMapPicker, setShowMapPicker] = useState(false);

  const form = useForm<PaymentRequestForm>({
    resolver: zodResolver(paymentRequestSchema),
    defaultValues: {
      technicianId: "",
      amountRequested: "",
      description: "",
      paymentMethods: [],
      priority: "normal",
      dueDate: "",
    },
  });

  const amountValue = useWatch({ control: form.control, name: "amountRequested" });
  const amount = parseFloat(amountValue || "0") || 0;

  // W9 gate: amount > $500 and no W9 on file
  const w9Missing = !selectedTechnician?.w9FileName || !selectedTechnician?.w9Status;
  const w9Pending = selectedTechnician?.w9Status === "submitted";
  const w9Verified = selectedTechnician?.w9Status === "verified";
  const paymentBlocked = selectedTechnician && amount > 500 && w9Missing;

  const { data: technicians = [] } = useQuery({
    queryKey: ["/api/technicians"],
  });

  useEffect(() => {
    if (isOpen) {
      form.reset();
      setSelectedTechnician(null);
    }
  }, [isOpen, form]);

  const createPaymentMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await apiRequest("POST", `/api/work-orders/${workOrder?.id}/payments`, data);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Payment Request Created",
        description: "Payment request has been sent successfully.",
      });
      queryClient.invalidateQueries({ queryKey: [`/api/work-orders/${workOrder?.id}/payments`] });
      onClose();
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create payment request",
        variant: "destructive",
      });
    },
  });

  const availablePaymentMethods = useMemo(() => {
    if (!selectedTechnician || !selectedTechnician.paymentMethods) return [];
    try {
      if (typeof selectedTechnician.paymentMethods === 'string') {
        if (selectedTechnician.paymentMethods.startsWith('[')) {
          return JSON.parse(selectedTechnician.paymentMethods);
        } else {
          return selectedTechnician.paymentMethods
            .split(',')
            .map((method: string) => method.trim())
            .filter((method: string) => method.length > 0);
        }
      }
      return selectedTechnician.paymentMethods;
    } catch {
      return [];
    }
  }, [selectedTechnician]);

  const handleTechnicianChange = (value: string) => {
    const technician = (technicians as any[]).find((t: any) => t.id.toString() === value);
    setSelectedTechnician(technician);
    form.setValue("technicianId", value);
    form.setValue("paymentMethods", []);
  };

  const handleMapPickerSelect = (technician: any) => {
    setSelectedTechnician(technician);
    form.setValue("technicianId", technician.id.toString());
    form.setValue("paymentMethods", []);
  };

  const handleW9Upload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!selectedTechnician || !e.target.files?.[0]) return;
    const file = e.target.files[0];
    const allowedTypes = ["application/pdf", "image/jpeg", "image/png", "image/jpg"];
    if (!allowedTypes.includes(file.type)) {
      toast({ title: "Invalid file type", description: "Only PDF, JPG, and PNG files are accepted for W9 documents.", variant: "destructive" });
      return;
    }
    setW9Uploading(true);
    try {
      const formData = new FormData();
      formData.append("w9", file);
      const response = await fetch(`/api/technicians/${selectedTechnician.id}/w9`, {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.message || "Upload failed");
      }
      const data = await response.json();
      // Update local state so the block clears immediately
      setSelectedTechnician((prev: any) => ({
        ...prev,
        w9Status: "submitted",
        w9FileName: data.technician?.w9FileName || file.name,
        w9FilePath: data.technician?.w9FilePath || null,
        w9SubmittedAt: new Date().toISOString(),
      }));
      queryClient.invalidateQueries({ queryKey: ["/api/technicians"] });
      toast({ title: "W9 Uploaded", description: "W9 document uploaded successfully. You can now submit the payment request." });
    } catch (error: any) {
      toast({ title: "Upload Failed", description: error.message || "Failed to upload W9", variant: "destructive" });
    } finally {
      setW9Uploading(false);
      if (w9FileInputRef.current) w9FileInputRef.current.value = "";
    }
  };

  const onSubmit = (data: PaymentRequestForm) => {
    if (paymentBlocked) return;
    const payload = {
      technicianId: parseInt(data.technicianId),
      amountRequested: data.amountRequested,
      description: data.description || "",
      paymentMethod: JSON.stringify(data.paymentMethods),
      priority: data.priority,
      dueDate: data.dueDate || null,
    };
    createPaymentMutation.mutate(payload);
  };

  return (
    <AdvancedPermissionGuard permission="payments.modal.create">
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <DollarSign className="h-5 w-5" />
              Create Payment Request - {workOrder?.workOrderNumber || "Unknown"}
            </DialogTitle>
            <DialogDescription>
              Request payment from a technician for work completed on this work order.
            </DialogDescription>
          </DialogHeader>

          <ScrollArea className="max-h-[calc(90vh-120px)]">
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">

                {/* Technician Selection */}
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <User className="h-4 w-4" />
                    <h3 className="text-lg font-semibold">Select Technician</h3>
                  </div>

                  <FormField
                    control={form.control}
                    name="technicianId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Technician</FormLabel>
                        <div className="flex gap-2">
                          <Select onValueChange={handleTechnicianChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Choose a technician" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {(technicians as any[]).map((technician) => (
                                <SelectItem key={technician.id} value={technician.id.toString()}>
                                  <div className="flex items-center gap-2">
                                    <Avatar className="h-6 w-6">
                                      <AvatarFallback>
                                        {technician.firstName?.[0]}{technician.lastName?.[0]}
                                      </AvatarFallback>
                                    </Avatar>
                                    <span>{technician.firstName} {technician.lastName}</span>
                                    <Badge variant="outline" className="ml-2">
                                      ${technician.hourlyRate}/hr
                                    </Badge>
                                  </div>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => setShowMapPicker(true)}
                            title="Browse technician map to select"
                            className="shrink-0 gap-1.5"
                          >
                            <Map className="h-4 w-4" />
                            Browse Map
                          </Button>
                        </div>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* Technician Details Card */}
                  {selectedTechnician && (
                    <Card className="bg-gradient-to-r from-blue-50 to-indigo-50 border-blue-200 dark:from-blue-950/30 dark:to-indigo-950/30 dark:border-blue-800">
                      <CardHeader className="pb-3">
                        <CardTitle className="flex items-center gap-3">
                          <Avatar>
                            <AvatarFallback className="bg-blue-100 text-blue-700">
                              {selectedTechnician.firstName?.[0]}{selectedTechnician.lastName?.[0]}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <div className="text-lg">{selectedTechnician.firstName} {selectedTechnician.lastName}</div>
                            <div className="text-sm text-muted-foreground font-normal">{selectedTechnician.specialization}</div>
                          </div>
                          {/* W9 mini-badge in the technician card */}
                          <div className="ml-auto">
                            {w9Verified ? (
                              <Badge className="bg-green-100 text-green-800 border-green-200 text-xs">
                                <CheckCircle className="h-3 w-3 mr-1" />W9 Verified
                              </Badge>
                            ) : w9Pending ? (
                              <Badge className="bg-yellow-100 text-yellow-800 border-yellow-200 text-xs">
                                <FileText className="h-3 w-3 mr-1" />W9 Pending Review
                              </Badge>
                            ) : (
                              <Badge className="bg-red-100 text-red-800 border-red-200 text-xs">
                                <XCircle className="h-3 w-3 mr-1" />No W9 on File
                              </Badge>
                            )}
                          </div>
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        <div className="grid grid-cols-2 gap-4 text-sm">
                          <div className="flex items-center gap-2">
                            <Mail className="h-4 w-4 text-muted-foreground" />
                            <span>{selectedTechnician.email}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Phone className="h-4 w-4 text-muted-foreground" />
                            <span>{selectedTechnician.phone}</span>
                          </div>
                        </div>
                        {selectedTechnician.location && (
                          <div className="flex items-center gap-2 text-sm">
                            <MapPin className="h-4 w-4 text-muted-foreground" />
                            <span>{selectedTechnician.location}</span>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  )}
                </div>

                {/* Payment Details */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <FormField
                    control={form.control}
                    name="amountRequested"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Amount Requested</FormLabel>
                        <FormControl>
                          <div className="relative">
                            <DollarSign className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input {...field} placeholder="0.00" className="pl-10" type="number" step="0.01" />
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="priority"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Priority</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select priority" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="low">Low</SelectItem>
                            <SelectItem value="normal">Normal</SelectItem>
                            <SelectItem value="high">High</SelectItem>
                            <SelectItem value="urgent">Urgent</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                {/* W9 BLOCK — shown when amount > $500 and technician has no W9 */}
                {selectedTechnician && amount > 500 && w9Missing && (
                  <div className="space-y-4">
                    <Alert className="border-red-300 bg-red-50 dark:bg-red-950/30 dark:border-red-800">
                      <AlertTriangle className="h-5 w-5 text-red-600" />
                      <AlertTitle className="text-red-800 dark:text-red-300 font-semibold">
                        Payment Cannot Be Submitted — W9 Required
                      </AlertTitle>
                      <AlertDescription className="text-red-700 dark:text-red-400 text-sm mt-1">
                        Payments over <strong>$500</strong> require a W9 tax form on file for{" "}
                        <strong>{selectedTechnician.firstName} {selectedTechnician.lastName}</strong>.
                        This is required by IRS regulations for contractor payments. Upload the W9 below to continue.
                      </AlertDescription>
                    </Alert>

                    {/* Inline W9 upload card */}
                    <Card className="border-2 border-dashed border-red-300 dark:border-red-700">
                      <CardHeader className="pb-3">
                        <CardTitle className="flex items-center gap-2 text-base text-red-700 dark:text-red-400">
                          <FileText className="h-4 w-4" />
                          Upload W9 for {selectedTechnician.firstName} {selectedTechnician.lastName}
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        <p className="text-sm text-muted-foreground">
                          Upload the technician's signed W9 document (PDF, JPG, or PNG). Once uploaded, you will be able to submit this payment request.
                        </p>
                        <input
                          ref={w9FileInputRef}
                          type="file"
                          accept=".pdf,.jpg,.jpeg,.png"
                          onChange={handleW9Upload}
                          className="hidden"
                          id="payment-w9-upload"
                        />
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => w9FileInputRef.current?.click()}
                          disabled={w9Uploading}
                          className="w-full border-red-300 text-red-700 hover:bg-red-50 dark:border-red-700 dark:text-red-400 dark:hover:bg-red-950/30"
                        >
                          <Upload className="h-4 w-4 mr-2" />
                          {w9Uploading ? "Uploading W9..." : "Click to Upload W9 Document"}
                        </Button>
                        <p className="text-xs text-muted-foreground text-center">
                          Accepted: PDF, JPG, PNG
                        </p>
                      </CardContent>
                    </Card>
                  </div>
                )}

                {/* Warning (not a block) when W9 is submitted but not yet verified */}
                {selectedTechnician && amount > 500 && w9Pending && (
                  <Alert className="border-yellow-300 bg-yellow-50 dark:bg-yellow-950/30 dark:border-yellow-700">
                    <AlertTriangle className="h-4 w-4 text-yellow-600" />
                    <AlertTitle className="text-yellow-800 dark:text-yellow-300 text-sm font-semibold">W9 Pending Verification</AlertTitle>
                    <AlertDescription className="text-yellow-700 dark:text-yellow-400 text-xs">
                      A W9 has been submitted for this technician but has not been verified yet. You can still submit the payment, but ensure the W9 is reviewed before processing.
                    </AlertDescription>
                  </Alert>
                )}

                {/* Payment Methods */}
                {selectedTechnician && availablePaymentMethods.length > 0 && (
                  <div className="space-y-4">
                    <div className="flex items-center gap-2">
                      <CreditCard className="h-4 w-4" />
                      <h3 className="text-lg font-semibold">Available Payment Methods</h3>
                    </div>

                    <FormField
                      control={form.control}
                      name="paymentMethods"
                      render={({ field }) => (
                        <FormItem>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {availablePaymentMethods.map((method: string) => {
                              const methodInfo = paymentMethodsInfo[method as keyof typeof paymentMethodsInfo];
                              if (!methodInfo) return null;
                              return (
                                <Card
                                  key={method}
                                  className={`cursor-pointer transition-all hover:shadow-md ${
                                    field.value.includes(method)
                                      ? methodInfo.color + " border-2"
                                      : "border hover:border-gray-300"
                                  }`}
                                >
                                  <CardContent className="p-4">
                                    <div className="flex items-start gap-3">
                                      <Checkbox
                                        checked={field.value.includes(method)}
                                        onCheckedChange={(checked) => {
                                          if (checked) {
                                            field.onChange([...field.value, method]);
                                          } else {
                                            field.onChange(field.value.filter((m: string) => m !== method));
                                          }
                                        }}
                                        className="mt-1"
                                      />
                                      <div className="flex-1">
                                        <div className="flex items-center gap-2 mb-2">
                                          {methodInfo.icon}
                                          <h4 className="font-semibold">{methodInfo.name}</h4>
                                        </div>
                                        <p className="text-sm text-muted-foreground mb-3">{methodInfo.description}</p>
                                        <div className="flex flex-wrap gap-1 mt-2">
                                          {methodInfo.features.map((feature, idx) => (
                                            <Badge key={idx} variant="secondary" className="text-xs">
                                              {feature}
                                            </Badge>
                                          ))}
                                        </div>
                                      </div>
                                    </div>
                                  </CardContent>
                                </Card>
                              );
                            })}
                          </div>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                )}

                <FormField
                  control={form.control}
                  name="dueDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Due Date (Optional)</FormLabel>
                      <FormControl>
                        <Input {...field} type="date" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Description (Optional)</FormLabel>
                      <FormControl>
                        <Textarea
                          {...field}
                          placeholder="Additional details about the payment request..."
                          rows={3}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="flex justify-end gap-3 pt-4">
                  <Button type="button" variant="outline" onClick={onClose}>
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    disabled={createPaymentMutation.isPending || paymentBlocked}
                    className={
                      paymentBlocked
                        ? "bg-gray-400 cursor-not-allowed"
                        : "bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700"
                    }
                    title={paymentBlocked ? "Upload a W9 for this technician to enable payment submission" : undefined}
                  >
                    {createPaymentMutation.isPending
                      ? "Creating..."
                      : paymentBlocked
                      ? "W9 Required to Submit"
                      : "Create Payment Request"}
                  </Button>
                </div>

              </form>
            </Form>
          </ScrollArea>
        </DialogContent>
      </Dialog>
      <TechnicianMapPickerModal
        isOpen={showMapPicker}
        onClose={() => setShowMapPicker(false)}
        onSelect={handleMapPickerSelect}
      />
    </AdvancedPermissionGuard>
  );
}
