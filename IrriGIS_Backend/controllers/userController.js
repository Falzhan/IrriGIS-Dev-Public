const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const { User } = require('../models');
const { IrrigatorAssociation } = require('../models');

const getAllUsers = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      role,
      is_active,
      ia_id,
      search,
      sort = 'createdAt',
      order = 'DESC'
    } = req.query;

    const offset = (page - 1) * limit;
    const where = {};

    // Role-based filtering
    if (role) where.role = role;
    if (is_active !== undefined) where.is_active = is_active === 'true';
    if (search) {
      where[require('sequelize').Op.or] = [
        { first_name: { [require('sequelize').Op.iLike]: `%${search}%` } },
        { last_name: { [require('sequelize').Op.iLike]: `%${search}%` } },
        { email: { [require('sequelize').Op.iLike]: `%${search}%` } }
      ];
    }

    // ia_admin can only see users from their IA
    if (req.user.role === 'ia_admin') {
      if (!req.user.ia_id) {
        return res.status(403).json({ success: false, message: 'IA not assigned to user' });
      }
      where.ia_id = req.user.ia_id;
    } else if (ia_id) {
      // Other roles can filter by ia_id if provided
      where.ia_id = ia_id;
    }

    const { count, rows } = await User.findAndCountAll({
      where,
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [[sort, order.toUpperCase()]],
      include: [
        { model: IrrigatorAssociation, as: 'irrigatorAssociation', attributes: ['id', 'name', 'code'] }
      ],
      attributes: { exclude: ['password_hash'], include: ['created_at', 'updated_at'] }
    });

    res.json({
      success: true,
      data: rows,
      pagination: {
        total: count,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(count / limit)
      }
    });
  } catch (error) {
    console.error('Get all users error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

const getUserById = async (req, res) => {
  try {
    const { id } = req.params;

    if (req.user.role !== 'nia_admin' && req.user.id !== id) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    const user = await User.findByPk(id, {
      include: [
        { model: IrrigatorAssociation, as: 'irrigatorAssociation', attributes: ['id', 'name', 'code'] }
      ],
      attributes: { exclude: ['password_hash'], include: ['created_at', 'updated_at'] }
    });

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    res.json({ success: true, data: user });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

const createUser = async (req, res) => {
  try {
    const {
      email,
      password,
      first_name,
      firstName,
      last_name,
      lastName,
      role,
      contact_number,
      address,
      ia_id,
      ris_id
    } = req.body;

    const finalFirstName = first_name || firstName;
    const finalLastName = last_name || lastName;

    if (!email) return res.status(400).json({ success: false, message: 'Email is required' });
    if (!password) return res.status(400).json({ success: false, message: 'Password is required' });
    if (!finalFirstName || !finalLastName) {
      return res.status(400).json({ success: false, message: 'First and last name are required' });
    }

    const existingUser = await User.findOne({ where: { email } });
    if (existingUser) {
      return res.status(400).json({ success: false, message: 'User already exists with this email' });
    }

    const isNiaEmail = email.endsWith('@nia.gov.ph');
    let requestedRole = role || (isNiaEmail ? 'nia_admin' : 'ia_member');

    if ((requestedRole === 'nia_admin' || requestedRole === 'nia_field_officer') && !isNiaEmail) {
      return res.status(400).json({ success: false, message: 'NIA roles require @nia.gov.ph email address' });
    }

    if (!['nia_admin', 'nia_field_officer', 'ia_admin', 'ia_member'].includes(requestedRole)) {
      return res.status(400).json({ success: false, message: 'Invalid role' });
    }

    const user = await User.create({
      email,
      password_hash: password,
      first_name: finalFirstName,
      last_name: finalLastName,
      role: requestedRole,
      contact_number,
      address,
      ia_id,
      ris_id,
      auth_provider: 'local'
    });

    const { password_hash: _, ...userResponse } = user.toJSON();

    res.status(201).json({
      success: true,
      message: 'User created successfully',
      data: userResponse
    });
  } catch (error) {
    console.error('Create user error:', error);
    res.status(500).json({ success: false, message: error.message || 'Server error' });
  }
};

const updateUser = async (req, res) => {
  try {
    const { id } = req.params;
    
    // Handle both JSON and FormData
    const first_name = req.body.first_name || req.body.firstName;
    const last_name = req.body.last_name || req.body.lastName;
    const contact_number = req.body.contact_number;
    const address = req.body.address;
    const userRole = req.body.role;
    const ia_id = req.body.ia_id;
    const ris_id = req.body.ris_id;
    const is_active = req.body.is_active;

    const user = await User.findByPk(id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const isAdmin = req.user.role === 'nia_admin';
    const isSelf = req.user.id === id;

    if (!isAdmin && !isSelf) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    const finalFirstName = first_name;
    const finalLastName = last_name;

    if (finalFirstName) user.first_name = finalFirstName;
    if (finalLastName) user.last_name = finalLastName;
    if (contact_number !== undefined) user.contact_number = contact_number;
    if (address !== undefined) user.address = address;
    if (ia_id !== undefined) user.ia_id = ia_id;
    if (ris_id !== undefined) user.ris_id = ris_id;

    if (isAdmin) {
      if (userRole) {
        const isNiaEmail = user.email.endsWith('@nia.gov.ph');
        if ((userRole === 'nia_admin' || userRole === 'nia_field_officer') && !isNiaEmail) {
          return res.status(400).json({ success: false, message: 'NIA roles require @nia.gov.ph email' });
        }
        if (!['nia_admin', 'nia_field_officer', 'ia_admin', 'ia_member'].includes(userRole)) {
          return res.status(400).json({ success: false, message: 'Invalid role' });
        }
        user.role = userRole;
      }
      if (is_active !== undefined) user.is_active = is_active;
    }

    await user.save();

    const updatedUser = await User.findByPk(id, {
      include: [
        { model: IrrigatorAssociation, as: 'irrigatorAssociation', attributes: ['id', 'name', 'code'] }
      ],
      attributes: { exclude: ['password_hash'], include: ['created_at', 'updated_at'] }
    });

    res.json({
      success: true,
      message: 'User updated successfully',
      data: updatedUser
    });
  } catch (error) {
    console.error('Update user error:', error);
    res.status(500).json({ success: false, message: error.message || 'Server error' });
  }
};

const deleteUser = async (req, res) => {
  try {
    const { id } = req.params;

    if (req.user.id === id) {
      return res.status(400).json({ success: false, message: 'Cannot deactivate your own account' });
    }

    const user = await User.findByPk(id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    user.is_active = false;
    await user.save();

    res.json({ success: true, message: 'User deactivated successfully' });
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

const resetPassword = async (req, res) => {
  try {
    const { id } = req.params;
    const { new_password } = req.body;

    if (!new_password) {
      return res.status(400).json({ success: false, message: 'New password is required' });
    }

    if (new_password.length < 6) {
      return res.status(400).json({ success: false, message: 'Password must be at least 6 characters' });
    }

    const user = await User.findByPk(id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    user.password_hash = new_password;
    await user.save();

    res.json({ success: true, message: 'Password reset successfully' });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

const getIrrigatorAssociations = async (req, res) => {
  try {
    const ias = await IrrigatorAssociation.findAll({
      attributes: ['id', 'name', 'code', 'ris_id', 'service_area'],
      order: [['name', 'ASC']]
    });
    const formatted = ias.map(ia => {
      let geom = ia.service_area
      if (geom && typeof geom === 'object' && geom.toGeoJSON) {
        geom = geom.toGeoJSON()
      }
      return {
        ...ia.toJSON(),
        service_area: geom
      }
    })
    res.json({ success: true, data: formatted });
  } catch (error) {
    console.error('Get IAs error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

module.exports = {
  getAllUsers,
  getUserById,
  createUser,
  updateUser,
  deleteUser,
  resetPassword,
  getIrrigatorAssociations
};
