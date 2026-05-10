import type { Express } from "express";
import express from "express";
import { createServer, type Server } from "http";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import OpenAI from "openai";
import { storage } from "./storage";
import { pool } from "./db";
import { requireAuth } from "./middleware/auth";
import { requirePermission, requireAnyPermission, requireAdmin } from "./middleware/rbac";
import { insertUserSchema, insertTechnicianSchema, insertRatingSchema, insertWorkOrderSchema, insertWorkOrderProposalSchema, insertWorkOrderPartsRequestSchema, insertWorkOrderFileSchema, insertWorkOrderChatSchema, insertWorkOrderTechnicianPaymentSchema, loginSchema, insertClientSchema } from "@shared/schema";
import { z } from "zod";
import { fromZodError } from "zod-validation-error";
import bcrypt from "bcrypt";
import multer from "multer";
import path from "path";
import fs from "fs";
import AdmZip from "adm-zip";

declare module 'express-session' {
  interface SessionData {
    userId: number;
  }
}

// Logo upload middleware
const logoStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    const dir = path.join(process.cwd(), 'uploads', 'logo');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (_req, file, cb) => {
    cb(null, `logo${path.extname(file.originalname).toLowerCase()}`);
  },
});
const uploadLogo = multer({
  storage: logoStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['.jpg', '.jpeg', '.png', '.svg', '.webp', '.gif'];
    if (allowed.includes(path.extname(file.originalname).toLowerCase())) cb(null, true);
    else cb(new Error('Only image files are allowed for the logo'));
  },
});

// Setup file upload middleware
const storage_multer = multer.diskStorage({
  destination: (req, file, cb) => {
    const workOrderId = req.params.id;
    const uploadPath = path.join(process.cwd(), 'uploads', workOrderId);
    
    // Create directory if it doesn't exist
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }
    
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    // Generate unique filename
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const ALLOWED_UPLOAD_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.pdf', '.txt', '.doc', '.docx', '.xls', '.xlsx', '.csv', '.zip'];
const ALLOWED_UPLOAD_MIME = ['image/jpeg','image/png','image/gif','image/webp','application/pdf','text/plain','text/csv','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','application/zip'];

const upload = multer({ 
  storage: storage_multer,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ALLOWED_UPLOAD_EXTENSIONS.includes(ext) && ALLOWED_UPLOAD_MIME.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`File type not allowed. Allowed types: ${ALLOWED_UPLOAD_EXTENSIONS.join(', ')}`));
    }
  }
});

// W9 file upload middleware (stores under uploads/w9/{technicianId}/)
const w9Storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const technicianId = req.params.id;
    const uploadPath = path.join(process.cwd(), 'uploads', 'w9', technicianId);
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'w9-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const uploadW9 = multer({
  storage: w9Storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['.pdf', '.jpg', '.jpeg', '.png', '.doc', '.docx'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Only PDF, image, and Word documents are allowed for W9'));
    }
  }
});

