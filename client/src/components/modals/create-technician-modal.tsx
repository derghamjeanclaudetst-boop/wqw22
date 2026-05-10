import { useState, useEffect, useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { CreditCard, FileText, Upload, Trash2, Download, CheckCircle, AlertCircle, Clock, Info } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Technician } from "@shared/schema";

interface CreateTechnicianModalProps {
  isOpen: boolean;
  onClose: () => void;
  technician: Technician | null;
}

export function CreateTechnicianModal({ isOpen, onClose, technician }: CreateTechnicianModalProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const w9FileInputRef = useRef<HTMLInputElement>(null);

  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    phone: "",
    email: "",
    location: "",
    latitude: "",
    longitude: "",
    specialization: "",
    experience: 0,
    hourlyRate: "",
    availability: "available",
    bankAccount: "",
    routingNumber: "",
    bankName: "",
    paypalEmail: "",
    venmoHandle: "",
    cashappHandle: "",
    zelleInfo: "",
    mailingAddress: "",
  });

  const [selectedPaymentMethods, setSelectedPaymentMethods] = useState<string[]>([]);
  const [w9Uploading, setW9Uploading] = useState(false);
  const [w9Deleting, setW9Deleting] = useState(false);
  const [w9Verifying, setW9Verifying] = useState(false);
  const [localW9Status, setLocalW9Status] = useState<string | null>(null);
  const [localW9FileName, setLocalW9FileName] = useState<string | null>(null);
  const [localW9SubmittedAt, setLocalW9SubmittedAt] = useState<string | null>(null);
  const [localW9FilePath, setLocalW9FilePath] = useState<string | null>(null);

  useEffect(() => {
    if (technician) {
      setFormData({
        firstName: technician.firstName || "",
        lastName: technician.lastName || "",
        phone: technician.phone || "",
        email: technician.email || "",
        location: technician.location || "",
        latitude: technician.latitude || "",
        longitude: technician.longitude || "",
        specialization: technician.specialization || "",
        experience: technician.experience || 0,
        hourlyRate: technician.hourlyRate || "",
        availability: technician.availability || "available",
        bankAccount: (technician as any).bankAccount || "",
        routingNumber: (technician as any).routingNumber || "",
        bankName: (technician as any).bankName || "",
        paypalEmail: (technician as any).paypalEmail || "",
        venmoHandle: (technician as any).venmoHandle || "",
        cashappHandle: (technician as any).cashappHandle || "",
        zelleInfo: (technician as any).zelleInfo || "",
        mailingAddress: (technician as any).mailingAddress || "",
      });
      try {
        const methods = technician.paymentMethods ? JSON.parse(technician.paymentMethods) : [];
        setSelectedPaymentMethods(methods);
      } catch {
        setSelectedPaymentMethods([]);
      }
      setLocalW9Status(technician.w9Status || null);
      setLocalW9FileName(technician.w9FileName || null);
      setLocalW9SubmittedAt(technician.w9SubmittedAt ? String(technician.w9SubmittedAt) : null);
      setLocalW9FilePath((technician as any).w9FilePath || null);
    } else {
      setFormData({
        firstName: "",
        lastName: "",
        phone: "",
        email: "",
        location: "",
        latitude: "",
        longitude: "",
        specialization: "",
        experience: 0,
        hourlyRate: "",
        availability: "available",
        bankAccount: "",
        routingNumber: "",
        bankName: "",
        paypalEmail: "",
        venmoHandle: "",
        cashappHandle: "",
        zelleInfo: "",
        mailingAddress: "",
      });
      setSelectedPaymentMethods([]);
      setLocalW9Status(null);
      setLocalW9FileName(null);
      setLocalW9SubmittedAt(null);
      setLocalW9FilePath(null);
    }
  }, [technician, isOpen]);

  const createTechnicianMutation = useMutation({
    mutationFn: (data: any) =>
      technician
        ? apiRequest("PUT", `/api/technicians/${technician.id}`, data)
        : apiRequest("POST", "/api/technicians", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/technicians"] });
      toast({
        title: "Success",
        description: technician ? "Technician updated successfully" : "Technician created successfully",
      });
      onClose();
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to save technician",
        variant: "destructive",
      });
    },
  });

  const handlePaymentMethodChange = (method: string, checked: boolean) => {
    if (checked) {
      setSelectedPaymentMethods(prev => [...prev, method]);
    } else {
      setSelectedPaymentMethods(prev => prev.filter(m => m !== method));
    }
  };

  const handleInputChange = (field: string, value: string | number) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.firstName.trim() || !formData.lastName.trim() || !formData.phone.trim()) {
      toast({ title: "Error", description: "First name, last name, and phone number are required", variant: "destructive" });
      return;
    }
    if (!formData.specialization.trim() || !formData.location.trim()) {
      toast({ title: "Error", description: "Specialization and location are required", variant: "destructive" });
      return;
    }

    createTechnicianMutation.mutate({
      ...formData,
      experience: Number(formData.experience),
      paymentMethods: JSON.stringify(selectedPaymentMethods),
    });
  };

  const handleW9Upload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!technician || !e.target.files?.[0]) return;
    const file = e.target.files[0];
    const allowedTypes = ["application/pdf", "image/jpeg", "image/png", "image/jpg"];
    if (!allowedTypes.includes(file.type)) {
      toast({ title: "Invalid file", description: "Only PDF, JPG, and PNG files are accepted for W9 documents", variant: "destructive" });
      return;
    }
    setW9Uploading(true);
    try {
      const formData = new FormData();
      formData.append("w9", file);
      const response = await fetch(`/api/technicians/${technician.id}/w9`, {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.message || "Upload failed");
      }
      const data = await response.json();
      setLocalW9Status("submitted");
      setLocalW9FileName(data.technician?.w9FileName || file.name);
      setLocalW9SubmittedAt(new Date().toISOString());
      setLocalW9FilePath(data.technician?.w9FilePath || null);
      queryClient.invalidateQueries({ queryKey: ["/api/technicians"] });
      toast({ title: "W9 Uploaded", description: "W9 document has been uploaded successfully." });
    } catch (error: any) {
      toast({ title: "Upload Failed", description: error.message || "Failed to upload W9", variant: "destructive" });
    } finally {
      setW9Uploading(false);
      if (w9FileInputRef.current) w9FileInputRef.current.value = "";
    }
  };

  const handleW9Delete = async () => {
    if (!technician) return;
    setW9Deleting(true);
    try {
      await apiRequest("DELETE", `/api/technicians/${technician.id}/w9`);
      setLocalW9Status(null);
      setLocalW9FileName(null);
      setLocalW9SubmittedAt(null);
      setLocalW9FilePath(null);
      queryClient.invalidateQueries({ queryKey: ["/api/technicians"] });
      toast({ title: "W9 Removed", description: "W9 document has been removed." });
    } catch (error: any) {
      toast({ title: "Error", description: error.message || "Failed to remove W9", variant: "destructive" });
    } finally {
      setW9Deleting(false);
    }
  };

  const handleW9Verify = async () => {
    if (!technician) return;
    setW9Verifying(true);
    try {
      await apiRequest("POST", `/api/technicians/${technician.id}/w9/verify`);
      setLocalW9Status("verified");
      queryClient.invalidateQueries({ queryKey: ["/api/technicians"] });
      toast({ title: "W9 Verified", description: "W9 document has been marked as verified." });
    } catch (error: any) {
      toast({ title: "Error", description: error.message || "Failed to verify W9", variant: "destructive" });
    } finally {
      setW9Verifying(false);
    }
  };

  const w9StatusBadge = () => {
    if (!localW9Status || !localW9FileName) {
      return <Badge variant="outline" className="text-gray-500 border-gray-300"><AlertCircle className="h-3 w-3 mr-1" />No W9 on File</Badge>;
    }
    if (localW9Status === "verified") {
      return <Badge className="bg-green-100 text-green-800 border-green-200"><CheckCircle className="h-3 w-3 mr-1" />Verified</Badge>;
    }
    return <Badge className="bg-yellow-100 text-yellow-800 border-yellow-200"><Clock className="h-3 w-3 mr-1" />Submitted – Pending Review</Badge>;
  };

  const paymentMethodOptions = [
    { value: "paypal", label: "PayPal", icon: "💳" },
    { value: "credit_card", label: "Credit/Debit Cards", icon: "💎" },
    { value: "bank_transfer", label: "Bank Transfer", icon: "🏦" },
    { value: "cash", label: "Cash Payment", icon: "💵" },
    { value: "venmo", label: "Venmo", icon: "📲" },
    { value: "cashapp", label: "Cash App", icon: "💸" },
    { value: "zelle", label: "Zelle", icon: "⚡" },
    { value: "check", label: "Check Payment", icon: "📝" },
  ];

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {technician ? "Edit Technician" : "Add New Technician"}
          </DialogTitle>
          <DialogDescription>
            {technician ? "Update technician information" : "Enter the details for the new technician"}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Basic Information */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="firstName">First Name *</Label>
              <Input id="firstName" value={formData.firstName} onChange={(e) => handleInputChange("firstName", e.target.value)} placeholder="Enter first name" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="lastName">Last Name *</Label>
              <Input id="lastName" value={formData.lastName} onChange={(e) => handleInputChange("lastName", e.target.value)} placeholder="Enter last name" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="phone">Phone Number *</Label>
              <Input id="phone" value={formData.phone} onChange={(e) => handleInputChange("phone", e.target.value)} placeholder="Enter phone number" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" value={formData.email} onChange={(e) => handleInputChange("email", e.target.value)} placeholder="Enter email address" />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="location">Location *</Label>
            <Input id="location" value={formData.location} onChange={(e) => handleInputChange("location", e.target.value)} placeholder="Enter location/address" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="specialization">Specialization *</Label>
              <Input id="specialization" value={formData.specialization} onChange={(e) => handleInputChange("specialization", e.target.value)} placeholder="e.g., HVAC, Plumbing, Electrical" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="experience">Years of Experience</Label>
              <Input id="experience" type="number" min="0" value={formData.experience} onChange={(e) => handleInputChange("experience", parseInt(e.target.value) || 0)} placeholder="Enter years" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="hourlyRate">Hourly Rate ($)</Label>
              <Input id="hourlyRate" type="number" step="0.01" min="0" value={formData.hourlyRate} onChange={(e) => handleInputChange("hourlyRate", e.target.value)} placeholder="Enter hourly rate" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="availability">Availability</Label>
              <Select value={formData.availability} onValueChange={(value) => handleInputChange("availability", value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select availability" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="available">Available</SelectItem>
                  <SelectItem value="busy">Busy</SelectItem>
                  <SelectItem value="unavailable">Unavailable</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="latitude">Latitude (Optional)</Label>
              <Input id="latitude" type="number" step="any" value={formData.latitude} onChange={(e) => handleInputChange("latitude", e.target.value)} placeholder="Enter latitude" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="longitude">Longitude (Optional)</Label>
              <Input id="longitude" type="number" step="any" value={formData.longitude} onChange={(e) => handleInputChange("longitude", e.target.value)} placeholder="Enter longitude" />
            </div>
          </div>

          {/* W9 Document Section */}
          <Card className="border-2">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <FileText className="h-4 w-4 text-blue-600" />
                W9 Tax Document
              </CardTitle>
              <DialogDescription>
                Required for IRS reporting. Payments over $600/year require a verified W9 on file.
              </DialogDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {!technician ? (
                <Alert>
                  <Info className="h-4 w-4" />
                  <AlertDescription>
                    Save the technician first, then re-open to upload their W9 document.
                  </AlertDescription>
                </Alert>
              ) : (
                <>
                  {/* Status row */}
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Status:</span>
                    {w9StatusBadge()}
                  </div>

                  {/* File info if W9 exists */}
                  {localW9FileName && (
                    <div className="p-3 rounded-lg bg-muted/50 border space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <FileText className="h-4 w-4 text-blue-600 shrink-0" />
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate">{localW9FileName}</p>
                            {localW9SubmittedAt && (
                              <p className="text-xs text-muted-foreground">
                                Uploaded {new Date(localW9SubmittedAt).toLocaleDateString()}
                              </p>
                            )}
                          </div>
                        </div>
                        <div className="flex gap-1 shrink-0">
                          {localW9FilePath && (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => window.open(localW9FilePath!, "_blank")}
                            >
                              <Download className="h-3 w-3 mr-1" />
                              View
                            </Button>
                          )}
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={handleW9Delete}
                            disabled={w9Deleting}
                            className="text-red-600 hover:text-red-700 hover:border-red-300"
                          >
                            <Trash2 className="h-3 w-3 mr-1" />
                            {w9Deleting ? "Removing..." : "Remove"}
                          </Button>
                        </div>
                      </div>

                      {/* Verify button — only visible when submitted but not yet verified */}
                      {localW9Status === "submitted" && (
                        <Alert className="border-yellow-200 bg-yellow-50 dark:bg-yellow-950/20 py-2">
                          <AlertCircle className="h-3 w-3 text-yellow-600" />
                          <AlertDescription className="text-xs text-yellow-800 dark:text-yellow-300 flex items-center justify-between">
                            <span>Document pending admin review</span>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={handleW9Verify}
                              disabled={w9Verifying}
                              className="ml-2 h-6 text-xs border-yellow-400 text-yellow-800 hover:bg-yellow-100 dark:text-yellow-300"
                            >
                              <CheckCircle className="h-3 w-3 mr-1" />
                              {w9Verifying ? "Verifying..." : "Mark as Verified"}
                            </Button>
                          </AlertDescription>
                        </Alert>
                      )}

                      {localW9Status === "verified" && (
                        <Alert className="border-green-200 bg-green-50 dark:bg-green-950/20 py-2">
                          <CheckCircle className="h-3 w-3 text-green-600" />
                          <AlertDescription className="text-xs text-green-800 dark:text-green-300">
                            W9 has been reviewed and verified. This technician can receive payments without restrictions.
                          </AlertDescription>
                        </Alert>
                      )}
                    </div>
                  )}

                  {/* Upload button */}
                  <div>
                    <input
                      ref={w9FileInputRef}
                      type="file"
                      accept=".pdf,.jpg,.jpeg,.png"
                      onChange={handleW9Upload}
                      className="hidden"
                      id="w9-upload-input"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => w9FileInputRef.current?.click()}
                      disabled={w9Uploading}
                      className="w-full border-dashed"
                    >
                      <Upload className="h-4 w-4 mr-2" />
                      {w9Uploading
                        ? "Uploading..."
                        : localW9FileName
                        ? "Replace W9 Document"
                        : "Upload W9 Document"}
                    </Button>
                    <p className="text-xs text-muted-foreground mt-1 text-center">
                      Accepted formats: PDF, JPG, PNG
                    </p>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* Payment Methods */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CreditCard className="h-4 w-4" />
                Payment Methods
              </CardTitle>
              <DialogDescription>
                Select the payment methods this technician accepts and enter payment details
              </DialogDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                {paymentMethodOptions.map((method) => (
                  <div key={method.value} className="flex items-center space-x-2">
                    <Checkbox
                      id={method.value}
                      checked={selectedPaymentMethods.includes(method.value)}
                      onCheckedChange={(checked) => handlePaymentMethodChange(method.value, checked as boolean)}
                    />
                    <Label htmlFor={method.value} className="flex items-center gap-2 cursor-pointer">
                      <span>{method.icon}</span>
                      <span>{method.label}</span>
                    </Label>
                  </div>
                ))}
              </div>

              {selectedPaymentMethods.includes("bank_transfer") && (
                <div className="space-y-3 p-4 border rounded-lg bg-muted/50">
                  <h4 className="font-medium">Bank Transfer Details</h4>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label htmlFor="bankAccount">Account Number</Label>
                      <Input id="bankAccount" value={formData.bankAccount} onChange={(e) => handleInputChange("bankAccount", e.target.value)} placeholder="Enter account number" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="routingNumber">Routing Number</Label>
                      <Input id="routingNumber" value={formData.routingNumber} onChange={(e) => handleInputChange("routingNumber", e.target.value)} placeholder="Enter routing number" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="bankName">Bank Name</Label>
                    <Input id="bankName" value={formData.bankName} onChange={(e) => handleInputChange("bankName", e.target.value)} placeholder="Enter bank name" />
                  </div>
                </div>
              )}

              {selectedPaymentMethods.includes("paypal") && (
                <div className="space-y-3 p-4 border rounded-lg bg-muted/50">
                  <h4 className="font-medium">PayPal Details</h4>
                  <div className="space-y-2">
                    <Label htmlFor="paypalEmail">PayPal Email</Label>
                    <Input id="paypalEmail" type="email" value={formData.paypalEmail} onChange={(e) => handleInputChange("paypalEmail", e.target.value)} placeholder="Enter PayPal email" />
                  </div>
                </div>
              )}

              {selectedPaymentMethods.includes("venmo") && (
                <div className="space-y-3 p-4 border rounded-lg bg-muted/50">
                  <h4 className="font-medium">Venmo Details</h4>
                  <div className="space-y-2">
                    <Label htmlFor="venmoHandle">Venmo Handle</Label>
                    <Input id="venmoHandle" value={formData.venmoHandle} onChange={(e) => handleInputChange("venmoHandle", e.target.value)} placeholder="Enter Venmo handle (e.g., @username)" />
                  </div>
                </div>
              )}

              {selectedPaymentMethods.includes("cashapp") && (
                <div className="space-y-3 p-4 border rounded-lg bg-muted/50">
                  <h4 className="font-medium">Cash App Details</h4>
                  <div className="space-y-2">
                    <Label htmlFor="cashappHandle">Cash App Handle</Label>
                    <Input id="cashappHandle" value={formData.cashappHandle} onChange={(e) => handleInputChange("cashappHandle", e.target.value)} placeholder="Enter Cash App handle (e.g., $username)" />
                  </div>
                </div>
              )}

              {selectedPaymentMethods.includes("zelle") && (
                <div className="space-y-3 p-4 border rounded-lg bg-muted/50">
                  <h4 className="font-medium">Zelle Details</h4>
                  <div className="space-y-2">
                    <Label htmlFor="zelleInfo">Zelle Email/Phone</Label>
                    <Input id="zelleInfo" value={formData.zelleInfo} onChange={(e) => handleInputChange("zelleInfo", e.target.value)} placeholder="Enter Zelle email or phone number" />
                  </div>
                </div>
              )}

              {selectedPaymentMethods.includes("check") && (
                <div className="space-y-3 p-4 border rounded-lg bg-muted/50">
                  <h4 className="font-medium">Mailing Address for Checks</h4>
                  <div className="space-y-2">
                    <Label htmlFor="mailingAddress">Mailing Address</Label>
                    <Input id="mailingAddress" value={formData.mailingAddress} onChange={(e) => handleInputChange("mailingAddress", e.target.value)} placeholder="Enter complete mailing address" />
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Submit Buttons */}
          <div className="flex justify-end gap-3 pt-4">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={createTechnicianMutation.isPending}>
              {createTechnicianMutation.isPending
                ? (technician ? "Updating..." : "Creating...")
                : (technician ? "Update Technician" : "Create Technician")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
