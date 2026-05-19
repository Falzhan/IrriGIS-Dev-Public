-- ============================================
-- DYNAMIC REPORT FORM PRESETS BY CATEGORY
-- Run these in pgAdmin sequentially
-- ============================================

-- 1. Create report_presets table
CREATE TABLE report_presets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    slug VARCHAR(50) NOT NULL UNIQUE,
    category VARCHAR(50) NOT NULL,       -- inspection, maintenance, cleaning, issue, other
    water_level INT DEFAULT 3 CHECK (water_level BETWEEN 1 AND 5),
    silt_level INT DEFAULT 3 CHECK (silt_level BETWEEN 1 AND 5),
    debris_level INT DEFAULT 3 CHECK (debris_level BETWEEN 1 AND 5),
    icon VARCHAR(50),
    description TEXT,
    display_order INT DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Add unique constraint for category + slug combination
ALTER TABLE report_presets ADD CONSTRAINT unique_category_slug UNIQUE (category, slug);

    -- ============================================
    -- DEFAULT PRESETS BY CATEGORY
    -- ============================================

    -- CATEGORY: inspection
    INSERT INTO report_presets (name, slug, category, water_level, silt_level, debris_level, icon, description, display_order) VALUES
    ('Normal', 'normal', 'inspection', 3, 3, 3, 'check-circle', 'Normal operating conditions', 1),
    ('Issue Found', 'issue_found', 'inspection', 4, 4, 4, 'alert-triangle', 'Issues detected during inspection', 2);

    -- CATEGORY: maintenance
    INSERT INTO report_presets (name, slug, category, water_level, silt_level, debris_level, icon, description, display_order) VALUES
    ('Cleaning Complete', 'cleaning_complete', 'maintenance', 3, 1, 1, 'check', 'Cleaning/maintenance completed', 1),
    ('Partial Cleaning', 'partial_cleaning', 'maintenance', 3, 2, 2, 'feather', 'Partial cleaning done', 2),
    ('Needs More Work', 'needs_more_work', 'maintenance', 3, 3, 3, 'clock', 'Maintenance partially done', 3);

    -- CATEGORY: cleaning
    INSERT INTO report_presets (name, slug, category, water_level, silt_level, debris_level, icon, description, display_order) VALUES
    ('Fully Cleaned', 'fully_cleaned', 'cleaning', 3, 1, 1, 'trash', 'Canal is fully cleaned', 1),
    ('Partially Cleaned', 'partially_cleaned', 'cleaning', 3, 2, 2, 'minus-circle', 'Some debris remains', 2),
    ('Heavy Accumulation', 'heavy_accumulation', 'cleaning', 3, 4, 4, 'alert-circle', 'Significant debris buildup', 3);

    -- CATEGORY: issue
    INSERT INTO report_presets (name, slug, category, water_level, silt_level, debris_level, icon, description, display_order) VALUES
    ('Critical - Blocked', 'critical_blocked', 'issue', 5, 5, 5, 'alert-octagon', 'Critical - completely blocked', 1),
    ('Severe', 'severe', 'issue', 4, 4, 4, 'alert-triangle', 'Severe issue requiring attention', 2),
    ('Moderate', 'moderate', 'issue', 3, 3, 3, 'info', 'Moderate issue', 3),
    ('Minor', 'minor', 'issue', 2, 2, 2, 'info', 'Minor issue, low priority', 4);

    -- CATEGORY: other
    INSERT INTO report_presets (name, slug, category, water_level, silt_level, debris_level, icon, description, display_order) VALUES
    ('Default', 'default', 'other', 3, 3, 3, 'help-circle', 'Default preset for other category', 1);

-- ============================================
-- Verify
-- ============================================
SELECT * FROM report_presets ORDER BY category, display_order;

-- Categories available:
SELECT DISTINCT category FROM report_presets ORDER BY category;