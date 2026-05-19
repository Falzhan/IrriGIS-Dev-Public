const { ReportTicket, Report, ReportImage, User, sequelize, TicketSubStatus } = require('../models');
const { Op } = require('sequelize');
const { notifyTicketUpdate, notifyNewComment, notifySubStatusChange } = require('./notificationController');

// Get all tickets with pagination, filtering, and role-based access
const getAllTickets = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      status,
      assignedTo,
      sortBy = 'createdAt',
      sortOrder = 'DESC'
    } = req.query;

    // Build where clause for ticket
    const ticketWhereClause = {};
    
    if (status) ticketWhereClause.status = status;
    if (assignedTo) ticketWhereClause.assignedTo = assignedTo;

    // Build where clause for report (for IA isolation)
    const reportWhereClause = {};
    
    // Role-based access control
    const userRole = req.user.role;
    const userId = req.user.id;
    const userIaId = req.user.ia_id;

    if (userRole === 'ia_member') {
      // IA members can see tickets from their own reports + IA reports
      if (userIaId) {
        reportWhereClause[Op.or] = [
          { user_id: userId },
          { ia_id: userIaId }
        ];
      } else {
        // If no IA assigned, only see own reports
        reportWhereClause.user_id = userId;
      }
    } else if (userRole === 'ia_admin') {
      // IA admins can see all tickets from their IA
      if (userIaId) {
        reportWhereClause.ia_id = userIaId;
      } else {
        // If no IA assigned, only see own reports
        reportWhereClause.user_id = userId;
      }
    }
    // NIA staff (nia_admin, nia_field_officer) can see all tickets (no filter)

    // Calculate pagination
    const offset = (parseInt(page) - 1) * parseInt(limit);

    const { count, rows: tickets } = await ReportTicket.findAndCountAll({
      where: ticketWhereClause,
      attributes: ['id', 'status', 'sub_status_id', 'assigned_to', 'acknowledged_at', 'resolved_at', 'workflow_steps', 'report_id', 'createdAt', 'updatedAt'],
      include: [
        {
          model: Report,
          as: 'Report',
          paranoid: false,
          required: false,
          include: [
            {
              model: User,
              as: 'User',
              attributes: ['id', 'first_name', 'last_name', 'email', 'role', 'profile_image_url']
            },
            {
              model: ReportImage,
              as: 'images',
              attributes: ['id', 'imageUrl', 'isPrimary', 'caption', 'createdAt']
            }
          ]
        },
        {
          model: Report,
          as: 'Reports',
          paranoid: false,
          required: false,
          include: [
            {
              model: User,
              as: 'User',
              attributes: ['id', 'first_name', 'last_name', 'email', 'role', 'profile_image_url']
            },
            {
              model: ReportImage,
              as: 'images',
              attributes: ['id', 'imageUrl', 'isPrimary', 'caption', 'createdAt']
            }
          ]
        },
        {
          model: User,
          as: 'assignedUser',
          attributes: ['id', 'first_name', 'last_name', 'email', 'role', 'profile_image_url']
        },
        {
          model: TicketSubStatus,
          as: 'subStatus',
          attributes: ['id', 'name', 'slug', 'color']
        }
      ],
      order: [[sortBy, sortOrder.toUpperCase()]],
      limit: parseInt(limit),
      offset: offset
    });

    const totalPages = Math.ceil(count / parseInt(limit));

    const formattedTickets = tickets.map(ticket => {
      // Get anchor report (singular) and linked reports (plural)
      const anchorReport = ticket.Report
      const linkedReports = ticket.Reports || []
      
      // Combine and deduplicate by report ID
      const allReportsMap = new Map()
      
      // Add anchor report first if exists
      if (anchorReport) {
        const anchorData = {
          ...anchorReport.toJSON ? anchorReport.toJSON() : anchorReport,
          location_name: anchorReport.location_name,
          category: anchorReport.category,
          created_at: anchorReport.created_at,
          updated_at: anchorReport.updated_at,
          user_id: anchorReport.user_id,
          ia_id: anchorReport.ia_id,
          gis_feature_id: anchorReport.gis_feature_id,
          water_level: anchorReport.water_level,
          silt_level: anchorReport.silt_level,
          debris_level: anchorReport.debris_level,
          remarks: anchorReport.remarks,
          is_valid: anchorReport.is_valid,
          location: anchorReport.location,
          ReportImages: anchorReport.images,
          User: anchorReport.User
        }
        allReportsMap.set(anchorReport.id, anchorData)
      }
      
      // Add linked reports, avoiding duplicates
      linkedReports.forEach(r => {
        if (!allReportsMap.has(r.id)) {
          allReportsMap.set(r.id, {
            ...r.toJSON ? r.toJSON() : r,
            location_name: r.location_name,
            category: r.category,
            created_at: r.created_at,
            updated_at: r.updated_at,
            user_id: r.user_id,
            ia_id: r.ia_id,
            gis_feature_id: r.gis_feature_id,
            water_level: r.water_level,
            silt_level: r.silt_level,
            debris_level: r.debris_level,
            remarks: r.remarks,
            is_valid: r.is_valid,
            location: r.location,
            ReportImages: r.images,
            User: r.User
          })
        }
      })
      
      const allReports = Array.from(allReportsMap.values())
      return {
        ...ticket.toJSON ? ticket.toJSON() : ticket,
        reports: allReports
      };
    });

    res.status(200).json({
      success: true,
      data: {
        tickets: formattedTickets,
        pagination: {
          total: count,
          totalPages,
          currentPage: parseInt(page),
          limit: parseInt(limit)
        }
      }
    });
  } catch (error) {
    console.error('Get all tickets error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch tickets'
    });
  }
};

