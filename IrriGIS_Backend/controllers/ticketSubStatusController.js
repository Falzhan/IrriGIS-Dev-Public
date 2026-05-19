const { TicketSubStatus, ReportTicket, Report, User } = require('../models');
const { Op } = require('sequelize');

const getAllSubStatuses = async (req, res) => {
  try {
    const { is_active, is_system } = req.query;

    const where = {};
    if (is_active !== undefined) where.is_active = is_active === 'true';
    if (is_system !== undefined) where.is_system = is_system === 'true';

    const subStatuses = await TicketSubStatus.findAll({
      where,
      order: [['display_order', 'ASC']]
    });

    res.json({ success: true, data: subStatuses });
  } catch (error) {
    console.error('Get sub statuses error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

const getSubStatusById = async (req, res) => {
  try {
    const { id } = req.params;

    const subStatus = await TicketSubStatus.findByPk(id);
    if (!subStatus) {
      return res.status(404).json({ success: false, message: 'Sub-status not found' });
    }

    res.json({ success: true, data: subStatus });
  } catch (error) {
    console.error('Get sub status error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

const createSubStatus = async (req, res) => {
  try {
    const { name, slug, color, icon, description, display_order, is_active } = req.body;

    if (!name || !slug) {
      return res.status(400).json({ success: false, message: 'Name and slug are required' });
    }

    const existing = await TicketSubStatus.findOne({ where: { slug } });
    if (existing) {
      return res.status(400).json({ success: false, message: 'Slug already exists' });
    }

    const subStatus = await TicketSubStatus.create({
      name,
      slug: slug.toLowerCase().replace(/[^a-z0-9]/g, '_'),
      color: color || '#6C757D',
      icon,
      description,
      display_order: display_order || 0,
      is_active: is_active !== false,
      is_system: false
    });

    res.status(201).json({ success: true, message: 'Sub-status created', data: subStatus });
  } catch (error) {
    console.error('Create sub status error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

const updateSubStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, color, icon, description, display_order, is_active } = req.body;

    const subStatus = await TicketSubStatus.findByPk(id);
    if (!subStatus) {
      return res.status(404).json({ success: false, message: 'Sub-status not found' });
    }

    if (subStatus.is_system) {
      return res.status(400).json({ success: false, message: 'Cannot modify system sub-status' });
    }

    if (name) subStatus.name = name;
    if (color) subStatus.color = color;
    if (icon !== undefined) subStatus.icon = icon;
    if (description !== undefined) subStatus.description = description;
    if (display_order !== undefined) subStatus.display_order = display_order;
    if (is_active !== undefined) subStatus.is_active = is_active;

    await subStatus.save();

    res.json({ success: true, message: 'Sub-status updated', data: subStatus });
  } catch (error) {
    console.error('Update sub status error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

const deleteSubStatus = async (req, res) => {
  try {
    const { id } = req.params;

    const subStatus = await TicketSubStatus.findByPk(id);
    if (!subStatus) {
      return res.status(404).json({ success: false, message: 'Sub-status not found' });
    }

    if (subStatus.is_system) {
      return res.status(400).json({ success: false, message: 'Cannot delete system sub-status' });
    }

    const ticketsUsing = await ReportTicket.count({ where: { sub_status_id: id } });
    if (ticketsUsing > 0) {
      return res.status(400).json({ 
        success: false, 
        message: `Cannot delete: ${ticketsUsing} tickets are using this sub-status` 
      });
    }

    await subStatus.destroy();

    res.json({ success: true, message: 'Sub-status deleted' });
  } catch (error) {
    console.error('Delete sub status error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

const getSubStatusesForTicket = async (req, res) => {
  try {
    const { ticket_id } = req.query;

    if (!ticket_id) {
      return res.status(400).json({ success: false, message: 'ticket_id is required' });
    }

    const ticket = await ReportTicket.findByPk(ticket_id, {
      include: [{ model: Report, as: 'Report' }]
    });

    if (!ticket) {
      return res.status(404).json({ success: false, message: 'Ticket not found' });
    }

    let where = { is_active: true };

    const subStatuses = await TicketSubStatus.findAll({
      where,
      order: [['display_order', 'ASC']]
    });

    res.json({ success: true, data: subStatuses });
  } catch (error) {
    console.error('Get sub statuses for ticket error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

module.exports = {
  getAllSubStatuses,
  getSubStatusById,
  createSubStatus,
  updateSubStatus,
  deleteSubStatus,
  getSubStatusesForTicket
};