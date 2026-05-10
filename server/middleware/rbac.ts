import { Request, Response, NextFunction } from "express";
import { storage } from "../storage";

export const requirePermission = (permissionName: string) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ message: "Authentication required" });
    }

    try {
      const userPermissions = await storage.getUserPermissions(req.user.id);
      const hasPermission = userPermissions.some(perm => perm.name === permissionName);

      if (!hasPermission) {
        return res.status(403).json({ 
          message: `Permission denied. Required permission: ${permissionName}` 
        });
      }

      next();
    } catch (error) {
      res.status(500).json({ message: "Permission check error" });
    }
  };
};

export const requireAdmin = async (req: Request, res: Response, next: NextFunction) => {
  if (!req.user) {
    return res.status(401).json({ message: "Authentication required" });
  }
  try {
    const userPermissions = await storage.getUserPermissions(req.user.id);
    const isAdmin = userPermissions.some(perm => perm.name === "system.admin");
    if (!isAdmin) {
      return res.status(403).json({ message: "Admin access required" });
    }
    next();
  } catch (error) {
    res.status(500).json({ message: "Permission check error" });
  }
};

export const requireAnyPermission = (permissionNames: string[]) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ message: "Authentication required" });
    }

    try {
      const userPermissions = await storage.getUserPermissions(req.user.id);
      const hasAnyPermission = permissionNames.some(permName => 
        userPermissions.some(perm => perm.name === permName)
      );

      if (!hasAnyPermission) {
        return res.status(403).json({ 
          message: `Permission denied. Required permissions: ${permissionNames.join(", ")}` 
        });
      }

      next();
    } catch (error) {
      res.status(500).json({ message: "Permission check error" });
    }
  };
};
