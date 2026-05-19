-- ============================================
-- TICKET SUB-STATUS DYNAMIC SYSTEM
-- Run these in pgAdmin sequentially
-- ============================================

-- 1. Create ticket_sub_statuses table
CREATE TABLE ticket_sub_statuses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    slug VARCHAR(50) NOT NULL UNIQUE,
    color VARCHAR(20) DEFAULT '#6C757D',
    icon VARCHAR(50),
    description TEXT,
    display_order INT DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- 2. Add sub_status_id column to report_tickets
ALTER TABLE report_tickets ADD COLUMN sub_status_id UUID REFERENCES ticket_sub_statuses(id);

-- 3. Add is_system column for default/system sub-statuses
ALTER TABLE ticket_sub_statuses ADD COLUMN is_system BOOLEAN DEFAULT false;

-- 4. Add foreign key for self-referencing (optional - keep nullable for flexibility)
-- The existing relationship:
-- report_tickets has: id, reportId, status, assignedTo, sub_status_id, workflowSteps, comments

-- 5. Add sub_status history tracking to workflow_steps structure
-- The workflow_steps JSONB will now track both status AND sub_status changes

-- ============================================
-- DEFAULT SUB-STATUSES (can be managed via admin later)
-- ============================================
INSERT INTO ticket_sub_statuses (name, slug, color, description, display_order, is_system) VALUES
('Draft', 'draft', '#6C757D', 'Initial draft status', 0, true),
('Technician Assigned', 'technician_assigned', '#FFA500', 'Technician has been assigned to the ticket', 1, false),
('Material Procurement', 'material_procurement', '#3498DB', 'Gathering materials and equipment', 2, false),
('On Site Repair', 'on_site_repair', '#9B59B6', 'Repair work in progress at site', 3, false),
('Pending Parts', 'pending_parts', '#E74C3C', 'Waiting for replacement parts', 4, false),
('Inspection', 'inspection', '#2ECC71', 'Final inspection before closure', 5, false),
('Quality Check', 'quality_check', '#1ABC9C', 'Quality verification in progress', 6, false),
('Awaiting Approval', 'awaiting_approval', '#F39C12', 'Awaiting management approval', 7, false);

-- ============================================
-- Verify the setup
-- ============================================
SELECT * FROM ticket_sub_statuses ORDER BY display_order;

-- Check the new column in report_tickets
SELECT id, status, sub_status_id, created_at FROM report_tickets LIMIT 5;