// Get single ticket by ID
const getTicketById = async (req, res) => {
  try {
    const { id } = req.params;
    const userRole = req.user.role;
    const userId = req.user.id;
    const userIaId = req.user.ia_id;

    const ticket = await ReportTicket.findByPk(id, {
      attributes: ['id', 'status', 'sub_status_id', 'assigned_to', 'acknowledged_at', 'resolved_at', 'workflow_steps', 'report_id', 'createdAt', 'updatedAt'],
      include: [
        {
          model: Report,
          as: 'Report',
          paranoid: false,
          required: false,
          include: [
            {
              model: User,
              as: 'User',
              attributes: ['id', 'first_name', 'last_name', 'email', 'role', 'profile_image_url']
            },
            {
              model: ReportImage,
              as: 'images',
              attributes: ['id', 'imageUrl', 'isPrimary', 'caption', 'createdAt']
            }
          ]
        },
        {
          model: Report,
          as: 'Reports',
          paranoid: false,
          required: false,
          include: [
            {
              model: User,
              as: 'User',
              attributes: ['id', 'first_name', 'last_name', 'email', 'role', 'profile_image_url']
            },
            {
              model: ReportImage,
              as: 'images',
              attributes: ['id', 'imageUrl', 'isPrimary', 'caption', 'createdAt']
            }
          ]
        },
        {
          model: User,
          as: 'assignedUser',
          attributes: ['id', 'first_name', 'last_name', 'email', 'role', 'profile_image_url']
        },
        {
          model: TicketSubStatus,
          as: 'subStatus',
          attributes: ['id', 'name', 'slug', 'color']
        }
      ]
    });

    if (!ticket) {
      return res.status(404).json({
        success: false,
        message: 'Ticket not found'
      });
    }

    // Authorization check - use both anchor and linked reports
    const anchorReport = ticket.Report
    const linkedReports = ticket.Reports || []
    const allReportsForAuth = anchorReport ? [anchorReport, ...linkedReports] : linkedReports
    const hasOwner = allReportsForAuth.some(r => r.user_id === userId);
    const hasSameIA = allReportsForAuth.some(r => r.ia_id === userIaId);
    const isNiaStaff = ['nia_admin', 'nia_field_officer'].includes(userRole);
    const isAssigned = ticket.assignedTo === userId;

    if (!hasOwner && !hasSameIA && !isNiaStaff && !isAssigned) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    // Combine anchor report and linked reports, deduplicating by ID
    const allReportsMap = new Map()
    
    // Add anchor report first if exists
    if (anchorReport) {
      const anchorData = {
        ...anchorReport.toJSON ? anchorReport.toJSON() : anchorReport,
        location_name: anchorReport.location_name,
        category: anchorReport.category,
        created_at: anchorReport.created_at,
        updated_at: anchorReport.updated_at,
        user_id: anchorReport.user_id,
        ia_id: anchorReport.ia_id,
        gis_feature_id: anchorReport.gis_feature_id,
        water_level: anchorReport.water_level,
        silt_level: anchorReport.silt_level,
        debris_level: anchorReport.debris_level,
        remarks: anchorReport.remarks,
        is_valid: anchorReport.is_valid,
        location: anchorReport.location,
        ReportImages: anchorReport.images,
        User: anchorReport.User
      }
      allReportsMap.set(anchorReport.id, anchorData)
    }
    
    // Add linked reports, avoiding duplicates
    linkedReports.forEach(r => {
      if (!allReportsMap.has(r.id)) {
        allReportsMap.set(r.id, {
          ...r.toJSON ? r.toJSON() : r,
          location_name: r.location_name,
          category: r.category,
          created_at: r.created_at,
          updated_at: r.updated_at,
          user_id: r.user_id,
          ia_id: r.ia_id,
          gis_feature_id: r.gis_feature_id,
          water_level: r.water_level,
          silt_level: r.silt_level,
          debris_level: r.debris_level,
          remarks: r.remarks,
          is_valid: r.is_valid,
          location: r.location,
          ReportImages: r.images,
          User: r.User
        })
      }
    })
    
    const formattedReports = Array.from(allReportsMap.values())
    
    res.status(200).json({
      success: true,
      data: {
        ...ticket.toJSON ? ticket.toJSON() : ticket,
        reports: formattedReports
      }
    });
  } catch (error) {
    console.error('Get ticket error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch ticket'
    });
  }
};

