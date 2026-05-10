import { pool } from "./db";

export async function runMigrations() {
  console.log("Running database migrations...");
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(255) NOT NULL UNIQUE,
        email VARCHAR(255) NOT NULL UNIQUE,
        password VARCHAR(255) NOT NULL,
        first_name VARCHAR(255),
        last_name VARCHAR(255),
        is_active BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS roles (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL UNIQUE,
        description TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS permissions (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL UNIQUE,
        description TEXT,
        category VARCHAR(255) NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS user_roles (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        role_id INTEGER NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
        assigned_at TIMESTAMP NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS role_permissions (
        id SERIAL PRIMARY KEY,
        role_id INTEGER NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
        permission_id INTEGER NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
        assigned_at TIMESTAMP NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS technicians (
        id SERIAL PRIMARY KEY,
        first_name VARCHAR(255) NOT NULL,
        last_name VARCHAR(255) NOT NULL,
        email VARCHAR(255) NOT NULL UNIQUE,
        phone VARCHAR(50) NOT NULL,
        specialization VARCHAR(255) NOT NULL,
        experience INTEGER NOT NULL,
        hourly_rate DECIMAL(10,2) NOT NULL,
        availability VARCHAR(50) NOT NULL DEFAULT 'available',
        location VARCHAR(255) NOT NULL,
        latitude DECIMAL(10,7),
        longitude DECIMAL(10,7),
        payment_methods TEXT NOT NULL,
        bank_account VARCHAR(255),
        routing_number VARCHAR(255),
        bank_name VARCHAR(255),
        paypal_email VARCHAR(255),
        venmo_handle VARCHAR(255),
        cashapp_handle VARCHAR(255),
        zelle_info TEXT,
        mailing_address TEXT,
        w9_status VARCHAR(50),
        w9_file_path VARCHAR(500),
        w9_file_name VARCHAR(255),
        w9_submitted_at TIMESTAMP,
        average_rating DECIMAL(3,2) DEFAULT 0,
        total_ratings INTEGER DEFAULT 0,
        is_active BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS work_orders (
        id SERIAL PRIMARY KEY,
        work_order_number VARCHAR(255) NOT NULL UNIQUE,
        title VARCHAR(255) NOT NULL,
        description TEXT NOT NULL,
        priority VARCHAR(50) NOT NULL DEFAULT 'medium',
        status VARCHAR(50) NOT NULL DEFAULT 'pending',
        category VARCHAR(255) NOT NULL,
        location VARCHAR(255) NOT NULL,
        requested_by INTEGER NOT NULL REFERENCES users(id),
        assigned_to INTEGER REFERENCES users(id),
        technician_id INTEGER REFERENCES technicians(id),
        client_name VARCHAR(255),
        client_phone VARCHAR(50),
        client_email VARCHAR(255),
        country VARCHAR(100),
        city VARCHAR(100),
        street TEXT,
        zip_code VARCHAR(20),
        nte DECIMAL(10,2),
        tnte DECIMAL(10,2),
        estimated_hours VARCHAR(20),
        actual_hours DECIMAL(8,2),
        scheduled_date VARCHAR(20),
        start_date VARCHAR(20),
        end_date VARCHAR(20),
        completed_date TIMESTAMP,
        urgency VARCHAR(20),
        equipment_type VARCHAR(255),
        problem_description TEXT,
        special_instructions TEXT,
        access_instructions TEXT,
        safety_requirements TEXT,
        assigned_user_ids TEXT,
        client_work_order_number VARCHAR(255),
        is_locked BOOLEAN NOT NULL DEFAULT false,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS technician_ratings (
        id SERIAL PRIMARY KEY,
        technician_id INTEGER NOT NULL REFERENCES technicians(id) ON DELETE CASCADE,
        work_order_id INTEGER REFERENCES work_orders(id) ON DELETE SET NULL,
        rating INTEGER NOT NULL,
        comment TEXT,
        rated_by VARCHAR(255) NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS work_order_proposals (
        id SERIAL PRIMARY KEY,
        work_order_id INTEGER NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
        labor_cost DECIMAL(10,2) DEFAULT 0,
        material_cost DECIMAL(10,2) DEFAULT 0,
        additional_costs DECIMAL(10,2) DEFAULT 0,
        total_cost DECIMAL(10,2) DEFAULT 0,
        estimated_duration VARCHAR(255) DEFAULT 'TBD',
        description TEXT,
        status VARCHAR(50) NOT NULL DEFAULT 'pending',
        labor_data TEXT,
        parts_data TEXT,
        services_data TEXT,
        message TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        approved_at TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS work_order_parts_requests (
        id SERIAL PRIMARY KEY,
        work_order_id INTEGER NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
        part_name VARCHAR(255) NOT NULL,
        part_number VARCHAR(255),
        quantity INTEGER NOT NULL,
        estimated_cost DECIMAL(10,2),
        supplier VARCHAR(255),
        urgency VARCHAR(50) NOT NULL DEFAULT 'normal',
        status VARCHAR(50) NOT NULL DEFAULT 'pending',
        notes TEXT,
        rejection_reason TEXT,
        requested_by INTEGER NOT NULL REFERENCES users(id),
        approved_by INTEGER REFERENCES users(id),
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        approved_at TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS work_order_files (
        id SERIAL PRIMARY KEY,
        work_order_id INTEGER NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
        file_name VARCHAR(255) NOT NULL,
        file_path VARCHAR(500) NOT NULL,
        file_size INTEGER NOT NULL,
        mime_type VARCHAR(255) NOT NULL,
        category VARCHAR(100) NOT NULL DEFAULT 'general',
        uploaded_by INTEGER NOT NULL REFERENCES users(id),
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS work_order_chats (
        id SERIAL PRIMARY KEY,
        work_order_id INTEGER NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
        user_id INTEGER NOT NULL REFERENCES users(id),
        message TEXT,
        file_url TEXT,
        message_type VARCHAR(50) NOT NULL DEFAULT 'text',
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        sender_id INTEGER REFERENCES users(id)
      );

      CREATE TABLE IF NOT EXISTS work_order_technician_payments (
        id SERIAL PRIMARY KEY,
        work_order_id INTEGER NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
        technician_id INTEGER NOT NULL REFERENCES technicians(id) ON DELETE CASCADE,
        payment_method TEXT NOT NULL,
        amount_requested DECIMAL(10,2) NOT NULL,
        amount_approved DECIMAL(10,2) DEFAULT 0,
        amount_paid DECIMAL(10,2) DEFAULT 0,
        status VARCHAR(50) NOT NULL DEFAULT 'pending',
        description TEXT,
        requested_at TIMESTAMP NOT NULL DEFAULT NOW(),
        approved_at TIMESTAMP,
        paid_at TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS work_order_invoices (
        id SERIAL PRIMARY KEY,
        work_order_id INTEGER NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
        invoice_number VARCHAR(255) NOT NULL UNIQUE,
        labor_cost DECIMAL(10,2) NOT NULL,
        material_cost DECIMAL(10,2) NOT NULL,
        additional_costs DECIMAL(10,2) DEFAULT 0,
        subtotal DECIMAL(10,2) NOT NULL,
        tax_rate DECIMAL(6,4) NOT NULL DEFAULT 0.1,
        tax_amount DECIMAL(10,2) NOT NULL,
        total_amount DECIMAL(10,2) NOT NULL,
        status VARCHAR(50) NOT NULL DEFAULT 'draft',
        notes TEXT,
        requested_by INTEGER REFERENCES users(id),
        rejection_reason TEXT,
        approved_by INTEGER REFERENCES users(id),
        approved_at TIMESTAMP,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        sent_at TIMESTAMP,
        paid_at TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS notifications (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        type VARCHAR(100) NOT NULL,
        title VARCHAR(255) NOT NULL,
        message TEXT NOT NULL,
        data TEXT,
        is_read BOOLEAN NOT NULL DEFAULT false,
        related_entity VARCHAR(100),
        related_id INTEGER,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        read_at TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS system_settings (
        key VARCHAR(255) PRIMARY KEY,
        value TEXT NOT NULL DEFAULT ''
      );
    `);
    console.log("Database migrations completed successfully.");
  } catch (error) {
    console.error("Migration error:", error);
    throw error;
  }
}