export async function registerRoutes(app: Express): Promise<Server> {
  // Serve uploads directory as static (logos, W9s, work order files)
  // Cache uploaded assets for 1 day (they are content-addressed by timestamp)
  app.use('/uploads', express.static(path.join(process.cwd(), 'uploads'), {
    maxAge: '1d',
    etag: true,
    lastModified: true,
  }));

  // Initialize system_settings table and seed defaults
  await pool.query(`
    CREATE TABLE IF NOT EXISTS system_settings (
      key VARCHAR(255) PRIMARY KEY,
      value TEXT NOT NULL DEFAULT ''
    )
  `);
  await pool.query(`INSERT INTO system_settings (key, value) VALUES ('system_name', 'NOVIQ') ON CONFLICT DO NOTHING`);
  await pool.query(`INSERT INTO system_settings (key, value) VALUES ('logo_url', '') ON CONFLICT DO NOTHING`);
  await pool.query(`INSERT INTO system_settings (key, value) VALUES ('admin_pin_hash', '') ON CONFLICT DO NOTHING`);

  // Trust Replit's reverse proxy so HTTPS cookies work correctly in production
  app.set('trust proxy', 1);

  // Session configuration
  const sessionSecret = process.env.SESSION_SECRET;
  if (!sessionSecret && process.env.NODE_ENV === 'production') {
    console.error('FATAL: SESSION_SECRET environment variable is not set in production. Refusing to start.');
    process.exit(1);
  }

  // Use PostgreSQL session store to persist sessions across restarts and prevent memory leaks
  const PgSession = connectPgSimple(session);
  const sessionStore = new PgSession({
    pool,
    tableName: 'session',
    createTableIfMissing: true,
  });

  app.use(session({
    store: sessionStore,
    secret: sessionSecret || 'dev-only-secret-change-in-production',
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === 'production',
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 24 * 60 * 60 * 1000 // 24 hours
    }
  }));

  // ── Admin PIN endpoints ────────────────────────────────────────────────────
  app.get("/api/settings/admin-pin/status", async (_req, res) => {
    try {
      const r = await pool.query<{ value: string }>(`SELECT value FROM system_settings WHERE key = 'admin_pin_hash'`);
      res.json({ hasPIN: (r.rows[0]?.value || '').length > 0 });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.post("/api/settings/admin-pin/verify", requireAuth, async (req, res) => {
    try {
      const { pin } = req.body;
      if (!pin) return res.status(400).json({ message: 'PIN required' });
      const r = await pool.query<{ value: string }>(`SELECT value FROM system_settings WHERE key = 'admin_pin_hash'`);
      const hash = r.rows[0]?.value || '';
      if (!hash) return res.json({ success: true }); // no PIN set
      const match = await bcrypt.compare(String(pin), hash);
      if (match) res.json({ success: true });
      else res.status(401).json({ message: 'Incorrect PIN' });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.patch("/api/settings/admin-pin", requireAuth, async (req, res) => {
    try {
      const { pin, currentPin } = req.body;
      if (!pin) return res.status(400).json({ message: 'New PIN required' });
      if (!/^\d{4,8}$/.test(String(pin))) return res.status(400).json({ message: 'PIN must be 4–8 digits' });
      const r = await pool.query<{ value: string }>(`SELECT value FROM system_settings WHERE key = 'admin_pin_hash'`);
      const existingHash = r.rows[0]?.value || '';
      if (existingHash) {
        if (!currentPin) return res.status(400).json({ message: 'Current PIN required' });
        const match = await bcrypt.compare(String(currentPin), existingHash);
        if (!match) return res.status(401).json({ message: 'Current PIN is incorrect' });
      }
      const hash = await bcrypt.hash(String(pin), 12);
      await pool.query(`INSERT INTO system_settings (key, value) VALUES ('admin_pin_hash', $1) ON CONFLICT (key) DO UPDATE SET value = $1`, [hash]);
      res.json({ success: true });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.delete("/api/settings/admin-pin", requireAuth, async (req, res) => {
    try {
      const { currentPin } = req.body;
      const r = await pool.query<{ value: string }>(`SELECT value FROM system_settings WHERE key = 'admin_pin_hash'`);
      const existingHash = r.rows[0]?.value || '';
      if (existingHash) {
        if (!currentPin) return res.status(400).json({ message: 'Current PIN required' });
        const match = await bcrypt.compare(String(currentPin), existingHash);
        if (!match) return res.status(401).json({ message: 'Current PIN is incorrect' });
      }
      await pool.query(`INSERT INTO system_settings (key, value) VALUES ('admin_pin_hash', '') ON CONFLICT (key) DO UPDATE SET value = ''`);
      res.json({ success: true });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  // ── System Settings endpoints (must be after session middleware) ────────────
  app.get("/api/settings/system", async (_req, res) => {
    try {
      const result = await pool.query<{ key: string; value: string }>(
        `SELECT key, value FROM system_settings WHERE key IN ('system_name', 'logo_url')`
      );
      const map = Object.fromEntries(result.rows.map(r => [r.key, r.value]));
      res.json({ systemName: map.system_name || 'NOVIQ', logoUrl: map.logo_url || '' });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.patch("/api/settings/system", requireAuth, async (req, res) => {
    try {
      const { systemName, logoUrl } = req.body;
      if (systemName !== undefined) {
        const name = String(systemName).trim() || 'NOVIQ';
        await pool.query(`INSERT INTO system_settings (key, value) VALUES ('system_name', $1) ON CONFLICT (key) DO UPDATE SET value = $1`, [name]);
      }
      if (logoUrl !== undefined) {
        await pool.query(`INSERT INTO system_settings (key, value) VALUES ('logo_url', $1) ON CONFLICT (key) DO UPDATE SET value = $1`, [logoUrl]);
      }
      const result = await pool.query<{ key: string; value: string }>(`SELECT key, value FROM system_settings WHERE key IN ('system_name', 'logo_url')`);
      const map = Object.fromEntries(result.rows.map(r => [r.key, r.value]));
      res.json({ systemName: map.system_name || 'NOVIQ', logoUrl: map.logo_url || '' });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/settings/logo", requireAuth, uploadLogo.single('logo'), async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ message: 'No file uploaded' });
      const logoUrl = `/uploads/logo/${req.file.filename}`;
      await pool.query(`INSERT INTO system_settings (key, value) VALUES ('logo_url', $1) ON CONFLICT (key) DO UPDATE SET value = $1`, [logoUrl]);
      res.json({ logoUrl });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.delete("/api/settings/logo", requireAuth, async (_req, res) => {
    try {
      const result = await pool.query<{ value: string }>(`SELECT value FROM system_settings WHERE key = 'logo_url'`);
      const oldUrl = result.rows[0]?.value;
      if (oldUrl && oldUrl.startsWith('/uploads/')) {
        const filePath = path.join(process.cwd(), oldUrl);
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      }
      await pool.query(`INSERT INTO system_settings (key, value) VALUES ('logo_url', '') ON CONFLICT (key) DO UPDATE SET value = ''`);
      res.json({ logoUrl: '' });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // Auth routes
  app.post("/api/auth/login", async (req, res) => {
    try {
      const { username, password } = req.body;
      if (!username || !password) {
        return res.status(400).json({ message: "Username and password are required" });
      }
      
      const user = await storage.verifyPassword(username, password);
      
      if (!user) {
        return res.status(401).json({ message: "Invalid credentials" });
      }

      if (!user.isActive) {
        return res.status(401).json({ message: "Account is inactive" });
      }

      req.session.userId = user.id;
      
      const userRole = await storage.getUserRole(user.id);
      const userPermissions = await storage.getUserPermissions(user.id);
      
      res.json({ 
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          isActive: user.isActive
        },
        role: userRole,
        permissions: userPermissions.map(p => p.name)
      });
    } catch (error) {
      console.error("Login error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/auth/logout", (req, res) => {
    req.session.destroy((err) => {
      if (err) {
        return res.status(500).json({ message: "Logout failed" });
      }
      res.json({ message: "Logged out successfully" });
    });
  });

  app.get("/api/auth/me", requireAuth, async (req, res) => {
    try {
      const userRole = await storage.getUserRole(req.user.id);
      const userPermissions = await storage.getUserPermissions(req.user.id);
      
      res.json({
        user: {
          id: req.user.id,
          username: req.user.username,
          email: req.user.email,
          firstName: req.user.firstName,
          lastName: req.user.lastName,
          isActive: req.user.isActive
        },
        role: userRole,
        permissions: userPermissions.map(p => p.name)
      });
    } catch (error) {
      res.status(500).json({ message: "Failed to get user info" });
    }
  });

  // User routes
  app.get("/api/users", requireAuth, requirePermission("users.list.view"), async (req, res) => {
    try {
      const users = await storage.getAllUsers();
      res.json(users);
    } catch (error) {
      res.status(500).json({ message: "Failed to get users" });
    }
  });

  app.post("/api/users", requireAuth, requirePermission("users.create"), async (req, res) => {
    try {
      console.log("Creating user with data:", req.body);
      
      // Validate required fields manually since the schema might not catch everything
      const { username, email, firstName, lastName, password, roleId } = req.body;
      if (!username || !email || !firstName || !lastName || !password) {
        throw new Error("Missing required fields");
      }
      
      // Validate role is provided and has permissions
      if (!roleId) {
        throw new Error("Role is required. Please select a role for this user.");
      }
      
      // Check if the role exists and has permissions
      const rolePermissions = await storage.getRolePermissions(roleId);
      if (rolePermissions.length === 0) {
        console.log(`Role ${roleId} has no permissions - blocking user creation`);
        throw new Error("Selected role has no permissions. Please assign permissions to this role first, or choose a different role.");
      }
      
      const userData = insertUserSchema.parse(req.body);
      
      // Hash password
      const hashedPassword = await bcrypt.hash(userData.password, 10);
      const userWithHashedPassword = { ...userData, password: hashedPassword };
      
      const user = await storage.createUser(userWithHashedPassword);
      console.log("User created:", user);
      
      // Assign role (now required)
      console.log("Assigning role:", roleId);
      await storage.assignUserRole(user.id, roleId);
      
      res.status(201).json(user);
    } catch (error: any) {
      console.error("Error creating user:", error);
      
      let message = "Failed to create user";
      const isUniqueViolation = error.code === '23505';
      if (isUniqueViolation) {
        const msg = error.message || "";
        if (msg.includes('username')) {
          message = "Username already exists. Please choose a different username.";
        } else if (msg.includes('email')) {
          message = "Email address is already in use. Please use a different email.";
        } else {
          message = "A user with this information already exists.";
        }
      } else if (error instanceof Error) {
        message = error.message;
      }
      
      res.status(400).json({ 
        message,
        error: error.code || error.message
      });
    }
  });

  app.put("/api/users/:id", requireAuth, requirePermission("users.edit"), async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      // Whitelist allowed fields to prevent mass assignment
      const { firstName, lastName, email, username, password, roleId, isActive, phone, department } = req.body;
      const userData: Record<string, any> = {};
      if (firstName !== undefined) userData.firstName = firstName;
      if (lastName !== undefined) userData.lastName = lastName;
      if (email !== undefined) userData.email = email;
      if (username !== undefined) userData.username = username;
      if (roleId !== undefined) userData.roleId = parseInt(roleId);
      if (isActive !== undefined) userData.isActive = isActive;
      if (phone !== undefined) userData.phone = phone;
      if (department !== undefined) userData.department = department;
      
      // Hash password if provided
      if (password) {
        userData.password = await bcrypt.hash(password, 10);
      }
      
      const user = await storage.updateUser(id, userData);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      
      res.json(user);
    } catch (error) {
      res.status(400).json({ message: "Failed to update user" });
    }
  });

  app.delete("/api/users/:id", requireAuth, requirePermission("users.delete"), async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const deleted = await storage.deleteUser(id);
      if (!deleted) {
        return res.status(404).json({ message: "User not found" });
      }
      res.json({ message: "User deleted successfully" });
    } catch (error) {
      res.status(500).json({ message: "Failed to delete user" });
    }
  });

  app.post("/api/users/:id/role", requireAuth, requirePermission("roles.assign"), async (req, res) => {
    try {
      const userId = parseInt(req.params.id);
      const { roleId } = req.body;
      
      // Remove existing role first
      const existingRole = await storage.getUserRole(userId);
      if (existingRole) {
        await storage.removeUserRole(userId, existingRole.id);
      }
      
      // Assign new role
      await storage.assignUserRole(userId, roleId);
      res.json({ message: "Role assigned successfully" });
    } catch (error) {
      res.status(400).json({ message: "Failed to assign role" });
    }
  });

  // Role routes
  app.get("/api/roles", requireAuth, requirePermission("roles.list.view"), async (req, res) => {
    try {
      const roles = await storage.getAllRoles();
      res.json(roles);
    } catch (error) {
      res.status(500).json({ message: "Failed to get roles" });
    }
  });

  app.post("/api/roles", requireAuth, requirePermission("roles.create"), async (req, res) => {
    try {
      const { name, description, permissionIds = [] } = req.body;
      
      console.log("Creating role with data:", { name, description, permissionIds });
      
      // Create the role
      const role = await storage.createRole({ name, description });
      console.log("Role created:", role);
      
      // Assign permissions to the role
      for (const permissionId of permissionIds) {
        await storage.assignRolePermission(role.id, permissionId);
      }
      
      // Return the role with permissions
      const roleWithPermissions = await storage.getAllRoles();
      const createdRole = roleWithPermissions.find(r => r.id === role.id);
      
      res.status(201).json(createdRole || role);
    } catch (error) {
      console.error("Error creating role:", error);
      res.status(400).json({ 
        message: "Failed to create role", 
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });

  app.get("/api/permissions", requireAuth, requirePermission("permissions.view"), async (req, res) => {
    try {
      const permissions = await storage.getAllPermissions();
      res.json(permissions);
    } catch (error) {
      res.status(500).json({ message: "Failed to get permissions" });
    }
  });

  app.post("/api/roles/:id/permissions", requireAuth, requirePermission("permissions.assign"), async (req, res) => {
    try {
      const roleId = parseInt(req.params.id);
      const { permissionIds } = req.body;
      
      console.log(`Updating permissions for role ${roleId}:`, permissionIds);
      
      // Remove existing permissions
      const existingPermissions = await storage.getRolePermissions(roleId);
      for (const perm of existingPermissions) {
        await storage.removeRolePermission(roleId, perm.id);
      }
      
      // Assign new permissions
      for (const permissionId of permissionIds) {
        await storage.assignRolePermission(roleId, permissionId);
      }
      
      res.json({ message: "Permissions updated successfully" });
    } catch (error) {
      console.error("Error updating role permissions:", error);
      res.status(400).json({ 
        message: "Failed to update permissions",
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });



  // Technician routes
  app.get("/api/technicians", requireAuth, requirePermission("technicians.list.view"), async (req, res) => {
    try {
      const technicians = await storage.getAllTechnicians();
      res.json(technicians);
    } catch (error) {
      console.error("Error fetching technicians:", error);
      res.status(500).json({ message: "Failed to get technicians", error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.post("/api/technicians", requireAuth, requirePermission("technicians.create"), async (req, res) => {
    try {
      const technicianData = insertTechnicianSchema.parse(req.body);
      const technician = await storage.createTechnician(technicianData);
      res.status(201).json(technician);
    } catch (error) {
      console.error("Error creating technician:", error);
      res.status(400).json({ 
        message: "Failed to create technician", 
        error: error instanceof Error ? error.message : String(error) 
      });
    }
  });

  app.put("/api/technicians/:id", requireAuth, requirePermission("technicians.edit"), async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const technicianData = insertTechnicianSchema.partial().parse(req.body);
      const technician = await storage.updateTechnician(id, technicianData);
      if (!technician) {
        return res.status(404).json({ message: "Technician not found" });
      }
      res.json(technician);
    } catch (error) {
      res.status(400).json({ message: "Failed to update technician" });
    }
  });

  app.delete("/api/technicians/:id", requireAuth, requirePermission("technicians.delete"), async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const deleted = await storage.deleteTechnician(id);
      if (!deleted) {
        return res.status(404).json({ message: "Technician not found" });
      }
      res.json({ message: "Technician deleted successfully" });
    } catch (error) {
      res.status(500).json({ message: "Failed to delete technician" });
    }
  });

  // W9 upload endpoint
  app.post("/api/technicians/:id/w9", requireAuth, requirePermission("technicians.edit"), uploadW9.single('w9'), async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (!req.file) {
        return res.status(400).json({ message: "No W9 file uploaded" });
      }
      const technician = await storage.getTechnician(id);
      if (!technician) {
        return res.status(404).json({ message: "Technician not found" });
      }
      // Remove old W9 file if it exists
      if (technician.w9FilePath) {
        const oldPath = path.join(process.cwd(), technician.w9FilePath.replace(/^\//, ''));
        if (fs.existsSync(oldPath)) {
          fs.unlinkSync(oldPath);
        }
      }
      const filePath = `/uploads/w9/${id}/${req.file.filename}`;
      const updated = await storage.updateTechnician(id, {
        w9FilePath: filePath,
        w9FileName: req.file.originalname,
        w9SubmittedAt: new Date(),
        w9Status: 'submitted',
      } as any);
      res.json({ message: "W9 uploaded successfully", technician: updated });
    } catch (error) {
      console.error("Error uploading W9:", error);
      res.status(500).json({ message: "Failed to upload W9", error: error instanceof Error ? error.message : String(error) });
    }
  });

  // W9 delete endpoint
  app.delete("/api/technicians/:id/w9", requireAuth, requirePermission("technicians.edit"), async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const technician = await storage.getTechnician(id);
      if (!technician) {
        return res.status(404).json({ message: "Technician not found" });
      }
      if (technician.w9FilePath) {
        const oldPath = path.join(process.cwd(), technician.w9FilePath.replace(/^\//, ''));
        if (fs.existsSync(oldPath)) {
          fs.unlinkSync(oldPath);
        }
      }
      const updated = await storage.updateTechnician(id, {
        w9FilePath: null,
        w9FileName: null,
        w9SubmittedAt: null,
        w9Status: null,
      } as any);
      res.json({ message: "W9 removed successfully", technician: updated });
    } catch (error) {
      console.error("Error deleting W9:", error);
      res.status(500).json({ message: "Failed to delete W9" });
    }
  });

  // W9 verify endpoint — marks the submitted W9 as verified
  app.post("/api/technicians/:id/w9/verify", requireAuth, requirePermission("technicians.edit"), async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const technician = await storage.getTechnician(id);
      if (!technician) return res.status(404).json({ message: "Technician not found" });
      if (!technician.w9FilePath) return res.status(400).json({ message: "No W9 on file to verify" });
      const updated = await storage.updateTechnician(id, { w9Status: "verified" } as any);
      res.json({ message: "W9 verified successfully", technician: updated });
    } catch (error) {
      console.error("Error verifying W9:", error);
      res.status(500).json({ message: "Failed to verify W9" });
    }
  });

  // Rating routes
  app.post("/api/technician-ratings", requireAuth, requirePermission("technicians.rate"), async (req, res) => {
    try {
      const ratingData = insertRatingSchema.parse(req.body);
      const rating = await storage.createRating(ratingData);
      res.status(201).json(rating);
    } catch (error) {
      res.status(400).json({ message: "Failed to create rating" });
    }
  });

  app.get("/api/technicians/:id/ratings", requireAuth, async (req, res) => {
    try {
      const technicianId = parseInt(req.params.id);
      const ratings = await storage.getTechnicianRatings(technicianId);
      res.json(ratings);
    } catch (error) {
      res.status(500).json({ message: "Failed to get ratings" });
    }
  });

  // Work Order routes
  app.get("/api/work-orders", requireAuth, requirePermission("workorders.list.view"), async (req, res) => {
    try {
      // Check if user has admin permissions to see all work orders
      const userPermissions = await storage.getUserPermissions(req.user.id);
      const canViewAllWorkOrders = userPermissions.some(p => p.name === 'system.admin' || p.name === 'workorders.view_all');
      
      let workOrders;
      if (canViewAllWorkOrders) {
        // Admin users can see all work orders
        workOrders = await storage.getAllWorkOrders();
      } else {
        // Regular users can only see work orders assigned to them or created by them
        workOrders = await storage.getUserWorkOrders(req.user.id);
      }
      
      res.json(workOrders);
    } catch (error) {
      res.status(500).json({ message: "Failed to get work orders" });
    }
  });

  app.post("/api/work-orders", requireAuth, requirePermission("workorders.create"), async (req, res) => {
    try {
      const workOrderData = insertWorkOrderSchema.parse(req.body);
      const workOrder = await storage.createWorkOrder(workOrderData);
      res.status(201).json(workOrder);
    } catch (error) {
      console.error("Error creating work order:", error);
      res.status(400).json({ 
        message: "Failed to create work order", 
        error: error instanceof Error ? error.message : String(error) 
      });
    }
  });

  app.put("/api/work-orders/:id", requireAuth, requirePermission("workorders.edit"), async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      
      // Check if user has permission to edit this specific work order
      const userPermissions = await storage.getUserPermissions(req.user.id);
      const canEditAllWorkOrders = userPermissions.some(p => p.name === 'system.admin' || p.name === 'workorders.view_all');
      
      if (!canEditAllWorkOrders) {
        // Check if user is assigned to or created this work order
        const existingWorkOrder = await storage.getWorkOrder(id);
        if (!existingWorkOrder || (existingWorkOrder.requestedBy !== req.user.id && existingWorkOrder.assignedTo !== req.user.id)) {
          return res.status(403).json({ message: "Permission denied. You can only edit work orders assigned to you or created by you." });
        }
      }
      
      const workOrderData = insertWorkOrderSchema.partial().parse(req.body);
      // Get the existing work order to detect status change
      const existingWo = await storage.getWorkOrder(id);
      const workOrder = await storage.updateWorkOrder(id, workOrderData);
      if (!workOrder) {
        return res.status(404).json({ message: "Work order not found" });
      }
      // If status changed to "needs_proposal", notify assignees
      if (workOrderData.status === "needs_proposal" && existingWo?.status !== "needs_proposal") {
        await notifyWorkOrderAssignees(id, {
          type: "proposal_required",
          title: "Proposal Required",
          message: `Work order ${workOrder.workOrderNumber} has been flagged as needing a proposal. Please go to the Proposals page to create one.`,
          relatedEntity: "work_order",
          relatedId: id,
        });
      }
      res.json(workOrder);
    } catch (error) {
      console.error("Error updating work order:", error);
      res.status(400).json({ 
        message: "Failed to update work order",
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });

  app.delete("/api/work-orders/:id", requireAuth, requirePermission("workorders.delete"), async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const deleted = await storage.deleteWorkOrder(id);
      if (!deleted) {
        return res.status(404).json({ message: "Work order not found" });
      }
      res.json({ message: "Work order deleted successfully" });
    } catch (error) {
      res.status(500).json({ message: "Failed to delete work order" });
    }
  });

  // Work Order Proposal routes
  app.get("/api/work-orders/:id/proposal", requireAuth, requirePermission("workorders.tab.proposal"), async (req, res) => {
    try {
      const workOrderId = parseInt(req.params.id);
      const proposal = await storage.getWorkOrderProposal(workOrderId);
      if (!proposal) {
        // Return empty proposal structure instead of 404 to allow creation
        return res.json(null);
      }
      res.json(proposal);
    } catch (error) {
      console.error("Error getting proposal:", error);
      res.status(500).json({ message: "Failed to get proposal" });
    }
  });

  app.post("/api/work-orders/:id/proposal", requireAuth, requirePermission("proposals.create"), async (req, res) => {
    try {
      const workOrderId = parseInt(req.params.id);
      const proposalData = insertWorkOrderProposalSchema.parse({
        ...req.body,
        workOrderId
      });
      const proposal = await storage.createWorkOrderProposal(proposalData);
      res.status(201).json(proposal);
    } catch (error) {
      console.error("Error creating proposal:", error);
      res.status(400).json({ 
        message: "Failed to create proposal", 
        error: error instanceof Error ? error.message : String(error) 
      });
    }
  });

  app.put("/api/work-orders/:id/proposal", requireAuth, requirePermission("proposals.create"), async (req, res) => {
    try {
      const workOrderId = parseInt(req.params.id);
      const proposalData = insertWorkOrderProposalSchema.partial().parse(req.body);
      const proposal = await storage.updateWorkOrderProposal(workOrderId, proposalData);
      if (!proposal) {
        return res.status(404).json({ message: "Proposal not found" });
      }
      res.json(proposal);
    } catch (error) {
      res.status(400).json({ message: "Failed to update proposal" });
    }
  });

  app.put("/api/work-orders/:id/proposal/status", requireAuth, requirePermission("proposals.approve"), async (req, res) => {
    try {
      const workOrderId = parseInt(req.params.id);
      const { status } = req.body;
      
      if (!["pending", "approved", "cancelled"].includes(status)) {
        return res.status(400).json({ message: "Invalid status" });
      }

      const proposal = await storage.updateWorkOrderProposal(workOrderId, { status });
      if (!proposal) {
        return res.status(404).json({ message: "Proposal not found" });
      }

      if (status === "approved" || status === "cancelled") {
        const workOrder = await storage.getWorkOrder(workOrderId);
        await notifyWorkOrderAssignees(workOrderId, {
          type: status === "approved" ? "proposal_approved" : "proposal_rejected",
          title: status === "approved" ? "Proposal Approved" : "Proposal Rejected",
          message: status === "approved"
            ? `The proposal for work order ${workOrder?.workOrderNumber || workOrderId} has been approved.`
            : `The proposal for work order ${workOrder?.workOrderNumber || workOrderId} has been rejected and needs to be revised.`,
          relatedEntity: "proposal",
          relatedId: workOrderId,
        });
      }

      console.log(`Proposal ${proposal.id} status updated to ${status} by user ${req.session.userId}`);
      res.json(proposal);
    } catch (error) {
      console.error("Error updating proposal status:", error);
      res.status(400).json({ message: "Failed to update proposal status" });
    }
  });

  // Helper: notify all users assigned to a work order
  async function notifyWorkOrderAssignees(workOrderId: number, notification: { type: string; title: string; message: string; relatedEntity: string; relatedId: number }, excludeUserId?: number) {
    try {
      const workOrder = await storage.getWorkOrder(workOrderId);
      if (!workOrder) return;
      const recipientIds = new Set<number>();
      if (workOrder.requestedBy) recipientIds.add(workOrder.requestedBy);
      if (workOrder.assignedTo) recipientIds.add(workOrder.assignedTo);
      try {
        if (workOrder.assignedUserIds) {
          const ids: number[] = JSON.parse(workOrder.assignedUserIds);
          ids.forEach(id => recipientIds.add(id));
        }
      } catch {}
      if (excludeUserId) recipientIds.delete(excludeUserId);
      for (const userId of recipientIds) {
        await storage.createNotification({ userId, ...notification, isRead: false });
      }
    } catch (err) {
      console.error("Failed to send work order notifications:", err);
    }
  }

  // Approve proposal
  app.put("/api/proposals/:id/approve", requireAuth, requirePermission("proposals.approve"), async (req, res) => {
    try {
      const proposalId = parseInt(req.params.id);
      
      // Get the proposal to find the work order ID
      const proposals = await storage.getAllProposals();
      const proposal = proposals.find(p => p.id === proposalId);
      
      if (!proposal) {
        return res.status(404).json({ message: "Proposal not found" });
      }
      
      const updatedProposal = await storage.updateWorkOrderProposal(proposal.workOrderId, { 
        status: "approved",
        approvedAt: new Date()
      });
      
      if (!updatedProposal) {
        return res.status(404).json({ message: "Failed to approve proposal" });
      }

      const workOrder = await storage.getWorkOrder(proposal.workOrderId);
      await notifyWorkOrderAssignees(proposal.workOrderId, {
        type: "proposal_approved",
        title: "Proposal Approved",
        message: `The proposal for work order ${workOrder?.workOrderNumber || proposal.workOrderId} has been approved.`,
        relatedEntity: "proposal",
        relatedId: proposal.workOrderId,
      });
      
      res.json(updatedProposal);
    } catch (error) {
      console.error("Error approving proposal:", error);
      res.status(500).json({ message: "Failed to approve proposal" });
    }
  });

  // Reject proposal
  app.put("/api/proposals/:id/reject", requireAuth, requirePermission("proposals.approve"), async (req, res) => {
    try {
      const proposalId = parseInt(req.params.id);
      
      // Get the proposal to find the work order ID
      const proposals = await storage.getAllProposals();
      const proposal = proposals.find(p => p.id === proposalId);
      
      if (!proposal) {
        return res.status(404).json({ message: "Proposal not found" });
      }
      
      const updatedProposal = await storage.updateWorkOrderProposal(proposal.workOrderId, { 
        status: "cancelled"
      });
      
      if (!updatedProposal) {
        return res.status(404).json({ message: "Failed to reject proposal" });
      }

      const workOrder = await storage.getWorkOrder(proposal.workOrderId);
      await notifyWorkOrderAssignees(proposal.workOrderId, {
        type: "proposal_rejected",
        title: "Proposal Rejected",
        message: `The proposal for work order ${workOrder?.workOrderNumber || proposal.workOrderId} has been rejected and needs to be revised.`,
        relatedEntity: "proposal",
        relatedId: proposal.workOrderId,
      });
      
      res.json(updatedProposal);
    } catch (error) {
      console.error("Error rejecting proposal:", error);
      res.status(500).json({ message: "Failed to reject proposal" });
    }
  });

  // Get all proposals with work order info
  app.get("/api/proposals", requireAuth, requirePermission("proposals.list.view"), async (req, res) => {
    try {
      const workOrders = await storage.getAllWorkOrders();
      const proposalsWithWorkOrders = [];
      
      for (const workOrder of workOrders) {
        const proposal = await storage.getWorkOrderProposal(workOrder.id);
        if (proposal) {
          proposalsWithWorkOrders.push({
            ...proposal,
            workOrder
          });
        }
      }
      
      res.json(proposalsWithWorkOrders);
    } catch (error) {
      res.status(500).json({ message: "Failed to get proposals" });
    }
  });

  // Get work orders without proposals for proposal creation
  // Also includes work orders with status "needs_proposal" (even if they have an existing proposal)
  app.get("/api/work-orders-without-proposals", requireAuth, requirePermission("proposals.list.view"), async (req, res) => {
    try {
      const workOrders = await storage.getAllWorkOrders();
      const result = [];
      
      for (const workOrder of workOrders) {
        const proposal = await storage.getWorkOrderProposal(workOrder.id);
        // Include if no proposal exists OR if status is "needs_proposal"
        if (!proposal || workOrder.status === "needs_proposal") {
          result.push(workOrder);
        }
      }
      
      res.json(result);
    } catch (error) {
      console.error("Error fetching work orders without proposals:", error);
      res.status(500).json({ message: "Failed to get work orders" });
    }
  });

  // Work Order Parts Request routes
  app.get("/api/work-orders/:id/parts-requests", requireAuth, requirePermission("workorders.tab.parts"), async (req, res) => {
    try {
      const workOrderId = parseInt(req.params.id);
      const partsRequests = await storage.getWorkOrderPartsRequests(workOrderId);
      res.json(partsRequests);
    } catch (error) {
      res.status(500).json({ message: "Failed to get parts requests" });
    }
  });

  app.post("/api/work-orders/:id/parts-requests", requireAuth, requirePermission("parts.create"), async (req, res) => {
    try {
      const workOrderId = parseInt(req.params.id);
      const partsRequestData = insertWorkOrderPartsRequestSchema.parse({
        ...req.body,
        workOrderId
      });
      const partsRequest = await storage.createWorkOrderPartsRequest(partsRequestData);
      res.status(201).json(partsRequest);
    } catch (error) {
      console.error("Error creating parts request:", error);
      res.status(400).json({ 
        message: "Failed to create parts request", 
        error: error instanceof Error ? error.message : String(error) 
      });
    }
  });

  // Legacy status update (kept for compatibility)
  app.put("/api/parts-requests/:id/status", requireAuth, requirePermission("parts.approve"), async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const { status } = req.body;
      const validStatuses = ["pending", "approved", "rejected", "ordered", "received", "cancelled"];
      if (!validStatuses.includes(status)) {
        return res.status(400).json({ message: "Invalid status" });
      }
      const success = await storage.updateWorkOrderPartsRequestStatus(id, status);
      if (!success) return res.status(404).json({ message: "Parts request not found" });
      res.json({ message: "Status updated successfully" });
    } catch (error) {
      res.status(400).json({ message: "Failed to update parts request status" });
    }
  });

  // Helper: recalculate approved parts cost for a work order and sync the proposal
  async function syncWorkOrderPartsCost(workOrderId: number) {
    try {
      const allParts = await storage.getWorkOrderPartsRequests(workOrderId);
      const approvedParts = allParts.filter((r: any) =>
        ["approved", "ordered", "received"].includes(r.status)
      );
      const approvedPartsCost = approvedParts.reduce((sum: number, r: any) => {
        return sum + parseFloat(r.estimatedCost || "0") * (parseInt(r.quantity as any || "1"));
      }, 0);
      // Update the proposal's materialCost so the invoice and work order both reflect it
      await storage.updateWorkOrderProposal(workOrderId, {
        materialCost: approvedPartsCost.toFixed(2),
      });
    } catch (e) {
      console.error("syncWorkOrderPartsCost error:", e);
    }
  }

  // Approve a parts request
  app.post("/api/parts-requests/:id/approve", requireAuth, requirePermission("parts.approve"), async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const approvingUser = (req as any).user;
      const updated = await storage.updateWorkOrderPartsRequest(id, {
        status: "approved",
        approvedBy: approvingUser?.id,
        approvedAt: new Date(),
        rejectionReason: null,
      });
      if (!updated) return res.status(404).json({ message: "Parts request not found" });
      await syncWorkOrderPartsCost(updated.workOrderId);
      res.json(updated);
    } catch (error: any) {
      console.error("Error approving parts request:", error);
      res.status(500).json({ message: "Failed to approve parts request" });
    }
  });

  // Reject a parts request — notify the requester
  app.post("/api/parts-requests/:id/reject", requireAuth, requirePermission("parts.approve"), async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const { reason } = req.body;

      const updated = await storage.updateWorkOrderPartsRequest(id, {
        status: "rejected",
        rejectionReason: reason || "No reason provided",
      });
      if (!updated) return res.status(404).json({ message: "Parts request not found" });

      await syncWorkOrderPartsCost(updated.workOrderId);

      // Notify the requester
      const workOrder = await storage.getWorkOrder(updated.workOrderId);
      if (updated.requestedBy) {
        await storage.createNotification({
          userId: updated.requestedBy,
          type: "parts_rejected",
          title: "Parts Request Rejected",
          message: `Your parts request for "${updated.partName}" (Work Order: ${workOrder?.workOrderNumber || updated.workOrderId}) was rejected. Reason: ${reason || "No reason provided"}. You can submit a new request.`,
          relatedEntity: "parts_request",
          relatedId: id,
          isRead: false,
        });
      }

      res.json(updated);
    } catch (error: any) {
      console.error("Error rejecting parts request:", error);
      res.status(500).json({ message: "Failed to reject parts request" });
    }
  });

  // Mark a parts request as ordered
  app.post("/api/parts-requests/:id/order", requireAuth, requirePermission("parts.approve"), async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const updated = await storage.updateWorkOrderPartsRequest(id, { status: "ordered" });
      if (!updated) return res.status(404).json({ message: "Parts request not found" });
      await syncWorkOrderPartsCost(updated.workOrderId);
      res.json(updated);
    } catch (error: any) {
      res.status(500).json({ message: "Failed to mark as ordered" });
    }
  });

  // Mark a parts request as received
  app.post("/api/parts-requests/:id/receive", requireAuth, requirePermission("parts.approve"), async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const updated = await storage.updateWorkOrderPartsRequest(id, { status: "received" });
      if (!updated) return res.status(404).json({ message: "Parts request not found" });
      await syncWorkOrderPartsCost(updated.workOrderId);
      res.json(updated);
    } catch (error: any) {
      res.status(500).json({ message: "Failed to mark as received" });
    }
  });

  // Get all parts requests with work order and user info — filtered by assignment
  app.get("/api/parts-requests", requireAuth, requirePermission("parts.list.view"), async (req, res) => {
    try {
      const currentUser = (req as any).user;
      const currentUserPermissions: string[] = (req as any).permissions || [];
      const isAdmin = currentUserPermissions.includes("system.admin");

      const workOrders = await storage.getAllWorkOrders();
      const users = await storage.getAllUsers();
      const partsRequestsWithInfo = [];
      
      for (const workOrder of workOrders) {
        // Assignment check
        let assignedUserIds: number[] = [];
        try {
          if (workOrder.assignedUserIds) assignedUserIds = JSON.parse(workOrder.assignedUserIds);
          if (workOrder.assignedTo) assignedUserIds.push(workOrder.assignedTo);
        } catch {}
        
        if (!isAdmin && !assignedUserIds.includes(currentUser?.id)) continue;

        const partsRequests = await storage.getWorkOrderPartsRequests(workOrder.id);
        for (const request of partsRequests) {
          const requestedByUser = users.find(u => u.id === request.requestedBy);
          partsRequestsWithInfo.push({
            ...request,
            workOrder: {
              workOrderNumber: workOrder.workOrderNumber,
              clientName: workOrder.clientName,
              street: workOrder.street,
              city: workOrder.city,
            },
            requestedByUser: requestedByUser ? {
              firstName: requestedByUser.firstName,
              lastName: requestedByUser.lastName,
              email: requestedByUser.email,
            } : { firstName: "Unknown", lastName: "User", email: "" },
          });
        }
      }
      
      res.json(partsRequestsWithInfo);
    } catch (error) {
      console.error("Error fetching parts requests:", error);
      res.status(500).json({ message: "Failed to get parts requests" });
    }
  });

  // Work Order File Management routes
  app.get("/api/work-orders/:id/files", requireAuth, requirePermission("workorders.tab.files"), async (req, res) => {
    try {
      const workOrderId = parseInt(req.params.id);
      const category = req.query.category as string;
      const files = await storage.getWorkOrderFiles(workOrderId, category);
      res.json(files);
    } catch (error) {
      res.status(500).json({ message: "Failed to get files" });
    }
  });

  app.post("/api/work-orders/:id/files", requireAuth, requirePermission("files.upload"), upload.single('file'), async (req, res) => {
    try {
      const workOrderId = parseInt(req.params.id);
      
      if (!req.file) {
        return res.status(400).json({ message: "No file uploaded" });
      }
      
      const { category, description, uploadedBy } = req.body;
      
      const fileData = {
        workOrderId,
        fileName: req.file.originalname,
        filePath: `/uploads/${workOrderId}/${req.file.filename}`,
        fileSize: req.file.size,
        mimeType: req.file.mimetype,
        category: category || "document",
        description: description || "",
        uploadedBy: uploadedBy ? parseInt(uploadedBy) : req.session.userId || 1,
      };
      
      const file = await storage.createWorkOrderFile(fileData);
      res.status(201).json(file);
    } catch (error) {
      console.error("Error uploading file:", error);
      res.status(400).json({ 
        message: "Failed to upload file", 
        error: error instanceof Error ? error.message : String(error) 
      });
    }
  });

  app.delete("/api/work-orders/files/:id", requireAuth, requirePermission("files.delete"), async (req, res) => {
    try {
      const fileId = parseInt(req.params.id);
      const success = await storage.deleteWorkOrderFile(fileId);
      
      if (!success) {
        return res.status(404).json({ message: "File not found" });
      }
      
      res.json({ message: "File deleted successfully" });
    } catch (error) {
      res.status(400).json({ message: "Failed to delete file" });
    }
  });

  // Serve uploaded files — requires authentication; W9 documents require admin/manager permission
  app.use('/uploads', requireAuth, (req: any, res, next) => {
    const filePath = req.path || '';
    if (filePath.startsWith('/w9/')) {
      const userPermissions: string[] = req.permissions || [];
      const canViewW9 = userPermissions.includes('system.admin') || userPermissions.includes('technicians.view') || userPermissions.includes('payments.list.view');
      if (!canViewW9) {
        return res.status(403).json({ message: 'Access denied: insufficient permissions to view W9 documents' });
      }
    }
    next();
  }, express.static(path.join(process.cwd(), 'uploads')));

  // Work Order Chat routes
  app.get("/api/work-orders/:id/chats", requireAuth, requirePermission("workorders.tab.chat"), async (req, res) => {
    try {
      const workOrderId = parseInt(req.params.id);
      const chats = await storage.getWorkOrderChats(workOrderId);
      const users = await storage.getAllUsers();
      
      const chatsWithUsers = chats.map(chat => {
        const user = users.find(u => u.id === chat.userId);
        return {
          ...chat,
          user: user ? {
            firstName: user.firstName,
            lastName: user.lastName,
            email: user.email
          } : {
            firstName: "Unknown",
            lastName: "User",
            email: "unknown@example.com"
          }
        };
      });
      
      res.json(chatsWithUsers);
    } catch (error) {
      res.status(500).json({ message: "Failed to get chats" });
    }
  });

  app.post("/api/work-orders/:id/chats", requireAuth, requirePermission("chat.send"), async (req, res) => {
    try {
      const workOrderId = parseInt(req.params.id);
      
      const chatData = insertWorkOrderChatSchema.parse({
        ...req.body,
        workOrderId,
        userId: req.user!.id,
        senderId: req.user!.id
      });
      
      const chat = await storage.createWorkOrderChat(chatData);
      console.log(`Chat message created for work order ${workOrderId} by user ${req.user!.id}`);

      // Notify all other participants on this work order
      const sender = req.user!;
      const senderName = `${sender.firstName} ${sender.lastName}`.trim() || sender.email;
      const workOrder = await storage.getWorkOrder(workOrderId).catch(() => null);
      const woNumber = workOrder?.workOrderNumber || `#${workOrderId}`;
      const preview = (chatData.message || "").substring(0, 80) + ((chatData.message || "").length > 80 ? "…" : "");
      notifyWorkOrderAssignees(workOrderId, {
        type: "info",
        title: `New message on ${woNumber}`,
        message: `${senderName}: ${preview}`,
        relatedEntity: "work_order",
        relatedId: workOrderId,
      }, sender.id);

      res.status(201).json(chat);
    } catch (error) {
      console.error("Error creating chat message:", error);
      res.status(400).json({ 
        message: "Failed to create chat message", 
        error: error instanceof Error ? error.message : String(error) 
      });
    }
  });

  app.post("/api/work-orders/:id/chats/file", requireAuth, requirePermission("chat.send"), upload.single('file'), async (req, res) => {
    try {
      const workOrderId = parseInt(req.params.id);
      
      if (!req.file) {
        return res.status(400).json({ message: "No file uploaded" });
      }
      
      const { messageType, message } = req.body;
      
      const chatData = insertWorkOrderChatSchema.parse({
        workOrderId,
        userId: req.user!.id,
        senderId: req.user!.id,
        message: message || req.file.originalname,
        messageType: messageType || 'file',
        fileUrl: `/uploads/${workOrderId}/${req.file.filename}`
      });
      
      const chat = await storage.createWorkOrderChat(chatData);
      console.log(`File message created for work order ${workOrderId} by user ${req.session.userId}`);

      // Notify all other participants
      const sender = req.user!;
      const senderName = `${sender.firstName} ${sender.lastName}`.trim() || sender.email;
      const workOrder = await storage.getWorkOrder(workOrderId).catch(() => null);
      const woNumber = workOrder?.workOrderNumber || `#${workOrderId}`;
      notifyWorkOrderAssignees(workOrderId, {
        type: "info",
        title: `New file shared on ${woNumber}`,
        message: `${senderName} shared a file: ${req.file.originalname}`,
        relatedEntity: "work_order",
        relatedId: workOrderId,
      }, sender.id);

      res.status(201).json(chat);
    } catch (error) {
      console.error("Error creating file message:", error);
      res.status(400).json({ 
        message: "Failed to create file message", 
        error: error instanceof Error ? error.message : String(error) 
      });
    }
  });

  // Work Order Technician Payment routes
  app.get("/api/work-orders/:id/payments", requireAuth, requirePermission("workorders.tab.payments"), async (req, res) => {
    try {
      const workOrderId = parseInt(req.params.id);
      console.log(`Fetching payments for work order ${workOrderId}`);
      const payments = await storage.getWorkOrderTechnicianPayments(workOrderId);
      console.log(`Found ${payments.length} payments for work order ${workOrderId}:`, payments);
      res.json(payments);
    } catch (error) {
      console.error("Error fetching payment requests:", error);
      res.status(500).json({ message: "Failed to get payment requests" });
    }
  });

  // Global payment manager routes
  app.get("/api/payments/all", requireAuth, requirePermission("payments.list.view"), async (req, res) => {
    try {
      const currentUser = (req as any).user;
      const currentUserPermissions: string[] = (req as any).permissions || [];
      const isAdmin = currentUserPermissions.includes("system.admin");

      const allPayments = await storage.getAllTechnicianPayments();
      const allWorkOrders = await storage.getAllWorkOrders();
      const technicians = await storage.getAllTechnicians();
      
      const paymentsWithDetails = allPayments
        .map(payment => {
          const workOrder = allWorkOrders.find(wo => wo.id === payment.workOrderId);
          const technician = technicians.find(t => t.id === payment.technicianId);
          
          let assignedUserIds: number[] = [];
          try {
            if (workOrder?.assignedUserIds) assignedUserIds = JSON.parse(workOrder.assignedUserIds);
            if (workOrder?.assignedTo) assignedUserIds.push(workOrder.assignedTo);
          } catch {}

          return {
            ...payment,
            workOrderNumber: workOrder?.workOrderNumber || "Unknown",
            clientName: workOrder?.clientName || "Unknown",
            technicianName: technician ? `${technician.firstName} ${technician.lastName}` : "Unknown",
            technicianPaymentMethods: technician?.paymentMethods || "[]",
            technicianW9Status: technician?.w9Status || null,
            assignedUserIds,
          };
        })
        .filter(p => {
          if (isAdmin) return true;
          return p.assignedUserIds.includes(currentUser?.id);
        });
      
      res.json(paymentsWithDetails);
    } catch (error) {
      console.error("Error fetching all payments:", error);
      res.status(500).json({ message: "Failed to get payments" });
    }
  });

  // Approve a payment request
  app.post("/api/payments/:id/approve", requireAuth, requirePermission("payments.approve"), async (req, res) => {
    try {
      const paymentId = parseInt(req.params.id);
      const { amountApproved } = req.body;

      const existing = await storage.getWorkOrderTechnicianPayment(paymentId);
      if (!existing) return res.status(404).json({ message: "Payment not found" });

      const approved = parseFloat(amountApproved || existing.amountRequested as string);

      // W9 check
      if (approved > 500) {
        const technician = await storage.getTechnician(existing.technicianId);
        if (!technician?.w9FilePath) {
          return res.status(400).json({
            message: `Cannot approve payment over $500. A W9 form must be on file.`,
            code: "W9_REQUIRED"
          });
        }
      }

      const updated = await storage.updateWorkOrderTechnicianPayment(paymentId, {
        status: "approved",
        amountApproved: amountApproved || existing.amountRequested,
        approvedAt: new Date(),
      } as any);

      res.json(updated);
    } catch (error: any) {
      console.error("Error approving payment:", error);
      res.status(500).json({ message: "Failed to approve payment" });
    }
  });

  // Reject a payment request
  app.post("/api/payments/:id/reject", requireAuth, requirePermission("payments.approve"), async (req, res) => {
    try {
      const paymentId = parseInt(req.params.id);
      const { reason } = req.body;

      const existing = await storage.getWorkOrderTechnicianPayment(paymentId);
      if (!existing) return res.status(404).json({ message: "Payment not found" });

      const updated = await storage.updateWorkOrderTechnicianPayment(paymentId, {
        status: "rejected",
        rejectionReason: reason || "No reason provided",
      } as any);

      // Notify if there's a linked work order with an assignedTo user
      const workOrder = await storage.getWorkOrder(existing.workOrderId);
      if (workOrder?.assignedTo) {
        await storage.createNotification({
          userId: workOrder.assignedTo,
          type: "payment_rejected",
          title: "Payment Request Rejected",
          message: `Payment request for work order ${workOrder.workOrderNumber} was rejected. Reason: ${reason || "No reason provided"}.`,
          relatedEntity: "payment",
          relatedId: paymentId,
          isRead: false,
        });
      }

      res.json(updated);
    } catch (error: any) {
      console.error("Error rejecting payment:", error);
      res.status(500).json({ message: "Failed to reject payment" });
    }
  });

  // Record a payment (partial or full) for an approved request
  app.post("/api/payments/:id/pay", requireAuth, requirePermission("payments.approve"), async (req, res) => {
    try {
      const paymentId = parseInt(req.params.id);
      const { amountPaid } = req.body;

      const existing = await storage.getWorkOrderTechnicianPayment(paymentId);
      if (!existing) return res.status(404).json({ message: "Payment not found" });
      if (existing.status !== "approved" && existing.status !== "partially_paid") {
        return res.status(400).json({ message: "Payment must be approved before recording payment" });
      }

      const previouslyPaid = parseFloat(existing.amountPaid as string || "0");
      const newPaid = parseFloat(amountPaid || "0");
      const totalPaid = previouslyPaid + newPaid;
      const approved = parseFloat(existing.amountApproved as string || existing.amountRequested as string || "0");
      const remaining = approved - totalPaid;

      const newStatus = remaining <= 0.001 ? "paid" : "partially_paid";

      const updated = await storage.updateWorkOrderTechnicianPayment(paymentId, {
        amountPaid: totalPaid.toFixed(2),
        status: newStatus,
        paidAt: newStatus === "paid" ? new Date() : existing.paidAt,
      } as any);

      res.json({ ...updated, remaining: Math.max(0, remaining).toFixed(2) });
    } catch (error: any) {
      console.error("Error recording payment:", error);
      res.status(500).json({ message: "Failed to record payment" });
    }
  });

  app.get("/api/payments/technician/:technicianId", requireAuth, requirePermission("payments.technician.view"), async (req, res) => {
    try {
      const technicianId = parseInt(req.params.technicianId);
      console.log(`Fetching payment history for technician ${technicianId}`);
      
      const allPayments = await storage.getAllTechnicianPayments();
      const workOrders = await storage.getAllWorkOrders();
      
      const technicianPayments = allPayments
        .filter(payment => payment.technicianId === technicianId)
        .map(payment => {
          const workOrder = workOrders.find(wo => wo.id === payment.workOrderId);
          return {
            ...payment,
            workOrderNumber: workOrder?.workOrderNumber || "Unknown"
          };
        })
        .sort((a, b) => new Date(b.requestedAt).getTime() - new Date(a.requestedAt).getTime());
      
      console.log(`Filtered payments for technician ${technicianId}:`, technicianPayments);
      res.json(technicianPayments);
    } catch (error) {
      console.error("Error fetching technician payments:", error);
      res.status(500).json({ message: "Failed to get technician payments" });
    }
  });

  app.patch("/api/payments/:id", requireAuth, requirePermission("payments.approve"), async (req, res) => {
    try {
      const paymentId = parseInt(req.params.id);
      const updates = req.body;

      // When approving/paying, enforce $500 limit for technicians without W9
      const isApprovalAction = updates.status === 'approved' || updates.status === 'partially_paid' || updates.status === 'paid';
      if (isApprovalAction) {
        const existingPayment = await storage.getWorkOrderTechnicianPayment(paymentId);
        if (existingPayment) {
          const W9_LIMIT = 500;
          const amountToCheck = parseFloat(updates.amountApproved || updates.amountPaid || existingPayment.amountRequested as string);
          if (!isNaN(amountToCheck) && amountToCheck > W9_LIMIT) {
            const technician = await storage.getTechnician(existingPayment.technicianId);
            if (!technician || !technician.w9FilePath) {
              return res.status(400).json({
                message: `Cannot approve payment over $${W9_LIMIT}. A W9 form must be on file for this technician.`,
                code: "W9_REQUIRED"
              });
            }
          }
        }
      }
      
      const payment = await storage.updateWorkOrderTechnicianPayment(paymentId, updates);
      if (!payment) {
        return res.status(404).json({ message: "Payment not found" });
      }
      
      res.json(payment);
    } catch (error) {
      console.error("Error updating payment:", error);
      res.status(500).json({ message: "Failed to update payment" });
    }
  });

  app.post("/api/work-orders/:id/payments", requireAuth, requirePermission("payments.create"), async (req, res) => {
    try {
      const workOrderId = parseInt(req.params.id);
      const paymentData = insertWorkOrderTechnicianPaymentSchema.parse({
        ...req.body,
        workOrderId
      });

      // Enforce $500 limit for technicians without a W9 on file
      const W9_LIMIT = 500;
      const amountRequested = parseFloat(paymentData.amountRequested as string);
      if (!isNaN(amountRequested) && amountRequested > W9_LIMIT) {
        const technician = await storage.getTechnician(paymentData.technicianId);
        if (!technician || !technician.w9FilePath) {
          return res.status(400).json({
            message: `Payment amount exceeds $${W9_LIMIT}. A W9 form must be on file for this technician before payments over $${W9_LIMIT} can be requested.`,
            code: "W9_REQUIRED"
          });
        }
      }
      
      const payment = await storage.createWorkOrderTechnicianPayment(paymentData);
      console.log(`Payment request created for work order ${workOrderId} by user ${req.session.userId}`);
      res.status(201).json(payment);
    } catch (error) {
      console.error("Error creating payment request:", error);
      res.status(400).json({ 
        message: "Failed to create payment request", 
        error: error instanceof Error ? error.message : String(error) 
      });
    }
  });

  // Direct payment creation endpoint (used by work order modal)
  app.post("/api/payments", requireAuth, async (req, res) => {
    try {
      console.log("Creating payment request:", req.body);
      const validatedData = insertWorkOrderTechnicianPaymentSchema.parse(req.body);
      const payment = await storage.createWorkOrderTechnicianPayment(validatedData);
      console.log("Payment created:", payment);
      res.json(payment);
    } catch (error: any) {
      console.error("Error creating payment:", error);
      if (error instanceof z.ZodError) {
        res.status(400).json({ message: fromZodError(error).toString() });
      } else {
        res.status(500).json({ message: error.message });
      }
    }
  });

  app.patch("/api/work-orders/:workOrderId/payments/:paymentId", requireAuth, requirePermission("payments.approve"), async (req, res) => {
    try {
      const paymentId = parseInt(req.params.paymentId);
      const updateData = req.body;
      
      const payment = await storage.updateWorkOrderTechnicianPayment(paymentId, updateData);
      if (!payment) {
        return res.status(404).json({ message: "Payment request not found" });
      }
      
      console.log(`Payment request ${paymentId} updated by user ${req.session.userId}`);
      res.json(payment);
    } catch (error) {
      console.error("Error updating payment request:", error);
      res.status(400).json({ 
        message: "Failed to update payment request", 
        error: error instanceof Error ? error.message : String(error) 
      });
    }
  });

  // Global Payment routes for the payments page
  app.get("/api/payments", requireAuth, requirePermission("payments.list.view"), async (req, res) => {
    try {
      // Get all payment requests across all work orders
      const allWorkOrders = await storage.getAllWorkOrders();
      const allPayments = [];
      
      for (const workOrder of allWorkOrders) {
        const payments = await storage.getWorkOrderTechnicianPayments(workOrder.id);
        allPayments.push(...payments);
      }
      
      // Sort by request date (most recent first)
      allPayments.sort((a, b) => new Date(b.requestedAt).getTime() - new Date(a.requestedAt).getTime());
      
      res.json(allPayments);
    } catch (error) {
      console.error("Error fetching all payment requests:", error);
      res.status(500).json({ message: "Failed to get payment requests" });
    }
  });

  app.patch("/api/payments/:id", requireAuth, requirePermission("payments.approve"), async (req, res) => {
    try {
      const paymentId = parseInt(req.params.id);
      const updateData = req.body;
      
      const payment = await storage.updateWorkOrderTechnicianPayment(paymentId, updateData);
      if (!payment) {
        return res.status(404).json({ message: "Payment request not found" });
      }
      
      console.log(`Payment request ${paymentId} updated by user ${req.session.userId}`);
      res.json(payment);
    } catch (error) {
      console.error("Error updating payment request:", error);
      res.status(400).json({ 
        message: "Failed to update payment request", 
        error: error instanceof Error ? error.message : String(error) 
      });
    }
  });

  // Dashboard stats
  app.get("/api/dashboard/stats", requireAuth, async (req, res) => {
    try {
      const [users, roles, techList, orders, invoices, payments] = await Promise.all([
        storage.getAllUsers().catch(() => []),
        storage.getAllRoles().catch(() => []),
        storage.getAllTechnicians().catch(() => []),
        storage.getAllWorkOrders().catch(() => []),
        storage.getAllInvoices().catch(() => []),
        storage.getAllTechnicianPayments().catch(() => []),
      ]);

      const workOrdersCompleted = orders.filter((o: any) => o.status === 'completed').length;
      const workOrdersPending = orders.filter((o: any) => o.status === 'pending' || o.status === 'active').length;
      const pendingPayments = payments.filter((p: any) => p.status === 'pending').length;
      const pendingInvoices = invoices.filter((i: any) => i.status === 'pending' || i.status === 'draft').length;
      const totalRevenue = invoices.filter((i: any) => i.status === 'paid').reduce((sum: number, i: any) => sum + parseFloat(i.totalAmount || '0'), 0);

      res.json({
        totalUsers: users.length,
        activeRoles: roles.length,
        techniciansCount: techList.length,
        workOrdersCount: orders.length,
        workOrdersCompleted,
        workOrdersPending,
        pendingPayments,
        pendingInvoices,
        totalRevenue,
        securityEvents: 0,
      });
    } catch (error: any) {
      res.status(500).json({ message: "Failed to get dashboard stats" });
    }
  });

  app.get("/api/dashboard/activity", requireAuth, async (req, res) => {
    try {
      const [orders, users, payments, invoices] = await Promise.all([
        storage.getAllWorkOrders().catch(() => []),
        storage.getAllUsers().catch(() => []),
        storage.getAllTechnicianPayments().catch(() => []),
        storage.getAllInvoices().catch(() => []),
      ]);

      const events: Array<{ id: string; type: string; description: string; time: Date; category: string }> = [];

      // Recent work orders (last 30)
      const recentOrders = [...orders]
        .sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, 10);
      for (const wo of recentOrders) {
        events.push({
          id: `wo-${wo.id}`,
          type: 'work_order',
          description: `Work order ${wo.workOrderNumber} created${wo.clientName ? ` for ${wo.clientName}` : ''}`,
          time: new Date(wo.createdAt),
          category: wo.status,
        });
      }

      // Recent user registrations
      const recentUsers = [...users]
        .sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, 5);
      for (const u of recentUsers) {
        events.push({
          id: `usr-${u.id}`,
          type: 'user',
          description: `User ${u.firstName} ${u.lastName} (${u.email}) added`,
          time: new Date(u.createdAt),
          category: 'user',
        });
      }

      // Recent payments
      const recentPayments = [...payments]
        .sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, 5);
      for (const p of recentPayments) {
        const wo = orders.find((o: any) => o.id === p.workOrderId);
        events.push({
          id: `pay-${p.id}`,
          type: 'payment',
          description: `Payment request $${parseFloat(p.amountRequested || '0').toFixed(2)} for ${wo?.workOrderNumber || 'work order'} — ${p.status}`,
          time: new Date(p.createdAt),
          category: p.status,
        });
      }

      // Recent invoices
      const recentInvoices = [...invoices]
        .sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, 5);
      for (const inv of recentInvoices) {
        const wo = orders.find((o: any) => o.id === inv.workOrderId);
        events.push({
          id: `inv-${inv.id}`,
          type: 'invoice',
          description: `Invoice ${inv.invoiceNumber} ${inv.status} for ${wo?.workOrderNumber || 'work order'}`,
          time: new Date(inv.createdAt),
          category: inv.status,
        });
      }

      // Sort all events by time desc, take top 20
      const sorted = events.sort((a, b) => b.time.getTime() - a.time.getTime()).slice(0, 20);
      res.json(sorted);
    } catch (error: any) {
      res.status(500).json({ message: "Failed to get activity feed" });
    }
  });

  // Personal dashboard stats (filtered to logged-in user)
  app.get("/api/dashboard/my-stats", requireAuth, async (req, res) => {
    try {
      const userId = (req.session as any).userId;
      const myOrders = await storage.getUserWorkOrders(userId).catch(() => []);

      const total = myOrders.length;
      const completed = myOrders.filter((o: any) => o.status === 'completed').length;
      const active = myOrders.filter((o: any) => o.status === 'active').length;
      const inProgress = myOrders.filter((o: any) => o.status === 'in_progress').length;
      const pending = myOrders.filter((o: any) => o.status === 'pending').length;

      const now = new Date();
      const recentOrders = [...myOrders]
        .sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, 6)
        .map((o: any) => ({
          id: o.id,
          workOrderNumber: o.workOrderNumber,
          clientName: o.clientName,
          status: o.status,
          city: o.city,
          startDate: o.startDate,
          endDate: o.endDate,
          createdAt: o.createdAt,
        }));

      const upcomingOrders = [...myOrders]
        .filter((o: any) => o.startDate && new Date(o.startDate) > now && o.status !== 'completed')
        .sort((a: any, b: any) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime())
        .slice(0, 5)
        .map((o: any) => ({
          id: o.id,
          workOrderNumber: o.workOrderNumber,
          clientName: o.clientName,
          status: o.status,
          city: o.city,
          startDate: o.startDate,
        }));

      res.json({ total, completed, active, inProgress, pending, recentOrders, upcomingOrders });
    } catch (error: any) {
      res.status(500).json({ message: "Failed to get personal stats" });
    }
  });

  // Invoice routes
  app.get("/api/work-orders/:id/invoice", requireAuth, requirePermission("workorders.tab.invoice"), async (req, res) => {
    try {
      const workOrderId = parseInt(req.params.id);
      console.log(`API: Fetching invoice for work order ${workOrderId}`);
      const invoice = await storage.getWorkOrderInvoice(workOrderId);
      console.log(`API: Found invoice:`, invoice);
      res.json(invoice || null);
    } catch (error: any) {
      console.error("API: Error fetching invoice:", error);
      res.status(500).json({ message: "Error fetching invoice: " + error.message });
    }
  });

  app.post("/api/work-orders/:id/invoice", requireAuth, requirePermission("workorders.tab.invoice"), async (req, res) => {
    try {
      const workOrderId = parseInt(req.params.id);
      const requestingUser = (req as any).user;
      console.log(`API: Creating/updating invoice for work order ${workOrderId} with data:`, req.body);
      
      // Check if invoice already exists
      const existingInvoice = await storage.getWorkOrderInvoice(workOrderId);
      
      let savedInvoice;
      if (existingInvoice) {
        // Update existing invoice (re-request after rejection resets to pending_approval)
        savedInvoice = await storage.updateWorkOrderInvoice(workOrderId, {
          ...req.body,
          status: "pending_approval",
          requestedBy: requestingUser?.id,
          rejectionReason: null,
        });
        console.log(`API: Updated invoice:`, savedInvoice);
      } else {
        const workOrder = await storage.getWorkOrder(workOrderId);
        const invoiceNumber = `INV-${workOrder?.workOrderNumber || workOrderId}-${Date.now()}`;
        const laborCost = parseFloat(req.body.laborCost || '0');
        const materialCost = parseFloat(req.body.materialCost || '0');
        const additionalCosts = parseFloat(req.body.additionalCosts || '0');
        const subtotal = laborCost + materialCost + additionalCosts;
        savedInvoice = await storage.createWorkOrderInvoice({
          ...req.body,
          workOrderId,
          invoiceNumber,
          subtotal: subtotal.toString(),
          status: "pending_approval",
          requestedBy: requestingUser?.id,
        });
        console.log(`API: Created invoice:`, savedInvoice);
      }
      
      res.json(savedInvoice);
    } catch (error: any) {
      console.error("API: Error creating/updating invoice:", error);
      res.status(500).json({ message: "Error creating/updating invoice: " + error.message });
    }
  });

  // Approve an invoice request — requires work order status = job_done; does NOT lock the work order (locking only happens on paid)
  app.post("/api/invoices/:id/approve", requireAuth, requirePermission("invoices.edit"), async (req, res) => {
    try {
      const invoiceId = parseInt(req.params.id);
      const approvingUser = (req as any).user;
      const invoice = await storage.getInvoiceById(invoiceId);
      if (!invoice) return res.status(404).json({ message: "Invoice not found" });

      // Require work order to be in job_done status before approving the invoice
      const workOrder = await storage.getWorkOrder(invoice.workOrderId);
      if (!workOrder) return res.status(404).json({ message: "Work order not found" });
      if (workOrder.status !== "job_done") {
        return res.status(400).json({
          message: `Work order must be in "Job Done" status before the invoice can be approved. Current status: "${workOrder.status}".`
        });
      }

      const updated = await storage.updateWorkOrderInvoice(invoice.workOrderId, {
        status: "approved",
        approvedBy: approvingUser?.id,
        approvedAt: new Date(),
      } as any);

      console.log(`Invoice ${invoiceId} approved — work order ${invoice.workOrderId} remains unlocked until paid`);
      res.json(updated);
    } catch (error: any) {
      console.error("Error approving invoice:", error);
      res.status(500).json({ message: "Failed to approve invoice" });
    }
  });

  // Reject an invoice request — notifies the requester
  app.post("/api/invoices/:id/reject", requireAuth, requirePermission("invoices.edit"), async (req, res) => {
    try {
      const invoiceId = parseInt(req.params.id);
      const { reason } = req.body;
      const invoice = await storage.getInvoiceById(invoiceId);
      if (!invoice) return res.status(404).json({ message: "Invoice not found" });

      const updated = await storage.updateWorkOrderInvoice(invoice.workOrderId, {
        status: "rejected",
        rejectionReason: reason || "No reason provided",
      } as any);

      // Notify the user who requested the invoice
      if (invoice.requestedBy) {
        const workOrder = await storage.getWorkOrder(invoice.workOrderId);
        await storage.createNotification({
          userId: invoice.requestedBy,
          type: "invoice_rejected",
          title: "Invoice Request Rejected",
          message: `Your invoice request for work order ${workOrder?.workOrderNumber || invoice.workOrderId} was rejected. Reason: ${reason || "No reason provided"}. You can submit a new request.`,
          relatedEntity: "invoice",
          relatedId: invoiceId,
          isRead: false,
        });
      }

      console.log(`Invoice ${invoiceId} rejected`);
      res.json(updated);
    } catch (error: any) {
      console.error("Error rejecting invoice:", error);
      res.status(500).json({ message: "Failed to reject invoice" });
    }
  });

  // Global invoice management routes
  app.get("/api/invoices/all", requireAuth, requirePermission("invoices.list.view"), async (req, res) => {
    try {
      const currentUser = (req as any).user;
      const currentUserPermissions: string[] = (req as any).permissions || [];
      const isAdmin = currentUserPermissions.includes("system.admin");

      const allInvoices = await storage.getAllInvoices();
      const allWorkOrders = await storage.getAllWorkOrders();
      
      const invoicesWithDetails = allInvoices
        .map(invoice => {
          const workOrder = allWorkOrders.find(wo => wo.id === invoice.workOrderId);
          // Work order is only locked when invoice is paid (not merely approved)
          const isLocked = invoice.status === "paid" || workOrder?.isLocked || false;
          
          // Parse assigned user IDs from the work order
          let assignedUserIds: number[] = [];
          try {
            if (workOrder?.assignedUserIds) {
              assignedUserIds = JSON.parse(workOrder.assignedUserIds);
            }
            if (workOrder?.assignedTo) assignedUserIds.push(workOrder.assignedTo);
          } catch {}

          return {
            ...invoice,
            workOrderNumber: workOrder?.workOrderNumber || "Unknown",
            clientName: workOrder?.clientName || "Unknown",
            workOrderStatus: workOrder?.status || "unknown",
            assignedUserIds,
            isLocked
          };
        })
        // Filter: only show invoices where the current user is assigned (unless admin)
        .filter(inv => {
          if (isAdmin) return true;
          return inv.assignedUserIds.includes(currentUser?.id);
        });
      
      res.json(invoicesWithDetails);
    } catch (error) {
      console.error("Error fetching all invoices:", error);
      res.status(500).json({ message: "Failed to get invoices" });
    }
  });

  app.post("/api/invoices", requireAuth, requirePermission("invoices.create"), async (req, res) => {
    try {
      console.log("Creating new invoice:", req.body);
      
      // Generate invoice number if not provided
      if (!req.body.invoiceNumber) {
        const workOrder = await storage.getWorkOrder(req.body.workOrderId);
        req.body.invoiceNumber = `INV-${workOrder?.workOrderNumber || req.body.workOrderId}-${Date.now()}`;
      }
      
      // Calculate subtotal if not provided
      if (!req.body.subtotal) {
        const laborCost = parseFloat(req.body.laborCost || '0');
        const materialCost = parseFloat(req.body.materialCost || '0');
        const additionalCosts = parseFloat(req.body.additionalCosts || '0');
        req.body.subtotal = (laborCost + materialCost + additionalCosts).toString();
      }
      
      const invoice = await storage.createWorkOrderInvoice(req.body);
      res.status(201).json(invoice);
    } catch (error) {
      console.error("Error creating invoice:", error);
      res.status(400).json({ message: "Failed to create invoice" });
    }
  });

  app.patch("/api/invoices/:id", requireAuth, requirePermission("invoices.edit"), async (req, res) => {
    try {
      const invoiceId = parseInt(req.params.id);
      console.log(`Updating invoice ${invoiceId}:`, req.body);
      
      // Get the invoice to find the work order
      const invoice = await storage.getInvoiceById(invoiceId);
      if (!invoice) {
        return res.status(404).json({ message: "Invoice not found" });
      }
      
      const updatedInvoice = await storage.updateWorkOrderInvoice(invoice.workOrderId, req.body);
      
      // If status changed to "paid", lock the work order
      if (req.body.status === "paid") {
        await storage.lockWorkOrder(invoice.workOrderId);
        console.log(`Work order ${invoice.workOrderId} has been LOCKED due to paid invoice`);
      }
      
      res.json(updatedInvoice);
    } catch (error) {
      console.error("Error updating invoice:", error);
      res.status(400).json({ message: "Failed to update invoice" });
    }
  });

  app.delete("/api/invoices/:id", requireAuth, requirePermission("invoices.delete"), async (req, res) => {
    try {
      const invoiceId = parseInt(req.params.id);
      console.log(`Deleting invoice ${invoiceId}`);
      
      // Get the invoice to find the work order
      const invoice = await storage.getInvoiceById(invoiceId);
      if (!invoice) {
        return res.status(404).json({ message: "Invoice not found" });
      }
      
      // Check if invoice is locked (paid status)
      if (invoice.status === "paid") {
        return res.status(403).json({ message: "Cannot delete paid invoice - work order is locked" });
      }
      
      const deleted = await storage.deleteInvoice(invoiceId);
      if (!deleted) {
        return res.status(404).json({ message: "Invoice not found" });
      }
      
      res.json({ message: "Invoice deleted successfully" });
    } catch (error) {
      console.error("Error deleting invoice:", error);
      res.status(400).json({ message: "Failed to delete invoice" });
    }
  });

  // ── Global Search ──────────────────────────────────────────────────────────
  app.get("/api/search", requireAuth, async (req, res) => {
    try {
      const q = ((req.query.q as string) || "").toLowerCase().trim();
      if (!q || q.length < 2) return res.json([]);

      const [workOrders, users, technicians, invoices, payments] = await Promise.all([
        storage.getAllWorkOrders(),
        storage.getAllUsers(),
        storage.getAllTechnicians(),
        storage.getAllInvoices(),
        storage.getAllTechnicianPayments(),
      ]);

      const results: Array<{
        id: string; type: string; title: string; subtitle: string; href: string; badge?: string;
      }> = [];

      // Work orders
      for (const wo of workOrders) {
        if (
          wo.workOrderNumber?.toLowerCase().includes(q) ||
          wo.clientName?.toLowerCase().includes(q) ||
          wo.title?.toLowerCase().includes(q) ||
          wo.description?.toLowerCase().includes(q) ||
          wo.street?.toLowerCase().includes(q) ||
          wo.city?.toLowerCase().includes(q)
        ) {
          results.push({
            id: `wo-${wo.id}`, type: "Work Order",
            title: wo.workOrderNumber,
            subtitle: `${wo.clientName || "—"} · ${wo.city || wo.street || ""}`,
            href: "/work-orders",
            badge: wo.status,
          });
        }
      }

      // Users
      for (const u of users) {
        if (
          u.firstName?.toLowerCase().includes(q) ||
          u.lastName?.toLowerCase().includes(q) ||
          u.email?.toLowerCase().includes(q) ||
          u.username?.toLowerCase().includes(q)
        ) {
          results.push({
            id: `usr-${u.id}`, type: "User",
            title: `${u.firstName} ${u.lastName}`,
            subtitle: u.email,
            href: "/users",
            badge: u.role?.name,
          });
        }
      }

      // Technicians
      for (const t of technicians) {
        if (
          t.firstName?.toLowerCase().includes(q) ||
          t.lastName?.toLowerCase().includes(q) ||
          t.email?.toLowerCase().includes(q) ||
          t.specialty?.toLowerCase().includes(q)
        ) {
          results.push({
            id: `tech-${t.id}`, type: "Technician",
            title: `${t.firstName} ${t.lastName}`,
            subtitle: t.specialty || t.email || "",
            href: "/technicians",
            badge: t.status,
          });
        }
      }

      // Invoices
      for (const inv of invoices) {
        const wo = workOrders.find(w => w.id === inv.workOrderId);
        if (
          inv.invoiceNumber?.toLowerCase().includes(q) ||
          wo?.workOrderNumber?.toLowerCase().includes(q) ||
          wo?.clientName?.toLowerCase().includes(q)
        ) {
          results.push({
            id: `inv-${inv.id}`, type: "Invoice",
            title: inv.invoiceNumber,
            subtitle: `${wo?.workOrderNumber || ""} · ${wo?.clientName || ""}`,
            href: "/payment-manager",
            badge: inv.status,
          });
        }
      }

      // Payments
      for (const p of payments) {
        const wo = workOrders.find(w => w.id === p.workOrderId);
        if (wo?.workOrderNumber?.toLowerCase().includes(q) || wo?.clientName?.toLowerCase().includes(q)) {
          results.push({
            id: `pay-${p.id}`, type: "Payment",
            title: `Payment #${p.id}`,
            subtitle: `${wo?.workOrderNumber || ""} · ${wo?.clientName || ""}`,
            href: "/technician-payments",
            badge: p.status,
          });
        }
      }

      res.json(results.slice(0, 20));
    } catch (error: any) {
      console.error("Search error:", error);
      res.status(500).json({ message: "Search failed" });
    }
  });

  // ── Analytics ──────────────────────────────────────────────────────────────
  app.get("/api/analytics", requireAuth, requirePermission("analytics.view"), async (req, res) => {
    try {
      const [workOrders, invoices, payments, technicians, users, proposals] = await Promise.all([
        storage.getAllWorkOrders(),
        storage.getAllInvoices(),
        storage.getAllTechnicianPayments(),
        storage.getAllTechnicians(),
        storage.getAllUsers(),
        storage.getAllProposals(),
      ]);

      // ── Work order stats ──────────────────────────────────────
      const woStats = {
        total: workOrders.length,
        completed: workOrders.filter(w => w.status === "completed").length,
        pending: workOrders.filter(w => w.status === "pending").length,
        inProgress: workOrders.filter(w => w.status === "in_progress" || w.status === "in-progress").length,
        cancelled: workOrders.filter(w => w.status === "cancelled").length,
        urgentCount: workOrders.filter(w => w.urgency === "urgent" || w.priority === "urgent").length,
        avgCompletionTime: 8, // placeholder hours
      };

      // ── Financial stats ───────────────────────────────────────
      const approvedInvoices = invoices.filter(i => i.status === "approved" || i.status === "paid");
      const totalRevenue = approvedInvoices.reduce((s, i) => s + parseFloat(i.totalAmount || "0"), 0);
      const totalPayments = payments
        .filter(p => ["approved", "paid", "partially_paid"].includes(p.status))
        .reduce((s, p) => s + parseFloat(p.amountApproved || p.amountRequested || "0"), 0);

      const financialStats = {
        totalRevenue: Math.round(totalRevenue),
        totalCosts: Math.round(totalPayments),
        profit: Math.round(totalRevenue - totalPayments),
        avgProjectValue: approvedInvoices.length > 0 ? Math.round(totalRevenue / approvedInvoices.length) : 0,
        outstandingInvoices: invoices.filter(i => i.status === "pending_approval" || i.status === "draft").length,
        paidInvoices: invoices.filter(i => i.status === "paid").length,
        approvedInvoices: invoices.filter(i => i.status === "approved").length,
        totalLaborCost: Math.round(approvedInvoices.reduce((s, i) => s + parseFloat(i.laborCost || "0"), 0)),
        totalMaterialCost: Math.round(approvedInvoices.reduce((s, i) => s + parseFloat(i.materialCost || "0"), 0)),
      };

      // ── Technician stats ──────────────────────────────────────
      const ratingsData = technicians.filter(t => t.rating !== null);
      const avgRating = ratingsData.length > 0
        ? ratingsData.reduce((s, t) => s + parseFloat(t.rating || "0"), 0) / ratingsData.length
        : 0;

      const topPerformers = technicians
        .sort((a, b) => parseFloat(b.rating || "0") - parseFloat(a.rating || "0"))
        .slice(0, 8)
        .map(t => ({
          id: t.id,
          name: `${t.firstName} ${t.lastName}`,
          rating: parseFloat(t.rating || "0"),
          completedJobs: workOrders.filter(w => w.technicianId === t.id && w.status === "completed").length,
        }));

      const technicianStats = {
        totalTechnicians: technicians.length,
        activeTechnicians: technicians.filter(t => t.status === "active").length,
        avgRating: parseFloat(avgRating.toFixed(1)),
        totalRatings: technicians.filter(t => t.rating !== null).length,
        topPerformers,
      };

      // ── User stats ────────────────────────────────────────────
      const roleMap: Record<string, number> = {};
      for (const u of users) {
        const role = u.role?.name || "unknown";
        roleMap[role] = (roleMap[role] || 0) + 1;
      }
      const userStats = {
        totalUsers: users.length,
        activeUsers: users.filter(u => u.isActive !== false).length,
        roleDistribution: Object.entries(roleMap).map(([role, count]) => ({ role, count })),
      };

      // ── Monthly data (last 12 months) ─────────────────────────
      const now = new Date();
      const monthlyData = Array.from({ length: 12 }, (_, i) => {
        const d = new Date(now.getFullYear(), now.getMonth() - (11 - i), 1);
        const next = new Date(d.getFullYear(), d.getMonth() + 1, 1);
        const label = d.toLocaleString("en-US", { month: "short", year: "2-digit" });
        const monthWOs = workOrders.filter(w => {
          const cd = new Date(w.createdAt);
          return cd >= d && cd < next;
        });
        const monthInvoices = approvedInvoices.filter(iv => {
          const cd = new Date(iv.createdAt);
          return cd >= d && cd < next;
        });
        const monthPayments = payments.filter(p => {
          const cd = new Date(p.createdAt);
          return cd >= d && cd < next && ["approved","paid","partially_paid"].includes(p.status);
        });
        const rev = monthInvoices.reduce((s, iv) => s + parseFloat(iv.totalAmount || "0"), 0);
        const costs = monthPayments.reduce((s, p) => s + parseFloat(p.amountApproved || p.amountRequested || "0"), 0);
        return {
          month: label,
          workOrders: monthWOs.length,
          revenue: Math.round(rev),
          costs: Math.round(costs),
          profit: Math.round(rev - costs),
        };
      });

      // ── Category data ─────────────────────────────────────────
      const catMap: Record<string, number[]> = {};
      for (const w of workOrders) {
        const cat = w.category || "Other";
        if (!catMap[cat]) catMap[cat] = [];
        catMap[cat].push(parseFloat(w.actualHours as any || "0"));
      }
      const categoryData = Object.entries(catMap)
        .sort((a, b) => b[1].length - a[1].length)
        .slice(0, 8)
        .map(([category, hours]) => ({
          category,
          count: hours.length,
          avgTime: hours.length > 0 ? parseFloat((hours.reduce((s, h) => s + h, 0) / hours.length).toFixed(1)) : 0,
          revenue: Math.round(
            approvedInvoices
              .filter(iv => workOrders.find(w => w.id === iv.workOrderId)?.category === category)
              .reduce((s, iv) => s + parseFloat(iv.totalAmount || "0"), 0)
          ),
        }));

      // ── Priority / urgency data ───────────────────────────────
      const urgencies = ["urgent", "high", "normal", "low"];
      const priorityData = urgencies.map(u => {
        const count = workOrders.filter(w => w.urgency === u || w.priority === u).length;
        return { priority: u, count, percentage: workOrders.length > 0 ? Math.round((count / workOrders.length) * 100) : 0 };
      }).filter(p => p.count > 0);

      // ── Status data ───────────────────────────────────────────
      const statusColors: Record<string, string> = {
        pending: "#FFBB28", in_progress: "#2563EB", "in-progress": "#2563EB",
        completed: "#14B8A6", cancelled: "#EF4444", active: "#22C55E",
        assigned: "#3B82F6", secured: "#6366F1", onsite: "#16A34A",
        needs_proposal: "#F59E0B", return_trip_needed: "#EAB308",
        job_done: "#10B981", approved_pending: "#84CC16",
        approved_scheduled: "#06B6D4", awaiting_approval: "#F97316",
        invoiced: "#7C3AED", bill_on_incurred: "#A855F7",
        todays_eta: "#0EA5E9", parts_needed: "#EA580C",
        parts_ordered: "#D97706", awaiting_advise: "#6B7280",
        recall: "#DC2626", need_revised_quote: "#B45309",
        recall_no_charge: "#F43F5E", on_hold: "#9CA3AF",
      };
      const statusMap: Record<string, number> = {};
      for (const w of workOrders) {
        const s = w.status || "unknown";
        statusMap[s] = (statusMap[s] || 0) + 1;
      }
      const statusData = Object.entries(statusMap).map(([status, count]) => ({
        status,
        count,
        color: statusColors[status] || "#8884D8",
        percentage: workOrders.length > 0 ? Math.round((count / workOrders.length) * 100) : 0,
      }));

      // ── All payments list ─────────────────────────────────────
      const allPaymentsList = payments.map(p => {
        const wo = workOrders.find(w => w.id === p.workOrderId);
        return {
          id: p.id,
          workOrderNumber: wo?.workOrderNumber || `WO-${p.workOrderId}`,
          clientName: wo?.clientName || "—",
          amountRequested: parseFloat(p.amountRequested || "0"),
          amountApproved: parseFloat(p.amountApproved || "0"),
          status: p.status,
          createdAt: p.createdAt,
        };
      });

      // ── Proposal vs Invoice comparison ────────────────────────
      const proposalVsInvoice = workOrders
        .map(wo => {
          const proposal = proposals.find(p => p.workOrderId === wo.id);
          const invoice = invoices.find(i => i.workOrderId === wo.id);
          if (!proposal && !invoice) return null;
          const proposalTotal = parseFloat(proposal?.totalCost || "0");
          const invoiceTotal = parseFloat(invoice?.totalAmount || "0");
          const diff = proposalTotal - invoiceTotal;
          return {
            workOrderId: wo.id,
            workOrderNumber: wo.workOrderNumber,
            clientName: wo.clientName || "—",
            status: wo.status,
            proposalTotal,
            invoiceTotal,
            diff: Math.abs(diff),
            // diff > 0: proposal was higher → invoice cost less → we saved (under budget)
            // diff < 0: invoice was higher → went over proposal → over budget
            result: diff > 0.01 ? "under_budget" : diff < -0.01 ? "over_budget" : "exact",
            hasProposal: !!proposal,
            hasInvoice: !!invoice,
            invoiceStatus: invoice?.status || null,
          };
        })
        .filter(Boolean);

      const underBudgetItems = proposalVsInvoice.filter(i => i!.result === "under_budget");
      const overBudgetItems  = proposalVsInvoice.filter(i => i!.result === "over_budget");
      const totalSaved  = underBudgetItems.reduce((s, i) => s + i!.diff, 0);
      const totalOverspent = overBudgetItems.reduce((s, i) => s + i!.diff, 0);

      // ── Recent activity ───────────────────────────────────────
      const recentActivity = workOrders
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, 10)
        .map(w => ({
          id: w.id,
          type: "work_order",
          description: `Work order ${w.workOrderNumber} — ${w.title || w.description || w.category}`,
          timestamp: new Date(w.createdAt).toLocaleDateString(),
          user: w.clientName || "—",
        }));

      res.json({
        workOrderStats: woStats,
        financialStats,
        technicianStats,
        userStats,
        monthlyData,
        categoryData,
        priorityData,
        statusData,
        allPaymentsList,
        proposalVsInvoice,
        proposalVsSummary: {
          totalCompared: proposalVsInvoice.length,
          underBudgetCount: underBudgetItems.length,
          overBudgetCount: overBudgetItems.length,
          exactCount: proposalVsInvoice.filter(i => i!.result === "exact").length,
          totalSaved: Math.round(totalSaved),
          totalOverspent: Math.round(totalOverspent),
          netResult: Math.round(totalSaved - totalOverspent),
        },
        recentActivity,
      });
    } catch (error: any) {
      console.error("Analytics error:", error);
      res.status(500).json({ message: "Failed to generate analytics", error: error.message });
    }
  });

  // Get all proposals for financial analysis
  app.get("/api/proposals", requireAuth, async (req, res) => {
    try {
      const proposals = await storage.getAllProposals();
      res.json(proposals);
    } catch (error) {
      console.error("Error fetching proposals:", error);
      res.status(500).json({ message: "Failed to fetch proposals" });
    }
  });

  // Notification routes
  app.get("/api/notifications", requireAuth, async (req, res) => {
    try {
      console.log("Fetching notifications for user:", req.user.id);
      const notifications = await storage.getNotifications(req.user.id);
      res.json(notifications);
    } catch (error: any) {
      console.error("Notifications error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/notifications", requireAuth, async (req, res) => {
    try {
      const notification = await storage.createNotification(req.body);
      res.status(201).json(notification);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.patch("/api/notifications/:id/read", requireAuth, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const success = await storage.markNotificationAsRead(id);
      if (success) {
        res.json({ message: "Notification marked as read" });
      } else {
        res.status(404).json({ message: "Notification not found" });
      }
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.patch("/api/notifications/mark-all-read", requireAuth, async (req, res) => {
    try {
      const success = await storage.markAllNotificationsAsRead(req.user.id);
      res.json({ message: "All notifications marked as read" });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ─── Data Import Routes ───────────────────────────────────────────────────

  // Simple in-memory cache for column analysis results (keyed by sorted columns + dataType)
  const columnAnalysisCache = new Map<string, object>();

  // Heuristic AI field mapping: accepts column names, returns best NOVIQ field matches
  app.post("/api/import/analyze-columns", requireAuth, requireAnyPermission(["technicians.create", "workorders.create"]), async (req, res) => {
    try {
      const { columns, dataType } = req.body as { columns: string[]; dataType: "technicians" | "work-orders" | "payments" | "invoices" };

      // Check cache first (keyed by sorted column list + dataType)
      const cacheKey = `${dataType}::${[...columns].sort().join(",")}`;
      if (columnAnalysisCache.has(cacheKey)) {
        return res.json(columnAnalysisCache.get(cacheKey));
      }

      // NOVIQ canonical field definitions with aliases and metadata
      const technicianFields: Record<string, { aliases: string[]; required: boolean; label: string; transform?: string }> = {
        fullName:         { aliases: ["name","full_name","fullname","full name","name_full","contact_name","technician_name","employee_name","worker_name"], required: false, label: "Full Name (auto-split)", transform: "split_full_name" },
        firstName:        { aliases: ["first_name","firstname","fname","first","given_name","name_first","forename"], required: true, label: "First Name", transform: "split_name_first" },
        lastName:         { aliases: ["last_name","lastname","lname","last","family_name","surname","name_last"], required: true, label: "Last Name", transform: "split_name_last" },
        email:            { aliases: ["email","email_address","e_mail","mail","contact_email","tech_email"], required: true, label: "Email" },
        phone:            { aliases: ["phone","phone_number","tel","telephone","mobile","cell","contact_phone","ph"], required: true, label: "Phone", transform: "normalize_phone" },
        specialization:   { aliases: ["specialization","specialty","trade","skill","expertise","area","discipline","field","profession"], required: true, label: "Specialization" },
        experience:       { aliases: ["experience","years_experience","exp","years","yrs","years_of_experience","experience_years"], required: true, label: "Experience (years)" },
        hourlyRate:       { aliases: ["hourly_rate","rate","pay_rate","wage","hourly","hour_rate","billing_rate","cost_per_hour","price"], required: true, label: "Hourly Rate" },
        availability:     { aliases: ["availability","available","status","availability_status","avail"], required: false, label: "Availability" },
        location:         { aliases: ["location","address","city","area","region","base","city_state","home_base"], required: true, label: "Location" },
        paymentMethods:   { aliases: ["payment_methods","payment_method","payment","pay_method","payment_type","pay_type"], required: true, label: "Payment Methods" },
        bankAccount:      { aliases: ["bank_account","account_number","acct","bank_acct"], required: false, label: "Bank Account" },
        routingNumber:    { aliases: ["routing_number","routing","aba","routing_no"], required: false, label: "Routing Number" },
        bankName:         { aliases: ["bank_name","bank","financial_institution"], required: false, label: "Bank Name" },
        paypalEmail:      { aliases: ["paypal_email","paypal","pp_email"], required: false, label: "PayPal Email" },
        venmoHandle:      { aliases: ["venmo_handle","venmo","venmo_username"], required: false, label: "Venmo Handle" },
        cashappHandle:    { aliases: ["cashapp_handle","cashapp","cash_app","$cashtag"], required: false, label: "CashApp Handle" },
        zelleInfo:        { aliases: ["zelle_info","zelle","zelle_phone","zelle_email"], required: false, label: "Zelle Info" },
        mailingAddress:   { aliases: ["mailing_address","mailing","postal_address","home_address","address"], required: false, label: "Mailing Address" },
        latitude:         { aliases: ["latitude","lat"], required: false, label: "Latitude" },
        longitude:        { aliases: ["longitude","lng","lon","long"], required: false, label: "Longitude" },
      };

      const workOrderFields: Record<string, { aliases: string[]; required: boolean; label: string; transform?: string }> = {
        title:                  { aliases: ["title","name","work_order_title","job_title","subject","description_short","summary"], required: true, label: "Title" },
        description:            { aliases: ["description","desc","details","notes","full_description","narrative"], required: true, label: "Description" },
        status:                 { aliases: ["status","order_status","job_status","state","wo_status"], required: false, label: "Status", transform: "normalize_status" },
        priority:               { aliases: ["priority","urgency","importance","level","priority_level"], required: false, label: "Priority", transform: "normalize_priority" },
        category:               { aliases: ["category","type","work_type","job_type","trade","service_type"], required: true, label: "Category" },
        location:               { aliases: ["location","address","site","place","job_location","service_address","site_address"], required: true, label: "Location" },
        clientName:             { aliases: ["client_name","customer_name","customer","client","contact_name","account_name"], required: false, label: "Client Name" },
        clientPhone:            { aliases: ["client_phone","customer_phone","contact_phone","client_tel","cust_phone"], required: false, label: "Client Phone", transform: "normalize_phone" },
        clientEmail:            { aliases: ["client_email","customer_email","contact_email","cust_email"], required: false, label: "Client Email" },
        country:                { aliases: ["country","nation","country_code"], required: false, label: "Country" },
        city:                   { aliases: ["city","town","municipality"], required: false, label: "City" },
        street:                 { aliases: ["street","street_address","street1","address_line1"], required: false, label: "Street" },
        zipCode:                { aliases: ["zip_code","zip","postal_code","postcode"], required: false, label: "Zip Code" },
        nte:                    { aliases: ["nte","not_to_exceed","budget","max_amount","authorized_amount","cap"], required: false, label: "NTE ($)" },
        estimatedHours:         { aliases: ["estimated_hours","est_hours","hours","duration"], required: false, label: "Estimated Hours" },
        scheduledDate:          { aliases: ["scheduled_date","schedule_date","date","job_date","service_date","appointment_date"], required: false, label: "Scheduled Date", transform: "normalize_date" },
        startDate:              { aliases: ["start_date","start","begin_date","commenced"], required: false, label: "Start Date", transform: "normalize_date" },
        endDate:                { aliases: ["end_date","end","finish_date","completion_date","close_date"], required: false, label: "End Date", transform: "normalize_date" },
        equipmentType:          { aliases: ["equipment_type","equipment","asset","machine","device"], required: false, label: "Equipment Type" },
        problemDescription:     { aliases: ["problem_description","problem","issue","fault","complaint","reason"], required: false, label: "Problem Description" },
        specialInstructions:    { aliases: ["special_instructions","instructions","special_notes","notes"], required: false, label: "Special Instructions" },
        clientWorkOrderNumber:  { aliases: ["client_work_order_number","work_order_number","wo_number","job_number","order_number","wo_id","external_id","ref_number"], required: false, label: "Original WO Number" },
        technicianEmail:        { aliases: ["technician_email","tech_email","assigned_tech_email","worker_email","assignee_email","tech"], required: false, label: "Technician Email (for linking)" },
      };

      const paymentFields: Record<string, { aliases: string[]; required: boolean; label: string; transform?: string }> = {
        workOrderNumber:  { aliases: ["work_order_number","wo_number","order_number","job_number","wo_id","external_id","ref_number"], required: true, label: "Work Order Number" },
        technicianEmail:  { aliases: ["technician_email","tech_email","assignee_email","worker_email","email"], required: true, label: "Technician Email" },
        paymentMethod:    { aliases: ["payment_method","payment","method","pay_method","pay_type"], required: true, label: "Payment Method" },
        amountRequested:  { aliases: ["amount_requested","amount","requested_amount","total","pay_amount","cost","charge"], required: true, label: "Amount Requested ($)" },
        amountApproved:   { aliases: ["amount_approved","approved_amount","approved"], required: false, label: "Amount Approved ($)" },
        amountPaid:       { aliases: ["amount_paid","paid_amount","paid"], required: false, label: "Amount Paid ($)" },
        status:           { aliases: ["status","payment_status","state","pay_status"], required: false, label: "Status (pending/approved/paid/rejected)" },
        description:      { aliases: ["description","notes","memo","note","detail"], required: false, label: "Description" },
      };

      const invoiceFields: Record<string, { aliases: string[]; required: boolean; label: string; transform?: string }> = {
        workOrderNumber:  { aliases: ["work_order_number","wo_number","order_number","job_number","wo_id","external_id","ref_number"], required: true, label: "Work Order Number" },
        invoiceNumber:    { aliases: ["invoice_number","invoice_no","inv_number","invoice_id","inv_no","invoice"], required: true, label: "Invoice Number (must be unique)" },
        laborCost:        { aliases: ["labor_cost","labour_cost","labor","labour","labor_amount"], required: true, label: "Labor Cost ($)" },
        materialCost:     { aliases: ["material_cost","materials","parts_cost","material","materials_amount"], required: true, label: "Material Cost ($)" },
        additionalCosts:  { aliases: ["additional_costs","additional","other_costs","extra","misc_costs"], required: false, label: "Additional Costs ($)" },
        taxRate:          { aliases: ["tax_rate","tax","vat_rate","gst_rate","tax_percent"], required: false, label: "Tax Rate (e.g. 0.1 = 10%)" },
        notes:            { aliases: ["notes","memo","description","note","comments"], required: false, label: "Notes" },
        status:           { aliases: ["status","invoice_status","state","inv_status"], required: false, label: "Status (draft/pending_approval/approved/sent/paid)" },
      };

      const fieldDefs = dataType === "technicians" ? technicianFields
        : dataType === "payments" ? paymentFields
        : dataType === "invoices" ? invoiceFields
        : workOrderFields;

      // Normalize a string for comparison
      const normalize = (s: string) => s.toLowerCase().replace(/[\s\-\.\/]/g, "_").replace(/[^a-z0-9_]/g, "");

      // Score a column against a field's aliases
      const scoreMatch = (col: string, noviqField: string, def: { aliases: string[] }): number => {
        const normCol = normalize(col);
        const normField = normalize(noviqField);

        // Exact match
        if (normCol === normField) return 100;
        // Alias exact match
        if (def.aliases.some(a => normalize(a) === normCol)) return 95;
        // Field contains column or column contains field
        if (normField.includes(normCol) || normCol.includes(normField)) return 80;
        // Any alias contains column or column contains alias
        if (def.aliases.some(a => normalize(a).includes(normCol) || normCol.includes(normalize(a)))) return 70;
        // Levenshtein-like: if column words are subset of alias words
        const colWords = normCol.split("_").filter(Boolean);
        const fieldWords = normField.split("_").filter(Boolean);
        const overlap = colWords.filter(w => fieldWords.includes(w)).length;
        if (overlap > 0) return Math.round(50 + (overlap / Math.max(colWords.length, fieldWords.length)) * 20);
        return 0;
      };

      // For each input column, find the best NOVIQ field match
      const suggestions: Record<string, { noviqField: string | null; confidence: number; label: string; required: boolean; transform?: string; alternatives: Array<{ noviqField: string; confidence: number; label: string }> }> = {};

      for (const col of columns) {
        let bestField: string | null = null;
        let bestScore = 0;
        const scores: Array<{ noviqField: string; score: number; label: string; required: boolean }> = [];

        for (const [fieldName, fieldDef] of Object.entries(fieldDefs)) {
          const score = scoreMatch(col, fieldName, fieldDef);
          if (score > 0) scores.push({ noviqField: fieldName, score, label: fieldDef.label, required: fieldDef.required });
          if (score > bestScore) {
            bestScore = score;
            bestField = fieldName;
          }
        }

        scores.sort((a, b) => b.score - a.score);
        const top = scores.slice(0, 3);
        const chosen = bestScore >= 60 ? bestField : null;

        suggestions[col] = {
          noviqField: chosen,
          confidence: bestScore,
          label: chosen ? fieldDefs[chosen].label : "Unmapped",
          required: chosen ? fieldDefs[chosen].required : false,
          transform: chosen ? fieldDefs[chosen].transform : undefined,
          alternatives: top.filter(s => s.noviqField !== chosen).slice(0, 2).map(s => ({ noviqField: s.noviqField, confidence: s.score, label: s.label })),
        };
      }

      // Optionally enhance suggestions using OpenAI when API key is configured
      if (process.env.OPENAI_API_KEY) {
        try {
          const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
          const fieldList = Object.entries(fieldDefs).map(([k, v]) => `${k}: "${v.label}"`).join("\n");
          const columnList = columns.map(c => `"${c}"`).join(", ");
          const completion = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
              {
                role: "system",
                content: `You are a data mapping assistant for a field-service management platform called NOVIQ. Given CSV column names and available NOVIQ system field keys with their labels, map each column to the most appropriate field key. Respond with ONLY valid JSON: an object where each key is the exact CSV column name and the value is the exact NOVIQ field key string (or null if no match). Available fields:\n${fieldList}`,
              },
              {
                role: "user",
                content: `Map these CSV columns to NOVIQ fields: ${columnList}`,
              },
            ],
            response_format: { type: "json_object" },
            max_tokens: 600,
            temperature: 0,
          });
          const aiMappings: Record<string, string | null> = JSON.parse(completion.choices[0].message.content || "{}");
          for (const [col, aiField] of Object.entries(aiMappings)) {
            if (!suggestions[col]) continue;
            if (typeof aiField === "string" && fieldDefs[aiField]) {
              // AI suggests a valid field — boost confidence if heuristic was below 85
              if (suggestions[col].confidence < 85) {
                suggestions[col] = {
                  ...suggestions[col],
                  noviqField: aiField,
                  confidence: Math.max(suggestions[col].confidence, 85),
                  label: fieldDefs[aiField].label,
                  required: fieldDefs[aiField].required,
                  transform: fieldDefs[aiField].transform,
                };
              }
            } else if (aiField === null && suggestions[col].confidence < 60) {
              // AI says skip; only apply if heuristic confidence was also low
              suggestions[col].noviqField = null;
            }
          }
        } catch (_) {
          // OpenAI unavailable or failed — silently continue with heuristic results
        }
      }

      // Return available NOVIQ fields for manual selection
      const availableFields = Object.entries(fieldDefs).map(([k, v]) => ({ value: k, label: v.label, required: v.required }));

      const result = { suggestions, availableFields };
      columnAnalysisCache.set(cacheKey, result);
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Preview (dry-run) import - validates and detects anomalies, nothing is saved
  app.post("/api/import/preview", requireAuth, requireAnyPermission(["technicians.create", "workorders.create"]), async (req, res) => {
    try {
      const { rows, fieldMapping, dataType } = req.body as {
        rows: Record<string, string>[];
        fieldMapping: Record<string, string | null>; // oldColumn -> noviqField
        dataType: "technicians" | "work-orders" | "payments" | "invoices";
      };

      if (!Array.isArray(rows) || rows.length === 0) {
        return res.status(400).json({ message: "No rows provided" });
      }

      // Transform a single raw row using the field mapping
      const applyMapping = (rawRow: Record<string, string>, mapping: Record<string, string | null>) => {
        const mapped: Record<string, string> = {};
        for (const [oldCol, noviqField] of Object.entries(mapping)) {
          if (noviqField && rawRow[oldCol] !== undefined) {
            const val = rawRow[oldCol];
            // Handle split name fields - first check if we already have a value
            if (noviqField === "fullName") {
              // Dedicated full-name field: always split on first space into firstName + lastName
              const parts = val.trim().split(/\s+/);
              if (!mapped.firstName) mapped.firstName = parts[0];
              if (!mapped.lastName) mapped.lastName = parts.length > 1 ? parts.slice(1).join(" ") : "";
              transformations.namesSplit++;
            } else if (noviqField === "firstName" && !mapped.firstName) {
              // If value looks like a full name (has a space), split into first+last
              if (val.includes(" ")) {
                const parts = val.trim().split(/\s+/);
                mapped.firstName = parts[0];
                if (!mapped.lastName) mapped.lastName = parts.slice(1).join(" ");
                transformations.namesSplit++;
              } else {
                mapped.firstName = val;
              }
            } else if (noviqField === "lastName" && !mapped.lastName) {
              mapped.lastName = val;
            } else if (!mapped[noviqField]) {
              mapped[noviqField] = val;
            }
          }
        }
        return mapped;
      };

      // Normalize phone: strip non-digits, format as (XXX) XXX-XXXX if US
      const normalizePhone = (phone: string): string => {
        const digits = phone.replace(/\D/g, "");
        if (digits.length === 10) return `(${digits.slice(0,3)}) ${digits.slice(3,6)}-${digits.slice(6)}`;
        if (digits.length === 11 && digits[0] === "1") return `(${digits.slice(1,4)}) ${digits.slice(4,7)}-${digits.slice(7)}`;
        return phone; // return as-is if can't normalize
      };

      // Normalize date: detect common formats and convert to YYYY-MM-DD
      const normalizeDate = (date: string): string => {
        if (!date) return date;
        // Already ISO
        if (/^\d{4}-\d{2}-\d{2}/.test(date)) return date.slice(0, 10);
        // MM/DD/YYYY or MM-DD-YYYY
        const mdy = date.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
        if (mdy) return `${mdy[3]}-${mdy[1].padStart(2,"0")}-${mdy[2].padStart(2,"0")}`;
        // DD/MM/YYYY (European) — ambiguous, treat as MDY if month <= 12
        return date;
      };

      const statusMap: Record<string, string> = {
        "open": "pending", "new": "pending", "started": "in_progress",
        "in progress": "in_progress", "in-progress": "in_progress",
        "done": "completed", "closed": "completed", "finished": "completed", "complete": "completed",
        "cancelled": "cancelled", "canceled": "cancelled", "hold": "on_hold", "on hold": "on_hold",
      };
      const priorityMap: Record<string, string> = {
        "low": "low", "normal": "medium", "medium": "medium",
        "high": "high", "urgent": "urgent", "critical": "urgent", "emergency": "urgent",
      };

      type RowResult = {
        rowIndex: number;
        rawRow: Record<string, string>;
        mappedRow: Record<string, string>;
        status: "ready" | "warning" | "error";
        confidence: number;
        issues: string[];
        warnings: string[];
      };

      // Transformation tracking counters
      const transformations = {
        phonesNormalized: 0,
        datesConverted: 0,
        namesSplit: 0,
        statusesNormalized: 0,
        prioritiesNormalized: 0,
        statusMap: {} as Record<string, string>,
        detectedDateFormats: new Set<string>(),
      };

      const results: RowResult[] = [];
      const emailsSeen = new Set<string>();
      const woNumbersSeen = new Set<string>();

      // Get existing emails/WO numbers for duplicate checking
      let existingEmails = new Set<string>();
      let existingWoNumbers = new Set<string>();
      let existingTechEmails = new Set<string>();
      let existingInvoiceNumbers = new Set<string>();
      try {
        if (dataType === "technicians") {
          const techs = await storage.getAllTechnicians();
          techs.forEach(t => existingEmails.add(t.email.toLowerCase()));
        } else if (dataType === "work-orders") {
          const [orders, techs] = await Promise.all([
            storage.getAllWorkOrders(),
            storage.getAllTechnicians(),
          ]);
          orders.forEach(o => {
            if (o.clientWorkOrderNumber) existingWoNumbers.add(o.clientWorkOrderNumber.toLowerCase());
            existingWoNumbers.add(o.workOrderNumber.toLowerCase());
          });
          techs.forEach(t => existingTechEmails.add(t.email.toLowerCase()));
        } else {
          // payments or invoices: need work order numbers and technician emails
          const [orders, techs] = await Promise.all([
            storage.getAllWorkOrders(),
            storage.getAllTechnicians(),
          ]);
          orders.forEach(o => {
            if (o.clientWorkOrderNumber) existingWoNumbers.add(o.clientWorkOrderNumber.toLowerCase());
            existingWoNumbers.add(o.workOrderNumber.toLowerCase());
          });
          techs.forEach(t => existingTechEmails.add(t.email.toLowerCase()));
          if (dataType === "invoices") {
            const { rows: invRows } = await pool.query("SELECT invoice_number FROM work_order_invoices");
            invRows.forEach((r: any) => existingInvoiceNumbers.add(String(r.invoice_number).toLowerCase()));
          }
        }
      } catch (e) { /* non-fatal */ }

      // Compute all amounts for outlier detection (work orders - NTE)
      const allAmounts: number[] = [];
      if (dataType === "work-orders") {
        rows.forEach(r => {
          const mapped = applyMapping(r, fieldMapping);
          if (mapped.nte) {
            const n = parseFloat(mapped.nte.replace(/[^0-9.]/g, ""));
            if (!isNaN(n)) allAmounts.push(n);
          }
        });
      }
      const amountMean = allAmounts.length ? allAmounts.reduce((a, b) => a + b, 0) / allAmounts.length : 0;
      const amountStdDev = allAmounts.length > 1
        ? Math.sqrt(allAmounts.map(x => Math.pow(x - amountMean, 2)).reduce((a, b) => a + b, 0) / allAmounts.length)
        : 0;

      for (let i = 0; i < rows.length; i++) {
        const rawRow = rows[i];
        const mappedRow = applyMapping(rawRow, fieldMapping);
        const issues: string[] = [];
        const warnings: string[] = [];
        let confidence = 100;

        if (dataType === "technicians") {
          // Required field checks
          if (!mappedRow.firstName?.trim()) { issues.push("Missing first name"); confidence -= 30; }
          if (!mappedRow.lastName?.trim()) { issues.push("Missing last name"); confidence -= 20; }
          if (!mappedRow.email?.trim()) { issues.push("Missing email"); confidence -= 30; }
          else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mappedRow.email)) { issues.push("Invalid email format"); confidence -= 20; }
          else {
            const emailLower = mappedRow.email.toLowerCase();
            if (emailsSeen.has(emailLower)) { issues.push("Duplicate email in this file"); confidence -= 25; }
            else if (existingEmails.has(emailLower)) { warnings.push("Email already exists in NOVIQ — will be skipped"); confidence -= 10; }
            emailsSeen.add(emailLower);
          }
          if (!mappedRow.phone?.trim()) { warnings.push("Missing phone number"); confidence -= 10; }
          if (!mappedRow.specialization?.trim()) { warnings.push("Missing specialization"); confidence -= 10; }
          if (!mappedRow.experience?.trim()) { warnings.push("Missing experience"); confidence -= 5; }
          if (!mappedRow.hourlyRate?.trim()) { warnings.push("Missing hourly rate"); confidence -= 10; }
          if (!mappedRow.location?.trim()) { warnings.push("Missing location"); confidence -= 5; }
          if (!mappedRow.paymentMethods?.trim()) { warnings.push("Missing payment methods — will default to 'check'"); confidence -= 5; }

          // Apply phone normalization
          if (mappedRow.phone) {
            const normalized = normalizePhone(mappedRow.phone);
            if (normalized !== mappedRow.phone) transformations.phonesNormalized++;
            mappedRow.phone = normalized;
          }

          // Set defaults
          if (!mappedRow.availability) mappedRow.availability = "available";
          if (!mappedRow.paymentMethods) mappedRow.paymentMethods = "check";
          if (!mappedRow.experience) mappedRow.experience = "0";
          if (!mappedRow.hourlyRate) mappedRow.hourlyRate = "0";

        } else if (dataType === "work-orders") {
          // Work orders
          if (!mappedRow.title?.trim()) { issues.push("Missing title"); confidence -= 30; }
          if (!mappedRow.description?.trim()) { warnings.push("Missing description — will use title"); confidence -= 10; }
          if (!mappedRow.category?.trim()) { warnings.push("Missing category — will default to 'General'"); confidence -= 10; }
          if (!mappedRow.location?.trim()) { warnings.push("Missing location"); confidence -= 10; }

          // Normalize status
          if (mappedRow.status) {
            const rawStatus = mappedRow.status;
            const normalized = statusMap[rawStatus.toLowerCase()];
            if (!normalized) warnings.push(`Unknown status "${rawStatus}" — will default to "pending"`);
            else {
              if (rawStatus !== normalized) {
                transformations.statusesNormalized++;
                transformations.statusMap[rawStatus] = normalized;
              }
            }
            mappedRow.status = normalized || "pending";
          } else {
            mappedRow.status = "pending";
          }

          // Normalize priority
          if (mappedRow.priority) {
            const rawPriority = mappedRow.priority;
            const normalized = priorityMap[rawPriority.toLowerCase()];
            if (!normalized) warnings.push(`Unknown priority "${rawPriority}" — will default to "medium"`);
            else if (rawPriority !== normalized) transformations.prioritiesNormalized++;
            mappedRow.priority = normalized || "medium";
          } else {
            mappedRow.priority = "medium";
          }

          // Normalize dates with format tracking
          const normalizeAndTrack = (dateStr: string): string => {
            if (!dateStr) return dateStr;
            if (/^\d{4}-\d{2}-\d{2}/.test(dateStr)) {
              transformations.detectedDateFormats.add("YYYY-MM-DD");
              return dateStr.slice(0, 10);
            }
            const mdy = dateStr.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
            if (mdy) {
              transformations.detectedDateFormats.add("MM/DD/YYYY");
              transformations.datesConverted++;
              return `${mdy[3]}-${mdy[1].padStart(2,"0")}-${mdy[2].padStart(2,"0")}`;
            }
            const ymd = dateStr.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);
            if (ymd) {
              transformations.detectedDateFormats.add("YYYY/MM/DD");
              transformations.datesConverted++;
              return `${ymd[1]}-${ymd[2].padStart(2,"0")}-${ymd[3].padStart(2,"0")}`;
            }
            return dateStr;
          };
          if (mappedRow.scheduledDate) mappedRow.scheduledDate = normalizeAndTrack(mappedRow.scheduledDate);
          if (mappedRow.startDate) mappedRow.startDate = normalizeAndTrack(mappedRow.startDate);
          if (mappedRow.endDate) mappedRow.endDate = normalizeAndTrack(mappedRow.endDate);

          // Check WO number duplicates
          const woNum = mappedRow.clientWorkOrderNumber?.trim();
          if (woNum) {
            const woLower = woNum.toLowerCase();
            if (woNumbersSeen.has(woLower)) { warnings.push("Duplicate WO number in this file"); confidence -= 15; }
            else if (existingWoNumbers.has(woLower)) { warnings.push("This WO number already exists in NOVIQ — will be skipped"); confidence -= 10; }
            woNumbersSeen.add(woLower);
          }

          // Cross-reference: if a technician email is provided, check it exists in NOVIQ
          const techEmail = mappedRow.technicianEmail?.trim().toLowerCase();
          if (techEmail && existingTechEmails.size > 0 && !existingTechEmails.has(techEmail)) {
            warnings.push(`Technician email "${techEmail}" not found in NOVIQ — technician link will be left blank`);
            confidence -= 10;
          }

          // NTE outlier check
          if (mappedRow.nte && amountStdDev > 0) {
            const amount = parseFloat(mappedRow.nte.replace(/[^0-9.]/g, ""));
            if (!isNaN(amount) && Math.abs(amount - amountMean) > 3 * amountStdDev) {
              warnings.push(`NTE $${amount.toLocaleString()} is unusual compared to other rows — please verify`);
              confidence -= 10;
            }
          }

          // Defaults
          if (!mappedRow.category) mappedRow.category = "General";
          if (!mappedRow.description) mappedRow.description = mappedRow.title || "";

        } else if (dataType === "payments") {
          // Required fields
          if (!mappedRow.workOrderNumber?.trim()) { issues.push("Missing work order number"); confidence -= 30; }
          else if (existingWoNumbers.size > 0 && !existingWoNumbers.has(mappedRow.workOrderNumber.trim().toLowerCase())) {
            issues.push(`Work order "${mappedRow.workOrderNumber}" not found in NOVIQ — import will fail`); confidence -= 40;
          }
          if (!mappedRow.technicianEmail?.trim()) { issues.push("Missing technician email"); confidence -= 25; }
          else if (existingTechEmails.size > 0 && !existingTechEmails.has(mappedRow.technicianEmail.trim().toLowerCase())) {
            issues.push(`Technician email "${mappedRow.technicianEmail}" not found in NOVIQ — import will fail`); confidence -= 40;
          }
          if (!mappedRow.paymentMethod?.trim()) { issues.push("Missing payment method"); confidence -= 20; }
          if (!mappedRow.amountRequested?.trim()) { issues.push("Missing amount requested"); confidence -= 25; }
          else {
            const amt = parseFloat(mappedRow.amountRequested.replace(/[^0-9.]/g, ""));
            if (isNaN(amt) || amt < 0) { issues.push("Amount requested must be a positive number"); confidence -= 20; }
          }
          const validPayStatuses = new Set(["pending","approved","paid","rejected"]);
          if (mappedRow.status && !validPayStatuses.has(mappedRow.status.toLowerCase())) {
            warnings.push(`Unknown status "${mappedRow.status}" — will default to "pending"`); confidence -= 5;
          }
          if (!mappedRow.status) mappedRow.status = "pending";
          if (!mappedRow.amountApproved) mappedRow.amountApproved = "0";
          if (!mappedRow.amountPaid) mappedRow.amountPaid = "0";

        } else if (dataType === "invoices") {
          // Required fields
          const invWoNum = mappedRow.workOrderNumber?.trim();
          if (!invWoNum) { issues.push("Missing work order number"); confidence -= 30; }
          else if (existingWoNumbers.size > 0 && !existingWoNumbers.has(invWoNum.toLowerCase())) {
            issues.push(`Work order "${invWoNum}" not found in NOVIQ — import will fail`); confidence -= 40;
          }
          const invNum = mappedRow.invoiceNumber?.trim();
          if (!invNum) { issues.push("Missing invoice number"); confidence -= 25; }
          else if (existingInvoiceNumbers.has(invNum.toLowerCase())) {
            issues.push(`Invoice number "${invNum}" already exists — will be skipped`); confidence -= 30;
          }
          const laborCostVal = parseFloat((mappedRow.laborCost || "0").replace(/[^0-9.]/g, ""));
          const materialCostVal = parseFloat((mappedRow.materialCost || "0").replace(/[^0-9.]/g, ""));
          if (!mappedRow.laborCost?.trim()) { issues.push("Missing labor cost"); confidence -= 20; }
          else if (isNaN(laborCostVal)) { issues.push("Labor cost must be a number"); confidence -= 15; }
          if (!mappedRow.materialCost?.trim()) { issues.push("Missing material cost"); confidence -= 20; }
          else if (isNaN(materialCostVal)) { issues.push("Material cost must be a number"); confidence -= 15; }
          const addlCosts = parseFloat((mappedRow.additionalCosts || "0").replace(/[^0-9.]/g, "")) || 0;
          const taxRate = parseFloat((mappedRow.taxRate || "0.1").replace(/[^0-9.]/g, "")) || 0.1;
          const subtotal = laborCostVal + materialCostVal + addlCosts;
          const taxAmount = subtotal * taxRate;
          const totalAmount = subtotal + taxAmount;
          // Compute and store calculated fields so they can be used in confirm
          mappedRow._subtotal = subtotal.toFixed(2);
          mappedRow._taxAmount = taxAmount.toFixed(2);
          mappedRow._totalAmount = totalAmount.toFixed(2);
          mappedRow._taxRate = taxRate.toFixed(4);
          if (!mappedRow.status) mappedRow.status = "draft";
          const validInvStatuses = new Set(["draft","pending_approval","approved","rejected","sent","paid"]);
          if (!validInvStatuses.has(mappedRow.status.toLowerCase())) {
            warnings.push(`Unknown status "${mappedRow.status}" — will default to "draft"`); confidence -= 5;
            mappedRow.status = "draft";
          }
        }

        confidence = Math.max(0, Math.min(100, confidence));

        results.push({
          rowIndex: i,
          rawRow,
          mappedRow,
          status: issues.length > 0 ? "error" : warnings.length > 0 ? "warning" : "ready",
          confidence,
          issues,
          warnings,
        });
      }

      const summary = {
        total: results.length,
        ready: results.filter(r => r.status === "ready").length,
        warnings: results.filter(r => r.status === "warning").length,
        errors: results.filter(r => r.status === "error").length,
      };

      // Grouped anomaly report: aggregate unique issue/warning messages with row counts
      const issueGroups: Record<string, { message: string; rowCount: number; severity: "error" | "warning" }> = {};
      for (const row of results) {
        for (const msg of row.issues) {
          if (!issueGroups[msg]) issueGroups[msg] = { message: msg, rowCount: 0, severity: "error" };
          issueGroups[msg].rowCount++;
        }
        for (const msg of row.warnings) {
          if (!issueGroups[msg]) issueGroups[msg] = { message: msg, rowCount: 0, severity: "warning" };
          issueGroups[msg].rowCount++;
        }
      }
      const anomalies = Object.values(issueGroups).sort((a, b) => {
        if (a.severity !== b.severity) return a.severity === "error" ? -1 : 1;
        return b.rowCount - a.rowCount;
      });

      const transformationSummary = {
        phonesNormalized: transformations.phonesNormalized,
        datesConverted: transformations.datesConverted,
        namesSplit: transformations.namesSplit,
        statusesNormalized: transformations.statusesNormalized,
        prioritiesNormalized: transformations.prioritiesNormalized,
        statusMap: transformations.statusMap,
        detectedDateFormats: Array.from(transformations.detectedDateFormats),
      };

      res.json({ results, summary, anomalies, transformations: transformationSummary });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Confirm import — error rows are always skipped; warning+ready rows are imported
  app.post("/api/import/confirm", requireAuth, requireAnyPermission(["technicians.create", "workorders.create"]), async (req, res) => {
    try {
      const { rows, dataType } = req.body as {
        rows: Array<{ mappedRow: Record<string, string>; status: string; rowIndex?: number }>;
        dataType: "technicians" | "work-orders" | "payments" | "invoices";
      };

      if (!Array.isArray(rows) || rows.length === 0) {
        return res.status(400).json({ message: "No rows provided" });
      }

      // ── Phase 1: Pre-transaction validation & deduplication ──────────
      // Determine which rows to skip vs. insert before touching the DB.
      type RowDecision =
        | { action: "skip"; rowIndex: number; reason: string }
        | { action: "insert"; rowIndex: number; mappedRow: Record<string, string> };

      const decisions: RowDecision[] = [];

      const validTechStatuses = new Set(["available", "unavailable", "on_job"]);
      const validPriorities   = new Set(["low", "medium", "high", "urgent"]);
      const validWoStatuses   = new Set(["pending","in_progress","completed","cancelled","on_hold","active","assigned","secured","onsite","needs_proposal","return_trip_needed","job_done","approved_pending","approved_scheduled","awaiting_approval","invoiced","bill_on_incurred","todays_eta","parts_needed","parts_ordered","awaiting_advise","recall","need_revised_quote","recall_no_charge","in-progress"]);

      if (dataType === "technicians") {
        const existing = await storage.getAllTechnicians();
        const existingEmails = new Set(existing.map(t => t.email.toLowerCase()));
        const emailsSeen = new Set<string>();

        for (let i = 0; i < rows.length; i++) {
          const { mappedRow, status } = rows[i];
          const rowIndex = rows[i].rowIndex ?? i;
          if (status === "error") { decisions.push({ action: "skip", rowIndex, reason: "Row has validation errors" }); continue; }
          if (!mappedRow.email?.trim() || !mappedRow.firstName?.trim()) { decisions.push({ action: "skip", rowIndex, reason: "Missing required fields (email or first name)" }); continue; }
          const emailLower = mappedRow.email.toLowerCase();
          if (existingEmails.has(emailLower) || emailsSeen.has(emailLower)) { decisions.push({ action: "skip", rowIndex, reason: "Email already exists" }); continue; }
          emailsSeen.add(emailLower);
          decisions.push({ action: "insert", rowIndex, mappedRow });
        }

      } else if (dataType === "work-orders") {
        const requestedBy: number = req.user.id;
        const existing = await storage.getAllWorkOrders();
        const existingWoNums = new Set<string>([
          ...existing.map(o => o.workOrderNumber.toLowerCase()),
          ...existing.filter(o => o.clientWorkOrderNumber).map(o => o.clientWorkOrderNumber!.toLowerCase()),
        ]);
        const woNumsSeen = new Set<string>();

        for (let i = 0; i < rows.length; i++) {
          const { mappedRow, status } = rows[i];
          const rowIndex = rows[i].rowIndex ?? i;
          if (status === "error") { decisions.push({ action: "skip", rowIndex, reason: "Row has validation errors" }); continue; }
          if (!mappedRow.title?.trim()) { decisions.push({ action: "skip", rowIndex, reason: "Missing required title" }); continue; }
          const clientWoNum = mappedRow.clientWorkOrderNumber?.trim() || null;
          if (clientWoNum) {
            const lower = clientWoNum.toLowerCase();
            if (existingWoNums.has(lower) || woNumsSeen.has(lower)) { decisions.push({ action: "skip", rowIndex, reason: "Work order number already exists" }); continue; }
            woNumsSeen.add(lower);
          }
          decisions.push({ action: "insert", rowIndex, mappedRow: { ...mappedRow, _requestedBy: String(requestedBy) } });
        }

      } else if (dataType === "payments") {
        for (let i = 0; i < rows.length; i++) {
          const { mappedRow, status } = rows[i];
          const rowIndex = rows[i].rowIndex ?? i;
          if (status === "error") { decisions.push({ action: "skip", rowIndex, reason: "Row has validation errors" }); continue; }
          if (!mappedRow.workOrderNumber?.trim()) { decisions.push({ action: "skip", rowIndex, reason: "Missing work order number" }); continue; }
          if (!mappedRow.technicianEmail?.trim()) { decisions.push({ action: "skip", rowIndex, reason: "Missing technician email" }); continue; }
          if (!mappedRow.paymentMethod?.trim()) { decisions.push({ action: "skip", rowIndex, reason: "Missing payment method" }); continue; }
          if (!mappedRow.amountRequested?.trim()) { decisions.push({ action: "skip", rowIndex, reason: "Missing amount requested" }); continue; }
          decisions.push({ action: "insert", rowIndex, mappedRow });
        }

      } else if (dataType === "invoices") {
        const { rows: existingInvRows } = await pool.query("SELECT invoice_number FROM work_order_invoices");
        const existingInvNums = new Set(existingInvRows.map((r: any) => String(r.invoice_number).toLowerCase()));
        const invNumsSeen = new Set<string>();

        for (let i = 0; i < rows.length; i++) {
          const { mappedRow, status } = rows[i];
          const rowIndex = rows[i].rowIndex ?? i;
          if (status === "error") { decisions.push({ action: "skip", rowIndex, reason: "Row has validation errors" }); continue; }
          if (!mappedRow.workOrderNumber?.trim()) { decisions.push({ action: "skip", rowIndex, reason: "Missing work order number" }); continue; }
          if (!mappedRow.invoiceNumber?.trim()) { decisions.push({ action: "skip", rowIndex, reason: "Missing invoice number" }); continue; }
          const invLower = mappedRow.invoiceNumber.trim().toLowerCase();
          if (existingInvNums.has(invLower) || invNumsSeen.has(invLower)) { decisions.push({ action: "skip", rowIndex, reason: "Invoice number already exists" }); continue; }
          if (!mappedRow.laborCost?.trim()) { decisions.push({ action: "skip", rowIndex, reason: "Missing labor cost" }); continue; }
          if (!mappedRow.materialCost?.trim()) { decisions.push({ action: "skip", rowIndex, reason: "Missing material cost" }); continue; }
          invNumsSeen.add(invLower);
          decisions.push({ action: "insert", rowIndex, mappedRow });
        }
      }

      const toSkip   = decisions.filter(d => d.action === "skip");
      const toInsert = decisions.filter(d => d.action === "insert") as Array<{ action: "insert"; rowIndex: number; mappedRow: Record<string, string> }>;
      let imported = 0;
      let failed = 0;
      const skipped = toSkip.length;
      const importResults: Array<{ rowIndex: number; status: "imported" | "skipped" | "failed"; reason?: string }> = [
        ...toSkip.map(d => ({ rowIndex: d.rowIndex, status: "skipped" as const, reason: d.reason })),
      ];

      if (toInsert.length === 0) {
        return res.json({ imported: 0, skipped, failed: 0, total: rows.length, results: importResults });
      }

      // ── Phase 2: Transactional inserts ──────────────────────────────
      // All rows inserted in a single BEGIN/COMMIT. Any DB error → ROLLBACK entire batch.
      const client = await pool.connect();
      try {
        await client.query("BEGIN");

        if (dataType === "technicians") {
          for (const { rowIndex, mappedRow } of toInsert) {
            const avail = validTechStatuses.has(mappedRow.availability ?? "") ? mappedRow.availability : "available";
            await client.query(
              `INSERT INTO technicians
                 (first_name, last_name, email, phone, specialization, experience, hourly_rate,
                  availability, location, payment_methods, bank_account, routing_number, bank_name,
                  paypal_email, venmo_handle, cashapp_handle, zelle_info, mailing_address, latitude, longitude)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)`,
              [
                mappedRow.firstName.trim(),
                mappedRow.lastName?.trim() || "",
                mappedRow.email.trim(),
                mappedRow.phone?.trim() || "",
                mappedRow.specialization?.trim() || "General",
                parseInt(mappedRow.experience || "0") || 0,
                (mappedRow.hourlyRate || "0").replace(/[^0-9.]/g, "") || "0",
                avail,
                mappedRow.location?.trim() || "",
                mappedRow.paymentMethods?.trim() || "check",
                mappedRow.bankAccount?.trim() || null,
                mappedRow.routingNumber?.trim() || null,
                mappedRow.bankName?.trim() || null,
                mappedRow.paypalEmail?.trim() || null,
                mappedRow.venmoHandle?.trim() || null,
                mappedRow.cashappHandle?.trim() || null,
                mappedRow.zelleInfo?.trim() || null,
                mappedRow.mailingAddress?.trim() || null,
                mappedRow.latitude ? mappedRow.latitude.replace(/[^0-9.-]/g, "") || null : null,
                mappedRow.longitude ? mappedRow.longitude.replace(/[^0-9.-]/g, "") || null : null,
              ]
            );
            importResults.push({ rowIndex, status: "imported" });
            imported++;
          }

        } else if (dataType === "work-orders") {
          // Generate WO numbers: get current count once, then number sequentially
          const { rows: [{ count }] } = await client.query("SELECT COUNT(*) AS count FROM work_orders");
          const baseCount = parseInt(count) || 0;
          const currentYear = new Date().getFullYear();
          let woOffset = 0;

          for (const { rowIndex, mappedRow } of toInsert) {
            const woNumber = `WO-${currentYear}-${String(baseCount + woOffset + 1).padStart(3, "0")}`;
            woOffset++;
            const priority = validPriorities.has(mappedRow.priority ?? "") ? mappedRow.priority : "medium";
            const woStatus = validWoStatuses.has(mappedRow.status ?? "") ? mappedRow.status : "pending";
            const clientWoNum = mappedRow.clientWorkOrderNumber?.trim() || null;
            const requestedBy = parseInt(mappedRow._requestedBy || "1");
            await client.query(
              `INSERT INTO work_orders
                 (work_order_number, title, description, priority, status, category, location,
                  requested_by, client_name, client_phone, client_email, country, city, street, zip_code,
                  nte, estimated_hours, scheduled_date, start_date, end_date, equipment_type,
                  problem_description, special_instructions, client_work_order_number, is_locked)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25)`,
              [
                woNumber,
                mappedRow.title.trim(),
                mappedRow.description?.trim() || mappedRow.title.trim(),
                priority,
                woStatus,
                mappedRow.category?.trim() || "General",
                mappedRow.location?.trim() || "",
                requestedBy,
                mappedRow.clientName?.trim() || null,
                mappedRow.clientPhone?.trim() || null,
                mappedRow.clientEmail?.trim() || null,
                mappedRow.country?.trim() || null,
                mappedRow.city?.trim() || null,
                mappedRow.street?.trim() || null,
                mappedRow.zipCode?.trim() || null,
                mappedRow.nte ? mappedRow.nte.replace(/[^0-9.]/g, "") || null : null,
                mappedRow.estimatedHours?.trim() || null,
                mappedRow.scheduledDate?.trim() || null,
                mappedRow.startDate?.trim() || null,
                mappedRow.endDate?.trim() || null,
                mappedRow.equipmentType?.trim() || null,
                mappedRow.problemDescription?.trim() || null,
                mappedRow.specialInstructions?.trim() || null,
                clientWoNum,
                false,
              ]
            );
            importResults.push({ rowIndex, status: "imported" });
            imported++;
          }

        } else if (dataType === "payments") {
          for (const { rowIndex, mappedRow } of toInsert) {
            const woResult = await client.query(
              `SELECT id FROM work_orders WHERE LOWER(work_order_number) = LOWER($1) OR LOWER(client_work_order_number) = LOWER($1) LIMIT 1`,
              [mappedRow.workOrderNumber.trim()]
            );
            if (woResult.rows.length === 0) {
              const reason = `Work order "${mappedRow.workOrderNumber}" not found`;
              importResults.push({ rowIndex, status: "failed", reason });
              failed += toInsert.length - imported;
              await client.query("ROLLBACK");
              return res.status(400).json({ imported, skipped, failed, total: rows.length, results: importResults, error: `Row ${rowIndex + 1}: ${reason} — entire import rolled back.` });
            }
            const techResult = await client.query(
              `SELECT id FROM technicians WHERE LOWER(email) = LOWER($1) LIMIT 1`,
              [mappedRow.technicianEmail.trim()]
            );
            if (techResult.rows.length === 0) {
              const reason = `Technician email "${mappedRow.technicianEmail}" not found`;
              importResults.push({ rowIndex, status: "failed", reason });
              failed += toInsert.length - imported;
              await client.query("ROLLBACK");
              return res.status(400).json({ imported, skipped, failed, total: rows.length, results: importResults, error: `Row ${rowIndex + 1}: ${reason} — entire import rolled back.` });
            }
            await client.query(
              `INSERT INTO work_order_technician_payments
                 (work_order_id, technician_id, payment_method, amount_requested, amount_approved, amount_paid, status, description)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
              [
                woResult.rows[0].id,
                techResult.rows[0].id,
                mappedRow.paymentMethod.trim(),
                parseFloat(mappedRow.amountRequested.replace(/[^0-9.]/g, "")) || 0,
                parseFloat((mappedRow.amountApproved || "0").replace(/[^0-9.]/g, "")) || 0,
                parseFloat((mappedRow.amountPaid || "0").replace(/[^0-9.]/g, "")) || 0,
                mappedRow.status || "pending",
                mappedRow.description?.trim() || null,
              ]
            );
            importResults.push({ rowIndex, status: "imported" });
            imported++;
          }

        } else if (dataType === "invoices") {
          for (const { rowIndex, mappedRow } of toInsert) {
            const woResult = await client.query(
              `SELECT id FROM work_orders WHERE LOWER(work_order_number) = LOWER($1) OR LOWER(client_work_order_number) = LOWER($1) LIMIT 1`,
              [mappedRow.workOrderNumber.trim()]
            );
            if (woResult.rows.length === 0) {
              const reason = `Work order "${mappedRow.workOrderNumber}" not found`;
              importResults.push({ rowIndex, status: "failed", reason });
              failed += toInsert.length - imported;
              await client.query("ROLLBACK");
              return res.status(400).json({ imported, skipped, failed, total: rows.length, results: importResults, error: `Row ${rowIndex + 1}: ${reason} — entire import rolled back.` });
            }
            const laborCost    = parseFloat((mappedRow.laborCost    || "0").replace(/[^0-9.]/g, "")) || 0;
            const materialCost = parseFloat((mappedRow.materialCost || "0").replace(/[^0-9.]/g, "")) || 0;
            const addlCosts    = parseFloat((mappedRow.additionalCosts || "0").replace(/[^0-9.]/g, "")) || 0;
            const taxRate      = parseFloat((mappedRow.taxRate || "0.1").replace(/[^0-9.]/g, "")) || 0.1;
            const subtotal     = parseFloat(mappedRow._subtotal     || String(laborCost + materialCost + addlCosts));
            const taxAmount    = parseFloat(mappedRow._taxAmount    || String(subtotal * taxRate));
            const totalAmount  = parseFloat(mappedRow._totalAmount  || String(subtotal + taxAmount));
            await client.query(
              `INSERT INTO work_order_invoices
                 (work_order_id, invoice_number, labor_cost, material_cost, additional_costs,
                  subtotal, tax_rate, tax_amount, total_amount, status, notes, requested_by)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
              [
                woResult.rows[0].id,
                mappedRow.invoiceNumber.trim(),
                laborCost,
                materialCost,
                addlCosts,
                subtotal,
                taxRate,
                taxAmount,
                totalAmount,
                mappedRow.status || "draft",
                mappedRow.notes?.trim() || null,
                req.user.id,
              ]
            );
            importResults.push({ rowIndex, status: "imported" });
            imported++;
          }
        }

        await client.query("COMMIT");
      } catch (txErr: any) {
        await client.query("ROLLBACK");
        const remaining = toInsert.length - imported;
        failed += remaining;
        return res.status(400).json({
          imported,
          skipped,
          failed,
          total: rows.length,
          results: importResults,
          error: `Import failed and was fully rolled back: ${txErr.message}`,
        });
      } finally {
        client.release();
      }

      res.json({ imported, skipped, failed, total: rows.length, results: importResults });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ═══════════════════════════════════════════════════════
  // SQL DIRECT IMPORT — paste or upload raw SQL (admin only)
  // ═══════════════════════════════════════════════════════

  const sqlUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

  app.post("/api/import/sql",
    requireAuth,
    requireAdmin,
    sqlUpload.single("file"),
    async (req, res) => {
      try {
        let sqlText: string = "";

        if (req.file) {
          sqlText = req.file.buffer.toString("utf8");
        } else if (req.body?.sql) {
          sqlText = String(req.body.sql);
        }

        if (!sqlText.trim()) {
          return res.status(400).json({ message: "No SQL provided." });
        }

        // Safety gate: only INSERT is allowed — reject everything else
        const dangerPattern = /\b(DROP|TRUNCATE|DELETE|ALTER\s+TABLE|CREATE\s+TABLE|CREATE\s+INDEX|GRANT|REVOKE|VACUUM|REINDEX|UPDATE|COPY|MERGE|UPSERT)\b/i;
        if (dangerPattern.test(sqlText)) {
          return res.status(400).json({
            message: "Disallowed SQL detected. Only INSERT statements are permitted for append-only migration safety.",
          });
        }

        // Split into individual statements on semicolons (outside of string literals)
        const splitStatements = (sql: string): string[] => {
          const stmts: string[] = [];
          let current = "";
          let inSingleQuote = false;
          let inDollarQuote = false;
          let dollarTag = "";
          let i = 0;

          while (i < sql.length) {
            const ch = sql[i];

            if (!inSingleQuote && !inDollarQuote && ch === "'") {
              inSingleQuote = true;
              current += ch;
              i++;
            } else if (inSingleQuote && ch === "'" && sql[i + 1] === "'") {
              current += "''";
              i += 2;
            } else if (inSingleQuote && ch === "'") {
              inSingleQuote = false;
              current += ch;
              i++;
            } else if (!inSingleQuote && !inDollarQuote && ch === "$") {
              const tagMatch = sql.slice(i).match(/^\$([^$]*)\$/);
              if (tagMatch) {
                dollarTag = tagMatch[0];
                inDollarQuote = true;
                current += dollarTag;
                i += dollarTag.length;
              } else {
                current += ch;
                i++;
              }
            } else if (inDollarQuote && sql.slice(i).startsWith(dollarTag)) {
              current += dollarTag;
              i += dollarTag.length;
              inDollarQuote = false;
              dollarTag = "";
            } else if (!inSingleQuote && !inDollarQuote && ch === "-" && sql[i + 1] === "-") {
              while (i < sql.length && sql[i] !== "\n") i++;
            } else if (!inSingleQuote && !inDollarQuote && ch === "/" && sql[i + 1] === "*") {
              i += 2;
              while (i < sql.length && !(sql[i] === "*" && sql[i + 1] === "/")) i++;
              i += 2;
            } else if (!inSingleQuote && !inDollarQuote && ch === ";") {
              const stmt = current.trim();
              if (stmt) stmts.push(stmt);
              current = "";
              i++;
            } else {
              current += ch;
              i++;
            }
          }
          const last = current.trim();
          if (last) stmts.push(last);
          return stmts;
        };

        const statements = splitStatements(sqlText).filter(s => {
          const upper = s.toUpperCase().trimStart();
          return upper.startsWith("INSERT");
        });

        if (statements.length === 0) {
          return res.status(400).json({ message: "No INSERT statements found in the provided SQL. Only INSERT statements are accepted." });
        }

        // Execute all statements in a single transaction
        const client = await pool.connect();
        const statementResults: Array<{ statement: string; rowCount: number; error?: string }> = [];
        let totalRowCount = 0;
        let executedCount = 0;

        try {
          await client.query("BEGIN");

          for (const stmt of statements) {
            try {
              const result = await client.query(stmt);
              const rowCount = result.rowCount ?? 0;
              totalRowCount += rowCount;
              executedCount++;
              statementResults.push({
                statement: stmt.slice(0, 120) + (stmt.length > 120 ? "…" : ""),
                rowCount,
              });
            } catch (stmtErr: any) {
              await client.query("ROLLBACK");
              return res.status(400).json({
                message: `Statement ${executedCount + 1} failed — entire import rolled back: ${stmtErr.message}`,
                failedStatement: stmt.slice(0, 200),
              });
            }
          }

          await client.query("COMMIT");
        } finally {
          client.release();
        }

        res.json({
          success: true,
          statements: executedCount,
          totalRowCount,
          results: statementResults,
          message: `${executedCount} statement${executedCount !== 1 ? "s" : ""} executed successfully, ${totalRowCount} row${totalRowCount !== 1 ? "s" : ""} affected.`,
        });
      } catch (error: any) {
        res.status(500).json({ message: error.message });
      }
    }
  );

  // ═══════════════════════════════════════════════════════
  // DATABASE IMPORT — parse + execute
  // ═══════════════════════════════════════════════════════

  interface DbTableData {
    columns: string[];
    rows: Record<string, string>[];
    rowCount: number;
  }

  function stripIdent(s: string): string {
    return s.trim().replace(/^[`"[\s]+|[`"\]\s]+$/g, "");
  }

  function parseSqlTokenValues(raw: string): string[] {
    const vals: string[] = [];
    let i = 0;
    while (i < raw.length) {
      while (i < raw.length && /\s/.test(raw[i])) i++;
      if (i >= raw.length) break;
      if (raw[i] === "'" || raw[i] === '"') {
        const q = raw[i++];
        let v = "";
        while (i < raw.length) {
          if (raw[i] === "\\") { i++; v += raw[i] ?? ""; i++; }
          else if (raw[i] === q && raw[i + 1] === q) { v += q; i += 2; }
          else if (raw[i] === q) { i++; break; }
          else v += raw[i++];
        }
        vals.push(v);
      } else if (raw.slice(i, i + 4).toUpperCase() === "NULL") {
        vals.push(""); i += 4;
      } else {
        let v = "";
        while (i < raw.length && raw[i] !== ",") v += raw[i++];
        vals.push(v.trim());
        while (i < raw.length && /\s/.test(raw[i])) i++;
        if (i < raw.length && raw[i] === ",") i++;
        continue;
      }
      while (i < raw.length && /\s/.test(raw[i])) i++;
      if (i < raw.length && raw[i] === ",") i++;
    }
    return vals;
  }

  function parseSqlDumpContent(content: string): Map<string, DbTableData> {
    const tables = new Map<string, DbTableData>();

    // Strip comments
    let cleaned = "";
    let i = 0;
    while (i < content.length) {
      if (content[i] === "-" && content[i + 1] === "-") {
        while (i < content.length && content[i] !== "\n") i++;
      } else if (content[i] === "/" && content[i + 1] === "*") {
        i += 2;
        while (i < content.length && !(content[i] === "*" && content[i + 1] === "/")) i++;
        i += 2;
      } else {
        cleaned += content[i++];
      }
    }

    // PostgreSQL COPY FROM stdin format
    const copyRx = /COPY\s+(?:\w+\.)?(?:`|")?(\w+)(?:`|")?\s*\(([^)]+)\)\s*FROM\s+stdin[^;]*;([\s\S]*?)\\\./gi;
    let m: RegExpExecArray | null;
    while ((m = copyRx.exec(cleaned)) !== null) {
      const name = m[1].toLowerCase();
      const cols = m[2].split(",").map(stripIdent);
      const rows: Record<string, string>[] = [];
      for (const line of m[3].split("\n")) {
        const t = line.trim();
        if (!t) continue;
        const vals = t.split("\t").map(v =>
          v === "\\N" ? "" : v.replace(/\\n/g, "\n").replace(/\\t/g, "\t").replace(/\\\\/g, "\\")
        );
        const row: Record<string, string> = {};
        cols.forEach((c, idx) => { row[c] = vals[idx] ?? ""; });
        rows.push(row);
      }
      if (rows.length) {
        const ex = tables.get(name);
        if (ex) { ex.rows.push(...rows); ex.rowCount += rows.length; }
        else tables.set(name, { columns: cols, rows, rowCount: rows.length });
      }
    }

    // INSERT INTO format — char-by-char scanner
    i = 0;
    const IK = "INSERT INTO";
    while (i < cleaned.length - IK.length) {
      if (cleaned.slice(i, i + IK.length).toUpperCase() !== IK) { i++; continue; }
      i += IK.length;
      while (i < cleaned.length && /\s/.test(cleaned[i])) i++;

      let tname = "";
      if (cleaned[i] === "`" || cleaned[i] === '"') {
        const q = cleaned[i++];
        while (i < cleaned.length && cleaned[i] !== q) tname += cleaned[i++];
        if (i < cleaned.length) i++;
      } else {
        while (i < cleaned.length && !/[\s(,;]/.test(cleaned[i])) tname += cleaned[i++];
      }
      if (tname.includes(".")) tname = tname.split(".").pop() || tname;
      tname = tname.toLowerCase().replace(/[`"]/g, "");
      if (!tname) continue;

      while (i < cleaned.length && /\s/.test(cleaned[i])) i++;
      if (i >= cleaned.length || cleaned[i] !== "(") continue;
      i++;
      let colStr = "";
      while (i < cleaned.length && cleaned[i] !== ")") colStr += cleaned[i++];
      if (i < cleaned.length) i++;
      const columns = colStr.split(",").map(stripIdent);

      while (i < cleaned.length && /\s/.test(cleaned[i])) i++;
      if (cleaned.slice(i, i + 6).toUpperCase() !== "VALUES") continue;
      i += 6;
      while (i < cleaned.length && /\s/.test(cleaned[i])) i++;

      const tableRows: Record<string, string>[] = [];
      while (i < cleaned.length && cleaned[i] !== ";") {
        while (i < cleaned.length && /[\s,]/.test(cleaned[i]) && cleaned[i] !== ";") i++;
        if (i >= cleaned.length || cleaned[i] === ";") break;
        if (cleaned[i] !== "(") { i++; continue; }
        i++;
        let rowStr = "";
        let depth = 1, inStr = false, sc = "";
        while (i < cleaned.length && depth > 0) {
          const ch = cleaned[i];
          if (inStr) {
            if (ch === "\\") { rowStr += ch + (cleaned[i + 1] || ""); i += 2; continue; }
            if (ch === sc && cleaned[i + 1] === sc) { rowStr += ch + ch; i += 2; continue; }
            if (ch === sc) { inStr = false; rowStr += ch; i++; continue; }
            rowStr += ch; i++;
          } else {
            if (ch === "'" || ch === '"') { inStr = true; sc = ch; rowStr += ch; i++; }
            else if (ch === "(") { depth++; rowStr += ch; i++; }
            else if (ch === ")") { depth--; if (depth > 0) rowStr += ch; i++; }
            else { rowStr += ch; i++; }
          }
        }
        const vals = parseSqlTokenValues(rowStr);
        const row: Record<string, string> = {};
        columns.forEach((col, idx) => { row[col] = vals[idx] ?? ""; });
        tableRows.push(row);
      }
      if (tableRows.length) {
        const ex = tables.get(tname);
        if (ex) { ex.rows.push(...tableRows); ex.rowCount += tableRows.length; }
        else tables.set(tname, { columns, rows: tableRows, rowCount: tableRows.length });
      }
    }
    return tables;
  }

  function parseCsvLine(line: string): string[] {
    const vals: string[] = [];
    let i = 0;
    while (i <= line.length) {
      if (i >= line.length) { vals.push(""); break; }
      if (line[i] === '"') {
        i++;
        let v = "";
        while (i < line.length) {
          if (line[i] === '"' && line[i + 1] === '"') { v += '"'; i += 2; }
          else if (line[i] === '"') { i++; break; }
          else v += line[i++];
        }
        vals.push(v);
        while (i < line.length && line[i] !== ",") i++;
        if (i < line.length) i++;
      } else {
        let v = "";
        while (i < line.length && line[i] !== ",") v += line[i++];
        vals.push(v);
        if (i < line.length) i++;
      }
    }
    return vals;
  }

  function parseCsvContent(content: string): { columns: string[]; rows: Record<string, string>[] } {
    const lines = content.split(/\r?\n/).filter(l => l.trim());
    if (!lines.length) return { columns: [], rows: [] };
    const columns = parseCsvLine(lines[0]).map(c => c.trim());
    const rows: Record<string, string>[] = [];
    for (let idx = 1; idx < lines.length; idx++) {
      const vals = parseCsvLine(lines[idx]);
      const row: Record<string, string> = {};
      columns.forEach((c, ci) => { row[c] = vals[ci] ?? ""; });
      rows.push(row);
    }
    return { columns, rows };
  }

  function parseZipCsvs(buf: Buffer): Map<string, DbTableData> {
    const tables = new Map<string, DbTableData>();
    const zip = new AdmZip(buf);
    for (const entry of zip.getEntries()) {
      if (entry.isDirectory) continue;
      const ext = entry.entryName.split(".").pop()?.toLowerCase();
      if (ext !== "csv") continue;
      const base = path.basename(entry.entryName, "." + ext).toLowerCase().replace(/[\s\-]+/g, "_");
      const { columns, rows } = parseCsvContent(entry.getData().toString("utf8"));
      if (columns.length) tables.set(base, { columns, rows, rowCount: rows.length });
    }
    return tables;
  }

  function parseJsonDump(content: string): Map<string, DbTableData> {
    const tables = new Map<string, DbTableData>();
    try {
      const parsed = JSON.parse(content);
      const toRow = (obj: Record<string, unknown>): Record<string, string> =>
        Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, v == null ? "" : String(v)]));
      if (Array.isArray(parsed) && parsed.length && typeof parsed[0] === "object") {
        const rows = parsed.map(toRow);
        tables.set("data", { columns: Object.keys(rows[0] || {}), rows, rowCount: rows.length });
      } else if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        for (const [key, val] of Object.entries(parsed)) {
          if (Array.isArray(val) && val.length && typeof val[0] === "object") {
            const rows = (val as Record<string, unknown>[]).map(toRow);
            tables.set(key.toLowerCase(), { columns: Object.keys(rows[0] || {}), rows, rowCount: rows.length });
          }
        }
      }
    } catch {}
    return tables;
  }

  function guessNoviqField(col: string, target: "work_orders" | "technicians"): string | null {
    const c = col.toLowerCase().replace(/[\s_\-\.]/g, "");
    if (target === "work_orders") {
      if (/^(title|subject|jobname|ordertitle|workordertitle|jobtitle|servicetitle)$/.test(c)) return "title";
      if (/^(desc|description|notes|jobdesc|details|summary|jobdescription)$/.test(c)) return "description";
      if (/^(priority|prioritylevel|urgency)$/.test(c)) return "priority";
      if (/^(status|state|workstatus|jobstatus|orderstatus)$/.test(c)) return "status";
      if (/^(category|type|jobtype|worktype|servicetype|service)$/.test(c)) return "category";
      if (/^(location|address|site|jobsite|serviceaddress|sitelocation|siteaddress)$/.test(c)) return "location";
      if (/^(clientname|customername|client|customer|accountname|storename|companyname)$/.test(c)) return "clientName";
      if (/^(clientphone|customerphone|phone|telephone|phonenumber|contactphone)$/.test(c)) return "clientPhone";
      if (/^(clientemail|customeremail|email|emailaddress|contactemail)$/.test(c)) return "clientEmail";
      if (/^(country|countrycode|nation)$/.test(c)) return "country";
      if (/^(city|cityname|town|municipality)$/.test(c)) return "city";
      if (/^(street|streetaddress|address1|addressline1|streetname)$/.test(c)) return "street";
      if (/^(zip|zipcode|postalcode|postcode|postal)$/.test(c)) return "zipCode";
      if (/^(nte|nteamount|nottoexceed|maxcost|budgetlimit|budget)$/.test(c)) return "nte";
      if (/^(scheduledate|scheduleddate|duedate|targetdate|appointmentdate|scheddate)$/.test(c)) return "scheduledDate";
      if (/^(startdate|starttime|begindate|jobstart)$/.test(c)) return "startDate";
      if (/^(enddate|endtime|closedate|completiondate|jobend)$/.test(c)) return "endDate";
      if (/^(estimatedhours|esthours|estimatedtime|laborhours|manhours)$/.test(c)) return "estimatedHours";
      if (/^(equipmenttype|equipment|asset|assettype|machinetype|assetname)$/.test(c)) return "equipmentType";
      if (/^(problemdesc|problemdescription|problem|issue|faultdesc|symptom|fault)$/.test(c)) return "problemDescription";
      if (/^(specialinstructions|specialnotes|instructions|specialreq)$/.test(c)) return "specialInstructions";
      if (/^(clientworkordernumber|clientwon|externalwon|externalid|clientid|workordernumber|won|jobno|jobnumber|ordernumber|ponumber|po|ponum|workorder)$/.test(c)) return "clientWorkOrderNumber";
    } else {
      if (/^(firstname|fname|givenname|first)$/.test(c)) return "firstName";
      if (/^(lastname|lname|surname|familyname|last)$/.test(c)) return "lastName";
      if (/^(fullname|name|technicianname|workername|displayname)$/.test(c)) return "fullName";
      if (/^(email|emailaddress|mail)$/.test(c)) return "email";
      if (/^(phone|phonenumber|telephone|mobile|cell|cellphone|contact)$/.test(c)) return "phone";
      if (/^(specialization|specialty|skill|trade|expertise|department|discipline)$/.test(c)) return "specialization";
      if (/^(experience|yearsofexperience|years|expyears|yrs)$/.test(c)) return "experience";
      if (/^(hourlyrate|rate|payrate|hourly|rateperhr|wagerate)$/.test(c)) return "hourlyRate";
      if (/^(availability|available|availstatus)$/.test(c)) return "availability";
      if (/^(location|city|area|region|territory|zone)$/.test(c)) return "location";
      if (/^(paymentmethods|paymethod|paymentmethod)$/.test(c)) return "paymentMethods";
    }
    return null;
  }

  const dbUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

  app.post("/api/db-import/parse", requireAuth, requireAnyPermission(["technicians.create", "workorders.create"]),
    dbUpload.single("file"), async (req, res) => {
      try {
        if (!req.file) return res.status(400).json({ message: "No file uploaded" });
        const name = req.file.originalname.toLowerCase();
        const buf = req.file.buffer;
        let tables: Map<string, DbTableData>;

        if (name.endsWith(".sql")) tables = parseSqlDumpContent(buf.toString("utf8"));
        else if (name.endsWith(".zip")) tables = parseZipCsvs(buf);
        else if (name.endsWith(".json")) tables = parseJsonDump(buf.toString("utf8"));
        else return res.status(400).json({ message: "Unsupported format. Please upload a .sql dump, .zip of CSV files, or .json export." });

        if (!tables.size) return res.status(400).json({ message: "No data tables found in the uploaded file." });

        const MAX_ROWS = 10000;
        const result: Record<string, {
          columns: string[];
          rowCount: number;
          sampleRows: Record<string, string>[];
          allRows: Record<string, string>[];
          truncated: boolean;
        }> = {};

        for (const [tname, data] of tables.entries()) {
          result[tname] = {
            columns: data.columns,
            rowCount: data.rowCount,
            sampleRows: data.rows.slice(0, 5),
            allRows: data.rows.slice(0, MAX_ROWS),
            truncated: data.rowCount > MAX_ROWS,
          };
        }
        res.json({ tables: result, fileName: req.file.originalname });
      } catch (err: any) {
        res.status(500).json({ message: `Parse error: ${err.message}` });
      }
    }
  );

  app.post("/api/db-import/execute", requireAuth, requireAnyPermission(["technicians.create", "workorders.create"]), async (req, res) => {
    try {
      const { tables } = req.body as {
        tables: Array<{
          sourceName: string;
          targetEntity: "work_orders" | "technicians";
          columnMapping: Record<string, string>;
          rows: Record<string, string>[];
        }>;
      };

      if (!tables?.length) return res.status(400).json({ message: "No tables provided" });

      const requestedBy = req.user.id;

      const existingEmails = new Set(
        (await storage.getAllTechnicians()).map(t => t.email.toLowerCase())
      );
      const existingWoNums = new Set(
        (await storage.getAllWorkOrders())
          .filter(w => w.clientWorkOrderNumber)
          .map(w => w.clientWorkOrderNumber!.toLowerCase())
      );

      const summary: Array<{ table: string; imported: number; skipped: number; failed: number; errors: string[] }> = [];

      for (const tableConfig of tables) {
        const { sourceName, targetEntity, columnMapping, rows } = tableConfig;
        let imported = 0, skipped = 0, failed = 0;
        const errors: string[] = [];

        for (const rawRow of rows) {
          const mapped: Record<string, string> = {};
          for (const [srcCol, noviqField] of Object.entries(columnMapping)) {
            if (noviqField && rawRow[srcCol] !== undefined) mapped[noviqField] = rawRow[srcCol];
          }

          // Split fullName if needed
          if (mapped.fullName && (!mapped.firstName || !mapped.lastName)) {
            const parts = mapped.fullName.trim().split(/\s+/);
            mapped.firstName = parts[0] || "";
            mapped.lastName = parts.slice(1).join(" ") || parts[0] || "";
            delete mapped.fullName;
          }

          try {
            if (targetEntity === "technicians") {
              if (!mapped.firstName?.trim() || !mapped.email?.trim()) { skipped++; continue; }
              const email = mapped.email.trim().toLowerCase();
              if (existingEmails.has(email)) { skipped++; continue; }
              await storage.createTechnician({
                firstName: mapped.firstName.trim(),
                lastName: mapped.lastName?.trim() || "",
                email,
                phone: mapped.phone?.trim() || "",
                specialization: mapped.specialization?.trim() || "General",
                experience: parseInt(mapped.experience || "0") || 0,
                hourlyRate: mapped.hourlyRate?.replace(/[^0-9.]/g, "") || "0",
                availability: ["available", "busy", "offline"].includes((mapped.availability || "").toLowerCase()) ? mapped.availability.toLowerCase() : "available",
                location: mapped.location?.trim() || "",
                paymentMethods: mapped.paymentMethods?.trim() || "check",
                bankAccount: mapped.bankAccount?.trim() || null,
                routingNumber: mapped.routingNumber?.trim() || null,
                bankName: mapped.bankName?.trim() || null,
                paypalEmail: mapped.paypalEmail?.trim() || null,
                venmoHandle: mapped.venmoHandle?.trim() || null,
                cashappHandle: mapped.cashappHandle?.trim() || null,
                zelleInfo: mapped.zelleInfo?.trim() || null,
                mailingAddress: mapped.mailingAddress?.trim() || null,
              });
              existingEmails.add(email);
              imported++;
            } else {
              if (!mapped.title?.trim()) { skipped++; continue; }
              const clientWoNum = mapped.clientWorkOrderNumber?.trim() || null;
              if (clientWoNum && existingWoNums.has(clientWoNum.toLowerCase())) { skipped++; continue; }
              await storage.createWorkOrder({
                title: mapped.title.trim(),
                description: mapped.description?.trim() || mapped.title.trim(),
                priority: ["low", "medium", "high", "urgent"].includes((mapped.priority || "").toLowerCase()) ? mapped.priority.toLowerCase() : "medium",
                status: ["pending", "in_progress", "completed", "cancelled", "on_hold"].includes((mapped.status || "").toLowerCase()) ? mapped.status.toLowerCase() : "pending",
                category: mapped.category?.trim() || "General",
                location: mapped.location?.trim() || "",
                requestedBy,
                assignedTo: null,
                technicianId: null,
                clientName: mapped.clientName?.trim() || null,
                clientPhone: mapped.clientPhone?.trim() || null,
                clientEmail: mapped.clientEmail?.trim() || null,
                country: mapped.country?.trim() || null,
                city: mapped.city?.trim() || null,
                street: mapped.street?.trim() || null,
                zipCode: mapped.zipCode?.trim() || null,
                nte: mapped.nte?.replace(/[^0-9.]/g, "") || null,
                tnte: null,
                estimatedHours: mapped.estimatedHours?.trim() || null,
                actualHours: null,
                scheduledDate: mapped.scheduledDate?.trim() || null,
                startDate: mapped.startDate?.trim() || null,
                endDate: mapped.endDate?.trim() || null,
                completedDate: null,
                urgency: null,
                equipmentType: mapped.equipmentType?.trim() || null,
                problemDescription: mapped.problemDescription?.trim() || null,
                specialInstructions: mapped.specialInstructions?.trim() || null,
                accessInstructions: null,
                safetyRequirements: null,
                assignedUserIds: null,
                clientWorkOrderNumber: clientWoNum,
                isLocked: false,
              });
              if (clientWoNum) existingWoNums.add(clientWoNum.toLowerCase());
              imported++;
            }
          } catch (err: any) {
            failed++;
            if (errors.length < 5) errors.push(err.message);
          }
        }
        summary.push({ table: sourceName, imported, skipped, failed, errors });
      }

      const totalImported = summary.reduce((s, t) => s + t.imported, 0);
      const totalSkipped = summary.reduce((s, t) => s + t.skipped, 0);
      const totalFailed = summary.reduce((s, t) => s + t.failed, 0);

      res.json({ totalImported, totalSkipped, totalFailed, tables: summary });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // ═══════════════════════════════════════════════════════
  // FULL SYSTEM BACKUP (VPS-ready pg_dump style)
  // ═══════════════════════════════════════════════════════

  function pgColType(col: { data_type: string; udt_name: string; character_maximum_length: string | null; numeric_precision: string | null; numeric_scale: string | null }): string {
    switch (col.data_type) {
      case "character varying": return col.character_maximum_length ? `varchar(${col.character_maximum_length})` : "varchar";
      case "character": return col.character_maximum_length ? `char(${col.character_maximum_length})` : "char";
      case "numeric": return (col.numeric_precision && col.numeric_scale != null) ? `numeric(${col.numeric_precision},${col.numeric_scale})` : "numeric";
      case "integer": return "integer";
      case "bigint": return "bigint";
      case "smallint": return "smallint";
      case "text": return "text";
      case "boolean": return "boolean";
      case "timestamp without time zone": return "timestamp";
      case "timestamp with time zone": return "timestamptz";
      case "date": return "date";
      case "real": return "real";
      case "double precision": return "double precision";
      case "json": return "json";
      case "jsonb": return "jsonb";
      case "uuid": return "uuid";
      case "ARRAY": return col.udt_name.replace(/^_/, "") + "[]";
      default: return col.data_type || col.udt_name;
    }
  }

  app.post("/api/db-export/full-backup", requireAuth, async (_req, res) => {
    try {
      const lines: string[] = [];
      const stamp = new Date().toISOString();

      lines.push(`-- ╔══════════════════════════════════════════════════════════════════╗`);
      lines.push(`-- ║  NOVIQ Full System Backup                                        ║`);
      lines.push(`-- ║  Generated: ${stamp.replace("T", " ").slice(0, 19)} UTC${" ".repeat(32)}║`);
      lines.push(`-- ║  Compatible with PostgreSQL 14+                                  ║`);
      lines.push(`-- ╚══════════════════════════════════════════════════════════════════╝`);
      lines.push(``, `SET statement_timeout = 0;`, `SET lock_timeout = 0;`,
        `SET client_encoding = 'UTF8';`, `SET standard_conforming_strings = on;`,
        `SET check_function_bodies = false;`, `SET row_security = off;`, ``);

      // ── 1. Get all public tables in dependency order ──────────────────────
      const tablesRes = await pool.query<{ table_name: string }>(
        `SELECT table_name FROM information_schema.tables
         WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
         ORDER BY table_name`
      );
      const tableNames = tablesRes.rows.map(r => r.table_name);

      // ── 2. Sequences ──────────────────────────────────────────────────────
      const seqRes = await pool.query<{ sequence_name: string; start_value: string; increment: string; minimum_value: string; maximum_value: string }>(
        `SELECT sequence_name, start_value, increment, minimum_value, maximum_value
         FROM information_schema.sequences WHERE sequence_schema = 'public'`
      );
      if (seqRes.rows.length) {
        lines.push(`-- ──────────────────────────────────────────────────────────────────`);
        lines.push(`-- SEQUENCES`);
        lines.push(`-- ──────────────────────────────────────────────────────────────────`);
        for (const s of seqRes.rows) {
          lines.push(
            `CREATE SEQUENCE IF NOT EXISTS "${s.sequence_name}"`,
            `    START WITH ${s.start_value} INCREMENT BY ${s.increment}`,
            `    NO MINVALUE NO MAXVALUE CACHE 1;`, ``
          );
        }
      }

      // ── 3. CREATE TABLE for every table ───────────────────────────────────
      lines.push(`-- ──────────────────────────────────────────────────────────────────`);
      lines.push(`-- TABLE SCHEMAS`);
      lines.push(`-- ──────────────────────────────────────────────────────────────────`);

      // Store PK columns per table so we can use them for ordered data export
      const tablePkMap = new Map<string, string[]>();

      for (const tname of tableNames) {
        // Columns
        const colsRes = await pool.query<{
          column_name: string; data_type: string; udt_name: string;
          character_maximum_length: string | null; numeric_precision: string | null; numeric_scale: string | null;
          is_nullable: string; column_default: string | null;
        }>(
          `SELECT column_name, data_type, udt_name, character_maximum_length,
                  numeric_precision, numeric_scale, is_nullable, column_default
           FROM information_schema.columns
           WHERE table_schema = 'public' AND table_name = $1
           ORDER BY ordinal_position`, [tname]
        );

        // Primary key columns
        const pkRes = await pool.query<{ column_name: string }>(
          `SELECT kcu.column_name FROM information_schema.table_constraints tc
           JOIN information_schema.key_column_usage kcu
             ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
           WHERE tc.table_schema = 'public' AND tc.table_name = $1
             AND tc.constraint_type = 'PRIMARY KEY'
           ORDER BY kcu.ordinal_position`, [tname]
        );
        const pkCols = pkRes.rows.map(r => r.column_name);
        tablePkMap.set(tname, pkCols);

        // Unique constraints
        const uqRes = await pool.query<{ constraint_name: string; column_name: string }>(
          `SELECT tc.constraint_name, kcu.column_name
           FROM information_schema.table_constraints tc
           JOIN information_schema.key_column_usage kcu
             ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
           WHERE tc.table_schema = 'public' AND tc.table_name = $1 AND tc.constraint_type = 'UNIQUE'
           ORDER BY tc.constraint_name, kcu.ordinal_position`, [tname]
        );
        const uqMap: Record<string, string[]> = {};
        for (const r of uqRes.rows) {
          (uqMap[r.constraint_name] = uqMap[r.constraint_name] || []).push(r.column_name);
        }

        const colDefs: string[] = colsRes.rows.map(col => {
          const type = pgColType(col);
          const notNull = col.is_nullable === "NO" ? " NOT NULL" : "";
          let def = "";
          if (col.column_default) {
            // Simplify serial sequences
            const seqMatch = col.column_default.match(/nextval\('([^']+)'.*\)/);
            def = seqMatch ? ` DEFAULT nextval('${seqMatch[1]}')` : ` DEFAULT ${col.column_default}`;
          }
          return `  "${col.column_name}" ${type}${notNull}${def}`;
        });

        if (pkCols.length) colDefs.push(`  PRIMARY KEY (${pkCols.map(c => `"${c}"`).join(", ")})`);
        for (const [name, cols] of Object.entries(uqMap)) {
          colDefs.push(`  CONSTRAINT "${name}" UNIQUE (${cols.map(c => `"${c}"`).join(", ")})`);
        }

        lines.push(`CREATE TABLE IF NOT EXISTS "${tname}" (`);
        lines.push(colDefs.join(",\n"));
        lines.push(`);`, ``);
      }

      // ── 4. Data ───────────────────────────────────────────────────────────
      lines.push(`-- ──────────────────────────────────────────────────────────────────`);
      lines.push(`-- DATA`);
      lines.push(`-- ──────────────────────────────────────────────────────────────────`);

      // Disable triggers during data load
      lines.push(`SET session_replication_role = 'replica';`, ``);

      // Determine safe insert order (tables without FKs first, then dependents)
      const fkDepRes = await pool.query<{ table_name: string; foreign_table_name: string }>(
        `SELECT DISTINCT tc.table_name, ccu.table_name AS foreign_table_name
         FROM information_schema.table_constraints tc
         JOIN information_schema.constraint_column_usage ccu
           ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema
         WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = 'public'`
      );
      // Build topological order (simple): tables referenced by others come first
      const deps = new Map<string, Set<string>>();
      for (const t of tableNames) deps.set(t, new Set());
      for (const { table_name, foreign_table_name } of fkDepRes.rows) {
        if (table_name !== foreign_table_name) deps.get(table_name)?.add(foreign_table_name);
      }
      const ordered: string[] = [];
      const visited = new Set<string>();
      function visit(t: string) {
        if (visited.has(t)) return;
        visited.add(t);
        for (const dep of deps.get(t) || []) visit(dep);
        ordered.push(t);
      }
      for (const t of tableNames) visit(t);

      for (const tname of ordered) {
        const tPkCols = tablePkMap.get(tname) ?? [];
        const orderBy = tPkCols.length ? `ORDER BY ${tPkCols.map(c => `"${c}"`).join(", ")}` : "";
        const dataRes = await pool.query(`SELECT * FROM "${tname}" ${orderBy}`);
        if (!dataRes.rows.length) { lines.push(`-- (${tname}: no rows)`, ``); continue; }
        const cols = dataRes.fields.map(f => f.name);
        const colList = cols.map(c => `"${c}"`).join(", ");
        lines.push(`-- ${tname}: ${dataRes.rows.length.toLocaleString()} rows`);
        for (let i = 0; i < dataRes.rows.length; i += 500) {
          const batch = dataRes.rows.slice(i, i + 500);
          const vals = batch.map((r: Record<string, unknown>) =>
            `(${cols.map(c => {
              const v = r[c];
              if (v === null || v === undefined) return "NULL";
              if (typeof v === "boolean") return v ? "TRUE" : "FALSE";
              if (typeof v === "number") return String(v);
              if (v instanceof Date) return `'${v.toISOString()}'`;
              return `'${String(v).replace(/\\/g, "\\\\").replace(/'/g, "''")}'`;
            }).join(", ")})`
          ).join(",\n  ");
          lines.push(`INSERT INTO "${tname}" (${colList}) VALUES`, `  ${vals}`, `ON CONFLICT DO NOTHING;`, ``);
        }
      }

      lines.push(`SET session_replication_role = 'DEFAULT';`, ``);

      // ── 5. Sequence resets ────────────────────────────────────────────────
      lines.push(`-- ──────────────────────────────────────────────────────────────────`);
      lines.push(`-- SEQUENCE RESETS (so next INSERT gets correct auto-increment)`);
      lines.push(`-- ──────────────────────────────────────────────────────────────────`);
      for (const s of seqRes.rows) {
        // Sequence name pattern: <table>_<col>_seq
        const match = s.sequence_name.match(/^(.+)_([^_]+)_seq$/);
        if (match) {
          const tbl = match[1], col = match[2];
          if (tableNames.includes(tbl)) {
            lines.push(`SELECT setval('${s.sequence_name}', COALESCE((SELECT MAX("${col}") FROM "${tbl}"), 1));`);
          }
        }
      }
      lines.push(``);

      // ── 6. Foreign key constraints ────────────────────────────────────────
      lines.push(`-- ──────────────────────────────────────────────────────────────────`);
      lines.push(`-- FOREIGN KEY CONSTRAINTS`);
      lines.push(`-- ──────────────────────────────────────────────────────────────────`);
      const fkFullRes = await pool.query<{
        constraint_name: string; table_name: string; column_name: string;
        foreign_table: string; foreign_column: string; delete_rule: string; update_rule: string;
      }>(
        `SELECT tc.constraint_name, tc.table_name, kcu.column_name,
                ccu.table_name AS foreign_table, ccu.column_name AS foreign_column,
                rc.delete_rule, rc.update_rule
         FROM information_schema.table_constraints tc
         JOIN information_schema.key_column_usage kcu
           ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
         JOIN information_schema.constraint_column_usage ccu
           ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema
         JOIN information_schema.referential_constraints rc
           ON rc.constraint_name = tc.constraint_name AND rc.constraint_schema = tc.table_schema
         WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = 'public'
         ORDER BY tc.table_name, tc.constraint_name`
      );
      for (const fk of fkFullRes.rows) {
        const onDel = fk.delete_rule !== "NO ACTION" ? ` ON DELETE ${fk.delete_rule}` : "";
        const onUpd = fk.update_rule !== "NO ACTION" ? ` ON UPDATE ${fk.update_rule}` : "";
        lines.push(
          `ALTER TABLE "${fk.table_name}" ADD CONSTRAINT IF NOT EXISTS "${fk.constraint_name}"`,
          `  FOREIGN KEY ("${fk.column_name}") REFERENCES "${fk.foreign_table}" ("${fk.foreign_column}")${onDel}${onUpd};`
        );
      }
      lines.push(``);

      // ── 7. Indexes ────────────────────────────────────────────────────────
      lines.push(`-- ──────────────────────────────────────────────────────────────────`);
      lines.push(`-- INDEXES`);
      lines.push(`-- ──────────────────────────────────────────────────────────────────`);
      const idxRes = await pool.query<{ tablename: string; indexname: string; indexdef: string }>(
        `SELECT tablename, indexname, indexdef FROM pg_indexes
         WHERE schemaname = 'public'
           AND indexname NOT IN (
             SELECT constraint_name FROM information_schema.table_constraints
             WHERE table_schema = 'public'
           )
         ORDER BY tablename, indexname`
      );
      for (const idx of idxRes.rows) {
        const def = idx.indexdef.replace(/^CREATE INDEX/, "CREATE INDEX IF NOT EXISTS")
          .replace(/^CREATE UNIQUE INDEX/, "CREATE UNIQUE INDEX IF NOT EXISTS");
        lines.push(`${def};`);
      }
      lines.push(``);

      lines.push(`-- ── End of NOVIQ Full System Backup ──`);

      const stamp2 = new Date().toISOString().slice(0, 10);
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="noviq-full-backup-${stamp2}.sql"`);
      res.send(lines.join("\n"));

    } catch (err: any) {
      console.error("[full-backup] ERROR:", err.message);
      res.status(500).json({ message: err.message });
    }
  });

  // ═══════════════════════════════════════════════════════
  // DATABASE EXPORT ENDPOINTS
  // ═══════════════════════════════════════════════════════

  const EXPORT_TABLES = [
    { name: "technicians",                   label: "Technicians",           group: "core",   sensitive: [] as string[] },
    { name: "work_orders",                   label: "Work Orders",           group: "core",   sensitive: [] as string[] },
    { name: "work_order_proposals",          label: "Proposals",             group: "core",   sensitive: [] as string[] },
    { name: "work_order_parts_requests",     label: "Parts Requests",        group: "core",   sensitive: [] as string[] },
    { name: "work_order_invoices",           label: "Invoices",              group: "core",   sensitive: [] as string[] },
    { name: "work_order_technician_payments",label: "Technician Payments",   group: "core",   sensitive: [] as string[] },
    { name: "technician_ratings",            label: "Technician Ratings",    group: "core",   sensitive: [] as string[] },
    { name: "users",                         label: "Users",                 group: "system", sensitive: ["password"] },
    { name: "roles",                         label: "Roles",                 group: "system", sensitive: [] as string[] },
    { name: "permissions",                   label: "Permissions",           group: "system", sensitive: [] as string[] },
    { name: "user_roles",                    label: "User–Role Assignments", group: "system", sensitive: [] as string[] },
    { name: "role_permissions",              label: "Role Permissions",      group: "system", sensitive: [] as string[] },
    { name: "notifications",                 label: "Notifications",         group: "system", sensitive: [] as string[] },
  ];

  function sqlEscapeValue(val: unknown): string {
    if (val === null || val === undefined) return "NULL";
    if (typeof val === "boolean") return val ? "TRUE" : "FALSE";
    if (typeof val === "number") return String(val);
    if (val instanceof Date) return `'${val.toISOString()}'`;
    return `'${String(val).replace(/\\/g, "\\\\").replace(/'/g, "''")}'`;
  }

  function csvEscapeValue(val: unknown): string {
    if (val === null || val === undefined) return "";
    const s = String(val);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }

  // GET /api/db-export/stats — row counts for every exportable table
  app.get("/api/db-export/stats", requireAuth, requireAnyPermission(["technicians.create", "workorders.create"]), async (_req, res) => {
    try {
      const counts = await Promise.all(
        EXPORT_TABLES.map(async t => {
          try {
            const r = await pool.query(`SELECT COUNT(*) AS count FROM ${t.name}`);
            return { name: t.name, label: t.label, group: t.group, rowCount: parseInt(r.rows[0].count), hasSensitive: t.sensitive.length > 0 };
          } catch {
            return { name: t.name, label: t.label, group: t.group, rowCount: 0, hasSensitive: t.sensitive.length > 0 };
          }
        })
      );
      res.json({ tables: counts });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // POST /api/db-export/download — stream the export file
  app.post("/api/db-export/download", requireAuth, requireAnyPermission(["technicians.create", "workorders.create"]), async (req, res) => {
    try {
      const { format, tables: requested } = req.body as { format: "sql" | "csv" | "json"; tables: string[] };
      if (!["sql", "csv", "json"].includes(format)) return res.status(400).json({ message: "Invalid format" });

      const validNames = new Set(EXPORT_TABLES.map(t => t.name));
      const toExport = (requested || []).filter(n => validNames.has(n));
      if (!toExport.length) return res.status(400).json({ message: "No valid tables selected" });

      const stamp = new Date().toISOString().slice(0, 10);

      // Fetch rows for each table
      type TablePayload = { meta: typeof EXPORT_TABLES[0]; columns: string[]; rows: Record<string, unknown>[] };
      const payloads: TablePayload[] = [];
      for (const tname of toExport) {
        const meta = EXPORT_TABLES.find(t => t.name === tname)!;
        const result = await pool.query(`SELECT * FROM ${tname}`);
        let columns = result.fields.map(f => f.name);
        let rows = result.rows as Record<string, unknown>[];
        if (meta.sensitive.length) {
          const sens = new Set(meta.sensitive);
          columns = columns.filter(c => !sens.has(c));
          rows = rows.map(r => Object.fromEntries(Object.entries(r).filter(([k]) => !sens.has(k))));
        }
        payloads.push({ meta, columns, rows });
      }

      // ── JSON ──────────────────────────────────────────────
      if (format === "json") {
        const out: Record<string, unknown[]> = {};
        for (const { meta, rows } of payloads) out[meta.name] = rows;
        res.setHeader("Content-Type", "application/json");
        res.setHeader("Content-Disposition", `attachment; filename="noviq-export-${stamp}.json"`);
        return res.json(out);
      }

      // ── SQL ───────────────────────────────────────────────
      if (format === "sql") {
        const lines: string[] = [
          `-- NOVIQ Database Export`,
          `-- Generated: ${new Date().toISOString()}`,
          `-- Tables: ${toExport.join(", ")}`,
          "",
        ];
        for (const { meta, columns, rows } of payloads) {
          lines.push(`-- ── ${meta.label} (${rows.length.toLocaleString()} rows) ──`);
          if (!rows.length) { lines.push(""); continue; }
          const colList = columns.map(c => `"${c}"`).join(", ");
          for (let i = 0; i < rows.length; i += 500) {
            const batch = rows.slice(i, i + 500);
            const vals = batch.map(r => `(${columns.map(c => sqlEscapeValue(r[c])).join(", ")})`).join(",\n  ");
            lines.push(`INSERT INTO ${meta.name} (${colList}) VALUES`);
            lines.push(`  ${vals};`);
          }
          lines.push("");
        }
        res.setHeader("Content-Type", "text/plain");
        res.setHeader("Content-Disposition", `attachment; filename="noviq-export-${stamp}.sql"`);
        return res.send(lines.join("\n"));
      }

      // ── CSV ZIP ───────────────────────────────────────────
      const zip = new AdmZip();
      for (const { meta, columns, rows } of payloads) {
        const csvLines = [
          columns.join(","),
          ...rows.map(r => columns.map(c => csvEscapeValue(r[c])).join(",")),
        ];
        zip.addFile(`${meta.name}.csv`, Buffer.from(csvLines.join("\n"), "utf8"));
      }
      const manifest = [
        `NOVIQ Database Export`,
        `Generated: ${new Date().toISOString()}`,
        ``,
        ...payloads.map(({ meta, rows }) => `${meta.name.padEnd(36)} ${rows.length.toLocaleString()} rows`),
      ].join("\n");
      zip.addFile("_manifest.txt", Buffer.from(manifest, "utf8"));

      res.setHeader("Content-Type", "application/zip");
      res.setHeader("Content-Disposition", `attachment; filename="noviq-export-${stamp}.zip"`);
      return res.send(zip.toBuffer());

    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // ─── Client Management ──────────────────────────────────────────────
  app.get("/api/clients", requireAuth, async (_req, res) => {
    try {
      const all = await storage.getAllClients();
      res.json(all);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/clients/:id", requireAuth, async (req, res) => {
    try {
      const client = await storage.getClient(parseInt(req.params.id));
      if (!client) return res.status(404).json({ message: "Client not found" });
      res.json(client);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/clients", requireAuth, async (req, res) => {
    try {
      const parsed = insertClientSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: fromZodError(parsed.error).message });
      const client = await storage.createClient(parsed.data);
      res.status(201).json(client);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.put("/api/clients/:id", requireAuth, async (req, res) => {
    try {
      const updated = await storage.updateClient(parseInt(req.params.id), req.body);
      if (!updated) return res.status(404).json({ message: "Client not found" });
      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.delete("/api/clients/:id", requireAuth, async (req, res) => {
    try {
      const ok = await storage.deleteClient(parseInt(req.params.id));
      if (!ok) return res.status(404).json({ message: "Client not found" });
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/clients/:id/work-orders", requireAuth, async (req, res) => {
    try {
      const wos = await storage.getClientWorkOrders(parseInt(req.params.id));
      res.json(wos);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/clients/:id/stats", requireAuth, async (req, res) => {
    try {
      const stats = await storage.getClientStats(parseInt(req.params.id));
      res.json(stats);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
