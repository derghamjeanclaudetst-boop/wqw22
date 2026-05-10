import { pgTable, text, integer, serial, timestamp, varchar, boolean, decimal } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { relations } from "drizzle-orm";
import { z } from "zod";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: varchar("username", { length: 255 }).notNull().unique(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  password: varchar("password", { length: 255 }).notNull(),
  firstName: varchar("first_name", { length: 255 }),
  lastName: varchar("last_name", { length: 255 }),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const roles = pgTable("roles", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull().unique(),
  description: text("description"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const permissions = pgTable("permissions", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull().unique(),
  description: text("description"),
  category: varchar("category", { length: 255 }).notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const userRoles = pgTable("user_roles", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  roleId: integer("role_id").notNull().references(() => roles.id, { onDelete: "cascade" }),
  assignedAt: timestamp("assigned_at").notNull().defaultNow(),
});

export const rolePermissions = pgTable("role_permissions", {
  id: serial("id").primaryKey(),
  roleId: integer("role_id").notNull().references(() => roles.id, { onDelete: "cascade" }),
  permissionId: integer("permission_id").notNull().references(() => permissions.id, { onDelete: "cascade" }),
  assignedAt: timestamp("assigned_at").notNull().defaultNow(),
});

export const technicians = pgTable("technicians", {
  id: serial("id").primaryKey(),
  firstName: varchar("first_name", { length: 255 }).notNull(),
  lastName: varchar("last_name", { length: 255 }).notNull(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  phone: varchar("phone", { length: 50 }).notNull(),
  specialization: varchar("specialization", { length: 255 }).notNull(),
  experience: integer("experience").notNull(),
  hourlyRate: decimal("hourly_rate", { precision: 10, scale: 2 }).notNull(),
  availability: varchar("availability", { length: 50 }).notNull().default("available"),
  location: varchar("location", { length: 255 }).notNull(),
  latitude: decimal("latitude", { precision: 10, scale: 7 }),
  longitude: decimal("longitude", { precision: 10, scale: 7 }),
  paymentMethods: text("payment_methods").notNull(),
  // Payment Details
  bankAccount: varchar("bank_account", { length: 255 }),
  routingNumber: varchar("routing_number", { length: 255 }),
  bankName: varchar("bank_name", { length: 255 }),
  paypalEmail: varchar("paypal_email", { length: 255 }),
  venmoHandle: varchar("venmo_handle", { length: 255 }),
  cashappHandle: varchar("cashapp_handle", { length: 255 }),
  zelleInfo: text("zelle_info"),
  mailingAddress: text("mailing_address"),
  // W9 Document
  w9Status: varchar("w9_status", { length: 50 }),
  w9FilePath: varchar("w9_file_path", { length: 500 }),
  w9FileName: varchar("w9_file_name", { length: 255 }),
  w9SubmittedAt: timestamp("w9_submitted_at"),
  averageRating: decimal("average_rating", { precision: 3, scale: 2 }).default("0"),
  totalRatings: integer("total_ratings").default(0),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const technicianRatings = pgTable("technician_ratings", {
  id: serial("id").primaryKey(),
  technicianId: integer("technician_id").notNull().references(() => technicians.id, { onDelete: "cascade" }),
  workOrderId: integer("work_order_id").references(() => workOrders.id, { onDelete: "set null" }),
  rating: integer("rating").notNull(),
  comment: text("comment"),
  ratedBy: varchar("rated_by", { length: 255 }).notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const clients = pgTable("clients", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  phone: varchar("phone", { length: 50 }),
  email: varchar("email", { length: 255 }),
  city: varchar("city", { length: 100 }),
  state: varchar("state", { length: 100 }),
  street: text("street"),
  zipCode: varchar("zip_code", { length: 20 }),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const workOrders = pgTable("work_orders", {
  id: serial("id").primaryKey(),
  workOrderNumber: varchar("work_order_number", { length: 255 }).notNull().unique(),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description").notNull(),
  priority: varchar("priority", { length: 50 }).notNull().default("medium"),
  status: varchar("status", { length: 50 }).notNull().default("pending"),
  category: varchar("category", { length: 255 }).notNull(),
  location: varchar("location", { length: 255 }).notNull(),
  requestedBy: integer("requested_by").notNull().references(() => users.id),
  assignedTo: integer("assigned_to").references(() => users.id),
  technicianId: integer("technician_id").references(() => technicians.id),
  clientId: integer("client_id").references(() => clients.id),
  // Client Information
  clientName: varchar("client_name", { length: 255 }),
  clientPhone: varchar("client_phone", { length: 50 }),
  clientEmail: varchar("client_email", { length: 255 }),
  country: varchar("country", { length: 100 }),
  city: varchar("city", { length: 100 }),
  street: text("street"),
  zipCode: varchar("zip_code", { length: 20 }),
  // Financial Information
  nte: decimal("nte", { precision: 10, scale: 2 }),
  tnte: decimal("tnte", { precision: 10, scale: 2 }),
  // Timeline and Work Details
  estimatedHours: varchar("estimated_hours", { length: 20 }),
  actualHours: decimal("actual_hours", { precision: 8, scale: 2 }),
  scheduledDate: varchar("scheduled_date", { length: 20 }),
  startDate: varchar("start_date", { length: 20 }),
  endDate: varchar("end_date", { length: 20 }),
  completedDate: timestamp("completed_date"),
  urgency: varchar("urgency", { length: 20 }),
  equipmentType: varchar("equipment_type", { length: 255 }),
  problemDescription: text("problem_description"),
  // Instructions
  specialInstructions: text("special_instructions"),
  accessInstructions: text("access_instructions"),
  safetyRequirements: text("safety_requirements"),
  // Assignment
  assignedUserIds: text("assigned_user_ids"), // JSON array as text
  clientWorkOrderNumber: varchar("client_work_order_number", { length: 255 }),
  isLocked: boolean("is_locked").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const workOrderProposals = pgTable("work_order_proposals", {
  id: serial("id").primaryKey(),
  workOrderId: integer("work_order_id").notNull().references(() => workOrders.id, { onDelete: "cascade" }),
  laborCost: decimal("labor_cost", { precision: 10, scale: 2 }).default("0"),
  materialCost: decimal("material_cost", { precision: 10, scale: 2 }).default("0"),
  additionalCosts: decimal("additional_costs", { precision: 10, scale: 2 }).default("0"),
  totalCost: decimal("total_cost", { precision: 10, scale: 2 }).default("0"),
  estimatedDuration: varchar("estimated_duration", { length: 255 }).default("TBD"),
  description: text("description"),
  status: varchar("status", { length: 50 }).notNull().default("pending"),
  laborData: text("labor_data"),
  partsData: text("parts_data"),
  servicesData: text("services_data"),
  message: text("message"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  approvedAt: timestamp("approved_at"),
});

export const workOrderPartsRequests = pgTable("work_order_parts_requests", {
  id: serial("id").primaryKey(),
  workOrderId: integer("work_order_id").notNull().references(() => workOrders.id, { onDelete: "cascade" }),
  partName: varchar("part_name", { length: 255 }).notNull(),
  partNumber: varchar("part_number", { length: 255 }),
  quantity: integer("quantity").notNull(),
  estimatedCost: decimal("estimated_cost", { precision: 10, scale: 2 }),
  supplier: varchar("supplier", { length: 255 }),
  urgency: varchar("urgency", { length: 50 }).notNull().default("normal"),
  // status: pending | approved | rejected | ordered | received | cancelled
  status: varchar("status", { length: 50 }).notNull().default("pending"),
  notes: text("notes"),
  rejectionReason: text("rejection_reason"),
  requestedBy: integer("requested_by").notNull().references(() => users.id),
  approvedBy: integer("approved_by").references(() => users.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  approvedAt: timestamp("approved_at"),
});

export const workOrderFiles = pgTable("work_order_files", {
  id: serial("id").primaryKey(),
  workOrderId: integer("work_order_id").notNull().references(() => workOrders.id, { onDelete: "cascade" }),
  fileName: varchar("file_name", { length: 255 }).notNull(),
  filePath: varchar("file_path", { length: 500 }).notNull(),
  fileSize: integer("file_size").notNull(),
  mimeType: varchar("mime_type", { length: 255 }).notNull(),
  category: varchar("category", { length: 100 }).notNull().default("general"),
  uploadedBy: integer("uploaded_by").notNull().references(() => users.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const workOrderChats = pgTable("work_order_chats", {
  id: serial("id").primaryKey(),
  workOrderId: integer("work_order_id").notNull().references(() => workOrders.id, { onDelete: "cascade" }),
  userId: integer("user_id").notNull().references(() => users.id),
  message: text("message"),
  fileUrl: text("file_url"),
  messageType: varchar("message_type", { length: 50 }).notNull().default("text"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  senderId: integer("sender_id").references(() => users.id),
});

export const workOrderTechnicianPayments = pgTable("work_order_technician_payments", {
  id: serial("id").primaryKey(),
  workOrderId: integer("work_order_id").notNull().references(() => workOrders.id, { onDelete: "cascade" }),
  technicianId: integer("technician_id").notNull().references(() => technicians.id, { onDelete: "cascade" }),
  paymentMethod: text("payment_method").notNull(),
  amountRequested: decimal("amount_requested", { precision: 10, scale: 2 }).notNull(),
  amountApproved: decimal("amount_approved", { precision: 10, scale: 2 }).default("0"),
  amountPaid: decimal("amount_paid", { precision: 10, scale: 2 }).default("0"),
  status: varchar("status", { length: 50 }).notNull().default("pending"),
  description: text("description"),
  requestedAt: timestamp("requested_at").notNull().defaultNow(),
  approvedAt: timestamp("approved_at"),
  paidAt: timestamp("paid_at"),
});

export const workOrderInvoices = pgTable("work_order_invoices", {
  id: serial("id").primaryKey(),
  workOrderId: integer("work_order_id").notNull().references(() => workOrders.id, { onDelete: "cascade" }),
  invoiceNumber: varchar("invoice_number", { length: 255 }).notNull().unique(),
  laborCost: decimal("labor_cost", { precision: 10, scale: 2 }).notNull(),
  materialCost: decimal("material_cost", { precision: 10, scale: 2 }).notNull(),
  additionalCosts: decimal("additional_costs", { precision: 10, scale: 2 }).default("0"),
  subtotal: decimal("subtotal", { precision: 10, scale: 2 }).notNull(),
  taxRate: decimal("tax_rate", { precision: 6, scale: 4 }).notNull().default("0.1"),
  taxAmount: decimal("tax_amount", { precision: 10, scale: 2 }).notNull(),
  totalAmount: decimal("total_amount", { precision: 10, scale: 2 }).notNull(),
  // status: draft | pending_approval | approved | rejected | sent | paid
  status: varchar("status", { length: 50 }).notNull().default("draft"),
  notes: text("notes"),
  requestedBy: integer("requested_by").references(() => users.id),
  rejectionReason: text("rejection_reason"),
  approvedBy: integer("approved_by").references(() => users.id),
  approvedAt: timestamp("approved_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  sentAt: timestamp("sent_at"),
  paidAt: timestamp("paid_at"),
});

export const notifications = pgTable("notifications", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id, { onDelete: "cascade" }),
  type: varchar("type", { length: 100 }).notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  message: text("message").notNull(),
  data: text("data"),
  isRead: boolean("is_read").notNull().default(false),
  relatedEntity: varchar("related_entity", { length: 100 }),
  relatedId: integer("related_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  readAt: timestamp("read_at"),
});

// Relations
export const usersRelations = relations(users, ({ many }) => ({
  userRoles: many(userRoles),
  requestedWorkOrders: many(workOrders, { relationName: "requestedBy" }),
  assignedWorkOrders: many(workOrders, { relationName: "assignedTo" }),
  chats: many(workOrderChats),
  uploadedFiles: many(workOrderFiles),
  partsRequests: many(workOrderPartsRequests),
  notifications: many(notifications),
}));

export const rolesRelations = relations(roles, ({ many }) => ({
  userRoles: many(userRoles),
  rolePermissions: many(rolePermissions),
}));

export const permissionsRelations = relations(permissions, ({ many }) => ({
  rolePermissions: many(rolePermissions),
}));

export const techniciansRelations = relations(technicians, ({ many }) => ({
  ratings: many(technicianRatings),
  workOrders: many(workOrders),
  payments: many(workOrderTechnicianPayments),
}));

export const workOrdersRelations = relations(workOrders, ({ one, many }) => ({
  requestedByUser: one(users, { fields: [workOrders.requestedBy], references: [users.id], relationName: "requestedBy" }),
  assignedToUser: one(users, { fields: [workOrders.assignedTo], references: [users.id], relationName: "assignedTo" }),
  technician: one(technicians, { fields: [workOrders.technicianId], references: [technicians.id] }),
  proposal: one(workOrderProposals),
  partsRequests: many(workOrderPartsRequests),
  files: many(workOrderFiles),
  chats: many(workOrderChats),
  payments: many(workOrderTechnicianPayments),
  invoice: one(workOrderInvoices),
}));

// Insert schemas
export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertRoleSchema = createInsertSchema(roles).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertPermissionSchema = createInsertSchema(permissions).omit({
  id: true,
  createdAt: true,
});

export const insertTechnicianSchema = createInsertSchema(technicians).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertRatingSchema = createInsertSchema(technicianRatings).omit({
  id: true,
  createdAt: true,
});

export const insertWorkOrderSchema = createInsertSchema(workOrders).omit({
  id: true,
  workOrderNumber: true,
  createdAt: true,
  updatedAt: true,
});

export const insertWorkOrderProposalSchema = createInsertSchema(workOrderProposals).omit({
  id: true,
  createdAt: true,
});

export const insertWorkOrderPartsRequestSchema = createInsertSchema(workOrderPartsRequests).omit({
  id: true,
  createdAt: true,
});

export const insertWorkOrderFileSchema = createInsertSchema(workOrderFiles).omit({
  id: true,
  createdAt: true,
});

export const insertWorkOrderChatSchema = createInsertSchema(workOrderChats).omit({
  id: true,
  createdAt: true,
});

export const insertWorkOrderTechnicianPaymentSchema = createInsertSchema(workOrderTechnicianPayments).omit({
  id: true,
  requestedAt: true,
});

export const insertWorkOrderInvoiceSchema = createInsertSchema(workOrderInvoices).omit({
  id: true,
  createdAt: true,
});

export const insertNotificationSchema = createInsertSchema(notifications).omit({
  id: true,
  createdAt: true,
});

export const insertClientSchema = createInsertSchema(clients).omit({
  id: true,
  createdAt: true,
});

export const loginSchema = z.object({
  username: z.string().min(1, "Username is required"),
  password: z.string().min(1, "Password is required"),
});

// Types
export type User = typeof users.$inferSelect;
export type Role = typeof roles.$inferSelect;
export type Permission = typeof permissions.$inferSelect;
export type UserRole = typeof userRoles.$inferSelect;
export type RolePermission = typeof rolePermissions.$inferSelect;
export type Technician = typeof technicians.$inferSelect;
export type TechnicianRating = typeof technicianRatings.$inferSelect;
export type WorkOrder = typeof workOrders.$inferSelect;
export type WorkOrderProposal = typeof workOrderProposals.$inferSelect;
export type WorkOrderPartsRequest = typeof workOrderPartsRequests.$inferSelect;
export type WorkOrderFile = typeof workOrderFiles.$inferSelect;
export type WorkOrderChat = typeof workOrderChats.$inferSelect;
export type WorkOrderTechnicianPayment = typeof workOrderTechnicianPayments.$inferSelect;
export type WorkOrderInvoice = typeof workOrderInvoices.$inferSelect;
export type Notification = typeof notifications.$inferSelect;
export type Client = typeof clients.$inferSelect;

export type InsertUser = z.infer<typeof insertUserSchema>;
export type InsertRole = z.infer<typeof insertRoleSchema>;
export type InsertPermission = z.infer<typeof insertPermissionSchema>;
export type InsertTechnician = z.infer<typeof insertTechnicianSchema>;
export type InsertRating = z.infer<typeof insertRatingSchema>;
export type InsertWorkOrder = z.infer<typeof insertWorkOrderSchema>;
export type InsertWorkOrderProposal = z.infer<typeof insertWorkOrderProposalSchema>;
export type InsertWorkOrderPartsRequest = z.infer<typeof insertWorkOrderPartsRequestSchema>;
export type InsertWorkOrderFile = z.infer<typeof insertWorkOrderFileSchema>;
export type InsertWorkOrderChat = z.infer<typeof insertWorkOrderChatSchema>;
export type InsertWorkOrderTechnicianPayment = z.infer<typeof insertWorkOrderTechnicianPaymentSchema>;
export type InsertWorkOrderInvoice = z.infer<typeof insertWorkOrderInvoiceSchema>;
export type InsertNotification = z.infer<typeof insertNotificationSchema>;
export type InsertClient = z.infer<typeof insertClientSchema>;
export type LoginData = z.infer<typeof loginSchema>;

// Extended types
export type UserWithRole = User & {
  role?: Role;
};

export type RoleWithPermissions = Role & {
  permissions: Permission[];
};

export type WorkOrderWithUsers = WorkOrder & {
  assignedUsers?: User[];
};