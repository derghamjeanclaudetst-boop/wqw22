import { useState, useEffect } from "react";
import React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Dialog,
  DialogContent,
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
import { Separator } from "@/components/ui/separator";
import { Receipt } from "lucide-react";

const invoiceSchema = z.object({
  laborCost: z.string().min(1, "Labor cost is required"),
  materialCost: z.string().min(1, "Material cost is required"),
  taxRate: z.string().min(1, "Tax rate is required"),
  taxAmount: z.string().optional(),
  totalAmount: z.string().optional(),
  status: z.enum(["draft", "sent", "paid"]),
  notes: z.string().optional(),
});

type InvoiceFormData = z.infer<typeof invoiceSchema>;

interface CreateInvoiceModalProps {
  isOpen: boolean;
  onClose: () => void;
  workOrderId?: number;
  onSubmit: (data: any) => void;
  isLoading: boolean;
  initialData?: any;
  mode?: "create" | "edit";
}

export function CreateInvoiceModal({
  isOpen,
  onClose,
  workOrderId,
  onSubmit,
  isLoading,
  initialData,
  mode = "create",
}: CreateInvoiceModalProps) {
  const [calculatedValues, setCalculatedValues] = useState({
    taxAmount: 0,
    totalAmount: 0,
  });

  const form = useForm<InvoiceFormData>({
    resolver: zodResolver(invoiceSchema),
    defaultValues: {
      laborCost: "",
      materialCost: "",
      taxRate: "10", // Default 10% tax
      taxAmount: "",
      totalAmount: "",
      status: "draft",
      notes: "",
    },
  });

  const watchedValues = form.watch(["laborCost", "materialCost", "taxRate"]);

  // Calculate totals when values change
  const calculateTotals = () => {
    const laborCost = parseFloat(watchedValues[0] || "0");
    const materialCost = parseFloat(watchedValues[1] || "0");
    const taxRate = parseFloat(watchedValues[2] || "0");
    
    const subtotal = laborCost + materialCost;
    const taxAmount = subtotal * (taxRate / 100);
    const totalAmount = subtotal + taxAmount;

    setCalculatedValues({
      taxAmount,
      totalAmount,
    });

    // Update form with calculated values
    form.setValue("taxAmount", taxAmount.toFixed(2));
    form.setValue("totalAmount", totalAmount.toFixed(2));
  };

  // Recalculate when watched values change
  React.useEffect(() => {
    calculateTotals();
  }, watchedValues);

  const handleSubmit = (data: InvoiceFormData) => {
    onSubmit({
      ...data,
      taxAmount: calculatedValues.taxAmount.toFixed(2),
      totalAmount: calculatedValues.totalAmount.toFixed(2),
    });
  };

  const subtotal = parseFloat(watchedValues[0] || "0") + parseFloat(watchedValues[1] || "0");

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            ABC Corporation - {mode === "edit" ? "Edit Invoice" : "Create Invoice"}
          </DialogTitle>
          <p className="text-sm text-gray-600">
            {mode === "edit" ? "Edit invoice details" : "Create or edit invoice for work order"}
          </p>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
            {/* Invoice Details */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center">
                  <Receipt className="h-5 w-5 mr-2" />
                  ABC Corporation Invoice Details
                </CardTitle>
                <p className="text-sm text-gray-600">Professional invoice for work order services</p>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="laborCost"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Labor Cost ($)</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            type="number"
                            step="0.01"
                            placeholder="0.00"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="materialCost"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Material Cost ($)</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            type="number"
                            step="0.01"
                            placeholder="0.00"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="taxRate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Tax Rate (%)</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            type="number"
                            step="0.01"
                            placeholder="10.00"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="status"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Status</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select status" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="draft">Draft</SelectItem>
                            <SelectItem value="sent">Sent</SelectItem>
                            <SelectItem value="paid">Paid</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="notes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Notes (Optional)</FormLabel>
                      <FormControl>
                        <Textarea
                          {...field}
                          placeholder="Additional notes or payment terms..."
                          rows={3}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </CardContent>
            </Card>

            {/* Invoice Summary */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Invoice Summary</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">Subtotal:</span>
                  <span className="font-medium">${subtotal.toFixed(2)}</span>
                </div>
                
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">
                    Tax ({watchedValues[2] || 0}%):
                  </span>
                  <span className="font-medium">${calculatedValues.taxAmount.toFixed(2)}</span>
                </div>
                
                <Separator />
                
                <div className="flex justify-between items-center">
                  <span className="text-lg font-semibold">ABC Corporation Total:</span>
                  <Badge variant="outline" className="text-lg font-bold bg-blue-50 text-blue-700">
                    ${calculatedValues.totalAmount.toFixed(2)}
                  </Badge>
                </div>
              </CardContent>
            </Card>

            {/* Action Buttons */}
            <div className="flex justify-end space-x-2">
              <Button
                type="button"
                variant="outline"
                onClick={onClose}
                disabled={isLoading}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isLoading} className="bg-blue-600 hover:bg-blue-700">
                {isLoading ? "Processing..." : "Save Invoice"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}