// Create ticket manually (NIA admin only)
const createTicket = async (req, res) => {
  const t = await sequelize.transaction();

  try {
    const { reportId, assignedTo } = req.body;

    // Verify the report exists
    const report = await Report.findByPk(reportId, { transaction: t });
    if (!report) {
      await t.rollback();
      return res.status(404).json({
        success: false,
        message: 'Report not found'
      });
    }

    // Check if ticket already exists for this report
    const existingTicket = await ReportTicket.findOne({
      where: { reportId },
      transaction: t
    });

    if (existingTicket) {
      await t.rollback();
      return res.status(400).json({
        success: false,
        message: 'Ticket already exists for this report'
      });
    }

    // Create the ticket
    const ticket = await ReportTicket.create({
      reportId,
      status: 'pending',
      assignedTo: assignedTo || null,
      workflowSteps: [],
      comments: []
    }, { transaction: t });

    await t.commit();

    // Fetch complete data
    const finalTicket = await ReportTicket.findByPk(ticket.id, {
      include: [
        {
          model: Report,
          as: 'Report',
          include: [
            {
              model: User,
              as: 'User',
              attributes: ['id', 'first_name', 'last_name', 'email', 'role', 'profile_image_url']
            }
          ]
        },
        {
          model: User,
          as: 'assignedUser',
          attributes: ['id', 'first_name', 'last_name', 'email', 'role', 'profile_image_url']
        },
        {
          model: TicketSubStatus,
          as: 'subStatus',
          attributes: ['id', 'name', 'slug', 'color']
        }
      ]
    });

    res.status(201).json({
      success: true,
      message: 'Ticket created successfully',
      data: finalTicket
    });
  } catch (error) {
    if (t && !t.finished) {
      await t.rollback();
    }
    console.error('Create ticket error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to create ticket'
    });
  }
};

