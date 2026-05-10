import { useState, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import type { Role, UserWithRole } from "@shared/schema";

interface AssignRoleModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: UserWithRole | null;
}

export function AssignRoleModal({ isOpen, onClose, user }: AssignRoleModalProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedRoleId, setSelectedRoleId] = useState<string>("");

  const { data: roles = [] } = useQuery<Role[]>({
    queryKey: ["/api/roles"],
    enabled: isOpen,
  });

  // Set current role when user changes
  useEffect(() => {
    if (user && isOpen) {
      setSelectedRoleId(user.role?.id?.toString() || "");
    }
  }, [user, isOpen]);

  const assignRoleMutation = useMutation({
    mutationFn: ({ userId, roleId }: { userId: number; roleId: number }) => 
      apiRequest("POST", `/api/users/${userId}/role`, { roleId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      toast({
        title: "Success",
        description: "Role assigned successfully",
      });
      onClose();
    },
    onError: (error: any) => {
      console.error("Assign role error:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to assign role",
        variant: "destructive",
      });
    },
  });

  const handleAssignRole = () => {
    if (!user || !selectedRoleId) return;
    
    const roleId = parseInt(selectedRoleId);
    if (roleId === user.role?.id) {
      toast({
        title: "No Change",
        description: "User already has this role assigned",
      });
      return;
    }

    assignRoleMutation.mutate({ userId: user.id, roleId });
  };

  if (!user) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Assign Role</DialogTitle>
          <DialogDescription>
            Change the role for {user.firstName} {user.lastName} ({user.username})
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium text-gray-700">Current Role</label>
            <div className="mt-1 text-sm text-gray-600 bg-gray-50 px-3 py-2 rounded-md">
              {user.role?.name || "No role assigned"}
            </div>
          </div>

          <div>
            <label className="text-sm font-medium text-gray-700">New Role</label>
            <Select value={selectedRoleId} onValueChange={setSelectedRoleId}>
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="Select a role" />
              </SelectTrigger>
              <SelectContent>
                {roles.filter((role) => role.name !== "admin").map((role) => (
                  <SelectItem key={role.id} value={role.id.toString()}>
                    <div>
                      <div className="font-medium">{role.name}</div>
                      <div className="text-sm text-gray-500">{role.description}</div>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex justify-end space-x-2 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={assignRoleMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              onClick={handleAssignRole}
              disabled={assignRoleMutation.isPending || !selectedRoleId}
            >
              {assignRoleMutation.isPending ? "Assigning..." : "Assign Role"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}