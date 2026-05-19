const { ReportPreset } = require('../models');

const getPresetsByCategory = async (req, res) => {
  try {
    const { category } = req.query;

    if (!category) {
      return res.status(400).json({ success: false, message: 'Category is required' });
    }

    const presets = await ReportPreset.findAll({
      where: {
        category,
        is_active: true
      },
      order: [['display_order', 'ASC']]
    });

    const formattedPresets = presets.map(p => ({
      id: p.id,
      name: p.name,
      slug: p.slug,
      category: p.category,
      water_level: p.water_level,
      silt_level: p.silt_level,
      debris_level: p.debris_level,
      icon: p.icon,
      description: p.description
    }));

    res.json({ success: true, data: formattedPresets });
  } catch (error) {
    console.error('Get presets error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

const getAllPresets = async (req, res) => {
  try {
    const { category, is_active } = req.query;

    const where = {};
    if (category) where.category = category;
    if (is_active !== undefined) where.is_active = is_active === 'true';

    const presets = await ReportPreset.findAll({
      where,
      order: [['category', 'ASC'], ['display_order', 'ASC']]
    });

    res.json({ success: true, data: presets });
  } catch (error) {
    console.error('Get all presets error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

const getPresetById = async (req, res) => {
  try {
    const { id } = req.params;

    const preset = await ReportPreset.findByPk(id);
    if (!preset) {
      return res.status(404).json({ success: false, message: 'Preset not found' });
    }

    res.json({ success: true, data: preset });
  } catch (error) {
    console.error('Get preset error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

const createPreset = async (req, res) => {
  try {
    const { name, slug, category, water_level, silt_level, debris_level, icon, description, display_order } = req.body;

    if (!name || !slug || !category) {
      return res.status(400).json({ success: false, message: 'Name, slug, and category are required' });
    }

    if (!['inspection', 'maintenance', 'cleaning', 'issue', 'other'].includes(category)) {
      return res.status(400).json({ success: false, message: 'Invalid category' });
    }

    const existing = await ReportPreset.findOne({ 
      where: { category, slug: slug.toLowerCase() }
    });
    if (existing) {
      return res.status(400).json({ success: false, message: 'Slug already exists for this category' });
    }

    const preset = await ReportPreset.create({
      name,
      slug: slug.toLowerCase().replace(/[^a-z0-9]/g, '_'),
      category,
      water_level: water_level || 3,
      silt_level: silt_level || 3,
      debris_level: debris_level || 3,
      icon,
      description,
      display_order: display_order || 0
    });

    res.status(201).json({ success: true, message: 'Preset created', data: preset });
  } catch (error) {
    console.error('Create preset error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

const updatePreset = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, water_level, silt_level, debris_level, icon, description, display_order, is_active } = req.body;

    const preset = await ReportPreset.findByPk(id);
    if (!preset) {
      return res.status(404).json({ success: false, message: 'Preset not found' });
    }

    if (name) preset.name = name;
    if (water_level !== undefined) {
      if (water_level < 1 || water_level > 5) {
        return res.status(400).json({ success: false, message: 'Water level must be between 1-5' });
      }
      preset.water_level = water_level;
    }
    if (silt_level !== undefined) {
      if (silt_level < 1 || silt_level > 5) {
        return res.status(400).json({ success: false, message: 'Silt level must be between 1-5' });
      }
      preset.silt_level = silt_level;
    }
    if (debris_level !== undefined) {
      if (debris_level < 1 || debris_level > 5) {
        return res.status(400).json({ success: false, message: 'Debris level must be between 1-5' });
      }
      preset.debris_level = debris_level;
    }
    if (icon !== undefined) preset.icon = icon;
    if (description !== undefined) preset.description = description;
    if (display_order !== undefined) preset.display_order = display_order;
    if (is_active !== undefined) preset.is_active = is_active;

    await preset.save();

    res.json({ success: true, message: 'Preset updated', data: preset });
  } catch (error) {
    console.error('Update preset error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

const deletePreset = async (req, res) => {
  try {
    const { id } = req.params;

    const preset = await ReportPreset.findByPk(id);
    if (!preset) {
      return res.status(404).json({ success: false, message: 'Preset not found' });
    }

    await preset.destroy();

    res.json({ success: true, message: 'Preset deleted' });
  } catch (error) {
    console.error('Delete preset error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

const getCategories = async (req, res) => {
  try {
    const categories = await ReportPreset.findAll({
      attributes: ['category'],
      group: ['category'],
      order: [['category', 'ASC']]
    });

    res.json({ 
      success: true, 
      data: categories.map(c => c.category) 
    });
  } catch (error) {
    console.error('Get categories error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

module.exports = {
  getPresetsByCategory,
  getAllPresets,
  getPresetById,
  createPreset,
  updatePreset,
  deletePreset,
  getCategories
};