// Update ticket status and assignment
const updateTicket = async (req, res) => {
  const t = await sequelize.transaction();

  try {
    const { id } = req.params;
    const { status, assignedTo, sub_status_id, workflow_steps } = req.body;
    const userId = req.user.id;
    const userRole = req.user.role;

    // Find the ticket with all grouped reports
    const ticket = await ReportTicket.findByPk(id, {
      include: [
        { model: Report, as: 'Reports', required: false, attributes: ['id'] },
        { model: TicketSubStatus, as: 'subStatus', attributes: ['id', 'name', 'color'] }
      ],
      attributes: ['id', 'status', 'sub_status_id', 'assigned_to', 'acknowledged_at', 'resolved_at', 'workflow_steps', 'report_id', 'createdAt', 'updatedAt'],
      transaction: t
    });

    if (!ticket) {
      await t.rollback();
      return res.status(404).json({
        success: false,
        message: 'Ticket not found'
      });
    }

    // Authorization check - use Reports (1:N) for ownership
    const reports = ticket.Reports || [];
    const isOwner = reports.some(r => r.user_id === userId);
    const isNiaStaff = ['nia_admin', 'nia_field_officer'].includes(userRole);
    const isAssigned = ticket.assignedTo === userId;
    const isIaAdmin = userRole === 'ia_admin';

    // Only NIA staff, assigned user, owner, or IA admin can update
    if (!isNiaStaff && !isAssigned && !isOwner && !isIaAdmin) {
      await t.rollback();
      return res.status(403).json({
        success: false,
        message: 'Not authorized to update this ticket'
      });
    }

    // Build update data
    const updateData = {};
    
    // Status updates
    if (status) {
      // Prevent going back to pending after acknowledgment or rejection
      if (ticket.status !== 'pending' && ticket.status !== 'rejected' && status === 'pending') {
        await t.rollback();
        return res.status(400).json({
          success: false,
          message: 'Cannot revert ticket back to pending status after acknowledgment'
        });
      }

      // Validate status transition
      const validTransitions = {
        'pending': ['in_progress', 'rejected', 'closed'],
        'rejected': ['in_progress', 'closed'],
        'in_progress': ['closed', 'rejected'],
        'closed': ['in_progress'] // Can reopen
      };

      if (status !== ticket.status && !validTransitions[ticket.status]?.includes(status)) {
        await t.rollback();
        return res.status(400).json({
          success: false,
          message: `Invalid status transition from ${ticket.status} to ${status}`
        });
      }
      
      updateData.status = status;
      
      // Set timestamps for status changes
      if (status === 'in_progress' && ticket.status === 'pending') {
        updateData.acknowledged_at = new Date();
      }
      if (status === 'closed') {
        updateData.resolved_at = new Date();
      }
    }

    // Assignment updates (NIA admin, NIA field officer, or IA admin only)
    if (assignedTo !== undefined) {
      if (!isNiaStaff && !isIaAdmin) {
        await t.rollback();
        return res.status(403).json({
          success: false,
          message: 'Only NIA staff or IA admins can assign tickets'
        });
      }
      updateData.assignedTo = assignedTo;
    }

    // Sub-status updates (only when status is in_progress)
    if (sub_status_id !== undefined) {
      if (ticket.status !== 'in_progress' && status !== 'in_progress') {
        await t.rollback();
        return res.status(400).json({
          success: false,
          message: 'Sub-status can only be set when ticket is in_progress'
        });
      }

      if (sub_status_id) {
        const subStatus = await TicketSubStatus.findByPk(sub_status_id, { transaction: t });
        if (!subStatus) {
          await t.rollback();
          return res.status(400).json({
            success: false,
            message: 'Invalid sub-status'
          });
        }
      }
      updateData.sub_status_id = sub_status_id || null;
    }

    // Workflow steps updates (for tracking progress)
    if (workflow_steps !== undefined) {
      if (!Array.isArray(workflow_steps)) {
        await t.rollback();
        return res.status(400).json({
          success: false,
          message: 'Workflow steps must be an array'
        });
      }
      updateData.workflowSteps = workflow_steps;
    }

    // Store previous values before update for notification comparison
    const previousStatus = ticket._previousDataValues.status;
    const previousSubStatusId = ticket._previousDataValues.sub_status_id;
    
    console.log(`[TicketController] Updating ticket ${id}: status ${previousStatus} -> ${status}, sub_status ${previousSubStatusId} -> ${sub_status_id}`);

    // Update the ticket
    await ticket.update(updateData, { transaction: t });

    await t.commit();
    console.log(`[TicketController] Ticket ${id} updated successfully, triggering notifications`);

    // Send notifications after transaction commit (fire and forget but log errors)
    if (status && status !== previousStatus) {
      console.log(`[TicketController] Calling notifyTicketUpdate for ticket ${ticket.id}`);
      notifyTicketUpdate(ticket, previousStatus, status).catch(err => 
        console.error('Notification error (status change):', err)
      );
    }

    if (sub_status_id !== undefined && sub_status_id !== previousSubStatusId) {
      console.log(`[TicketController] Calling notifySubStatusChange for ticket ${ticket.id}`);
      notifySubStatusChange(ticket, previousSubStatusId, sub_status_id || null).catch(err => 
        console.error('Notification error (sub-status change):', err)
      );
    }

    // Fetch updated ticket
    const updatedTicket = await ReportTicket.findByPk(id, {
      include: [
        {
          model: Report,
          as: 'Report',
          include: [
            {
              model: User,
              as: 'User',
              attributes: ['id', 'first_name', 'last_name', 'email', 'role', 'profile_image_url']
            }
          ]
        },
        {
          model: User,
          as: 'assignedUser',
          attributes: ['id', 'first_name', 'last_name', 'email', 'role', 'profile_image_url']
        },
        {
          model: TicketSubStatus,
          as: 'subStatus',
          attributes: ['id', 'name', 'slug', 'color']
        }
      ]
    });

    res.status(200).json({
      success: true,
      message: 'Ticket updated successfully',
      data: updatedTicket
    });
  } catch (error) {
    if (t && !t.finished) {
      await t.rollback();
    }
    console.error('Update ticket error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to update ticket'
    });
  }
};

// Add comment to ticket
const addComment = async (req, res) => {
  const t = await sequelize.transaction();

  try {
    const { id } = req.params;
    const { comment, isInternal = false } = req.body;
    const userId = req.user.id;
    const userRole = req.user.role;

    if (!comment || comment.trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'Comment is required'
      });
    }

    // Find the ticket with report info
    const ticket = await ReportTicket.findByPk(id, {
      include: [{ model: Report, as: 'Reports', required: false }],
      transaction: t
    });

    if (!ticket) {
      await t.rollback();
      return res.status(404).json({
        success: false,
        message: 'Ticket not found'
      });
    }

    // Authorization check - use Reports (1:N) for ownership
    const reports = ticket.Reports || [];
    const isOwner = reports.some(r => r.user_id === userId);
    const isSameIA = reports.some(r => r.ia_id === req.user.ia_id);
    const isNiaStaff = ['nia_admin', 'nia_field_officer'].includes(userRole);
    const isAssigned = ticket.assignedTo === userId;

    if (!isOwner && !isSameIA && !isNiaStaff && !isAssigned) {
      await t.rollback();
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    // Only NIA staff can add internal comments
    if (isInternal && !isNiaStaff) {
      await t.rollback();
      return res.status(403).json({
        success: false,
        message: 'Only NIA staff can add internal comments'
      });
    }

    // Add comment to array
    const newComment = {
      userId,
      comment: comment.trim(),
      isInternal,
      createdAt: new Date().toISOString()
    };

    const updatedComments = [...(ticket.comments || []), newComment];

    await ticket.update({ comments: updatedComments }, { transaction: t });

    // Send notification about new comment
    const commenterName = `${req.user.first_name} ${req.user.last_name}`;
    notifyNewComment(ticket, newComment, commenterName);

    await t.commit();

    res.status(201).json({
      success: true,
      message: 'Comment added successfully',
      data: {
        comment: newComment,
        totalComments: updatedComments.length
      }
    });
  } catch (error) {
    if (t && !t.finished) {
      await t.rollback();
    }
    console.error('Add comment error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to add comment'
    });
  }
};

// Delete ticket (NIA admin only)
const deleteTicket = async (req, res) => {
  const t = await sequelize.transaction();

  try {
    const { id } = req.params;

    const ticket = await ReportTicket.findByPk(id, { transaction: t });

    if (!ticket) {
      await t.rollback();
      return res.status(404).json({
        success: false,
        message: 'Ticket not found'
      });
    }

    // Soft delete the ticket
    await ticket.destroy({ transaction: t });

    await t.commit();

    res.status(200).json({
      success: true,
      message: 'Ticket deleted successfully'
    });
  } catch (error) {
    if (t && !t.finished) {
      await t.rollback();
    }
    console.error('Delete ticket error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to delete ticket'
    });
  }
};

module.exports = {
  getAllTickets,
  getTicketById,
  createTicket,
  updateTicket,
  addComment,
  deleteTicket
};
