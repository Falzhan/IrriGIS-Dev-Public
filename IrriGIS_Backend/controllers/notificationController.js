const { Notification, User, ReportTicket, Report, TicketSubStatus } = require('../models');
const { Op } = require('sequelize');

const getNotifications = async (req, res) => {
  try {
    const { page = 1, limit = 20, is_read, type } = req.query;
    const offset = (page - 1) * limit;

    const where = { user_id: req.user.id };
    if (is_read !== undefined) where.is_read = is_read === 'true';
    if (type) where.type = type;

    const { count, rows: notifications } = await Notification.findAndCountAll({
      where,
      include: [
        {
          model: ReportTicket,
          as: 'relatedTicket',
          attributes: ['id', 'status']
        }
      ],
      order: [['created_at', 'DESC']],
      limit: parseInt(limit),
      offset
    });

    const unreadCount = await Notification.count({
      where: { user_id: req.user.id, is_read: false }
    });

    res.json({
      success: true,
      data: notifications,
      unread_count: unreadCount,
      pagination: {
        total: count,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(count / limit)
      }
    });
  } catch (error) {
    console.error('Get notifications error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

const getUnreadCount = async (req, res) => {
  try {
    const count = await Notification.count({
      where: { user_id: req.user.id, is_read: false }
    });

    res.json({ success: true, data: { unread_count: count } });
  } catch (error) {
    console.error('Get unread count error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

const markAsRead = async (req, res) => {
  try {
    const { id } = req.params;

    const notification = await Notification.findOne({
      where: { id, user_id: req.user.id }
    });

    if (!notification) {
      return res.status(404).json({ success: false, message: 'Notification not found' });
    }

    notification.is_read = true;
    await notification.save();

    res.json({ success: true, message: 'Notification marked as read' });
  } catch (error) {
    console.error('Mark as read error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

const markAllAsRead = async (req, res) => {
  try {
    await Notification.update(
      { is_read: true },
      { where: { user_id: req.user.id, is_read: false } }
    );

    res.json({ success: true, message: 'All notifications marked as read' });
  } catch (error) {
    console.error('Mark all as read error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

const deleteNotification = async (req, res) => {
  try {
    const { id } = req.params;

    const notification = await Notification.findOne({
      where: { id, user_id: req.user.id }
    });

    if (!notification) {
      return res.status(404).json({ success: false, message: 'Notification not found' });
    }

    await notification.destroy();

    res.json({ success: true, message: 'Notification deleted' });
  } catch (error) {
    console.error('Delete notification error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

const createNotification = async (user_id, type, title, message, relatedTicketId = null, relatedReportId = null) => {
  try {
    console.log(`[createNotification] Creating: user=${user_id}, type=${type}, ticketId=${relatedTicketId}, reportId=${relatedReportId}`);
    const notification = await Notification.create({
      user_id,
      type,
      title,
      message,
      relatedTicketId,
      relatedReportId
    });
    console.log(`[createNotification] SUCCESS: notification id=${notification.id}`);
    return notification;
  } catch (error) {
    console.error('[createNotification] ERROR:', error);
    return null;
  }
};

const notifyTicketUpdate = async (ticket, oldStatus, newStatus) => {
  try {
    console.log(`[Notification] Status change for ticket ${ticket.id}: ${oldStatus} -> ${newStatus}`);
    console.log(`[Notification] Ticket object keys:`, Object.keys(ticket));
    
    // Get ALL reports linked to this ticket (grouped reports)
    console.log(`[Notification] Querying reports with ticket_id = ${ticket.id}`);
    const reports = await Report.findAll({
      where: { ticket_id: ticket.id }
    });

    console.log(`[Notification] Found ${reports?.length || 0} reports for ticket ${ticket.id}`);
    if (reports.length > 0) {
      console.log(`[Notification] First report:`, { id: reports[0].id, user_id: reports[0].user_id, ticket_id: reports[0].ticket_id });
    }
    
    if (!reports || reports.length === 0) {
      console.log(`[Notification] No reports found with ticket_id=${ticket.id}, trying raw query...`);
      // Try to debug what reports exist
      const allReports = await Report.findAll({ limit: 5, attributes: ['id', 'ticket_id', 'user_id'] });
      console.log(`[Notification] Sample reports in DB:`, allReports.map(r => ({ id: r.id, ticket_id: r.ticket_id, user_id: r.user_id })));
      return;
    }

    let title = '';
    let message = '';
    let type = '';

    if (newStatus === 'in_progress') {
      title = 'Report Acknowledged';
      type = 'ticket_in_progress';
    } else if (newStatus === 'closed') {
      title = 'Issue Resolved';
      type = 'ticket_closed';
    } else if (newStatus === 'rejected') {
      title = 'Report Rejected';
      type = 'ticket_rejected';
    } else if (oldStatus !== newStatus) {
      title = 'Ticket Status Updated';
      type = 'ticket_updated';
    }

    // Notify each user who submitted a report for this ticket
    const notifiedUsers = new Set();
    let createdCount = 0;
    for (const report of reports) {
      if (report.user_id && !notifiedUsers.has(report.user_id)) {
        notifiedUsers.add(report.user_id);
        
        // Customize message based on single vs multiple reports
        if (reports.length === 1) {
          if (newStatus === 'in_progress') {
            message = `Your report (ID: ${report.id.slice(0, 8)}) has been acknowledged and is now in progress.`;
          } else if (newStatus === 'closed') {
            message = `Your report (ID: ${report.id.slice(0, 8)}) has been resolved and the ticket is now closed.`;
          } else if (newStatus === 'rejected') {
            message = `Your report (ID: ${report.id.slice(0, 8)}) has been rejected.`;
          } else {
            message = `Your report ticket status changed from ${oldStatus} to ${newStatus}.`;
          }
        } else {
          // Multiple reports in this ticket
          if (newStatus === 'in_progress') {
            message = `Your report and ${reports.length - 1} other(s) have been acknowledged and are now in progress.`;
          } else if (newStatus === 'closed') {
            message = `Your report and ${reports.length - 1} other(s) have been resolved. The ticket is now closed.`;
          } else if (newStatus === 'rejected') {
            message = `Your report and ${reports.length - 1} other(s) have been rejected.`;
          } else {
            message = `Your ticket status changed from ${oldStatus} to ${newStatus}. This ticket contains ${reports.length} reports.`;
          }
        }

        const notif = await createNotification(report.user_id, type, title, message, ticket.id, report.id);
        if (notif) createdCount++;
        console.log(`[Notification] Created notification for user ${report.user_id}: ${notif ? 'SUCCESS' : 'FAILED'}`);
      }
    }
    console.log(`[Notification] Created ${createdCount} notifications for ${notifiedUsers.size} unique users`);

  } catch (error) {
    console.error('Notify ticket update error:', error);
  }
};

const notifyNewComment = async (ticket, comment, commenterName) => {
  try {
    // Get ALL reports linked to this ticket (grouped reports)
    const reports = await Report.findAll({
      where: { ticket_id: ticket.id },
      include: [{ model: User, as: 'user' }]
    });

    if (!reports || reports.length === 0) return;

    // Notify each unique user who submitted a report for this ticket
    const notifiedUsers = new Set();
    for (const report of reports) {
      if (report.user_id && report.user_id !== comment.user_id && !notifiedUsers.has(report.user_id)) {
        notifiedUsers.add(report.user_id);
        
        const title = reports.length === 1 
          ? 'New Comment on Your Report'
          : 'New Comment on Your Grouped Report';
        const message = reports.length === 1
          ? `${commenterName} commented on your report: "${comment.comment.substring(0, 100)}..."`
          : `${commenterName} commented on ticket with your report and ${reports.length - 1} other(s): "${comment.comment.substring(0, 100)}..."`;
        
        await createNotification(
          report.user_id,
          'ticket_comment',
          title,
          message,
          ticket.id,
          report.id
        );
      }
    }

    // Notify assigned user if different from commenter
    if (ticket.assignedTo && ticket.assignedTo !== comment.user_id && !notifiedUsers.has(ticket.assignedTo)) {
      await createNotification(
        ticket.assignedTo,
        'ticket_comment',
        'New Comment on Assigned Ticket',
        `${commenterName} commented on ticket with ${reports.length} report(s): "${comment.comment.substring(0, 100)}..."`,
        ticket.id,
        reports[0]?.id
      );
    }
  } catch (error) {
    console.error('Notify new comment error:', error);
  }
};

const notifyNewReport = async (report) => {
  try {
    const adminUsers = await User.findAll({
      where: { role: 'nia_admin', is_active: true }
    });

    // Get location display - use location_name if available, otherwise try to extract coordinates
    let locationDisplay = 'Unknown location';
    if (report.location_name) {
      locationDisplay = report.location_name;
    } else if (report.location) {
      // Handle PostGIS geometry - Sequelize returns it as GeoJSON-like object
      // or we can use the stored coordinates
      try {
        const lat = report.latitude || (report.location.coordinates && report.location.coordinates[1]);
        const lon = report.longitude || (report.location.coordinates && report.location.coordinates[0]);
        if (lat && lon) {
          locationDisplay = `${lat.toFixed(4)}, ${lon.toFixed(4)}`;
        }
      } catch (e) {
        locationDisplay = 'Location available';
      }
    }

    for (const admin of adminUsers) {
      await createNotification(
        admin.id,
        'new_report',
        'New Report Submitted',
        `A new ${report.category} report has been submitted. Location: ${locationDisplay}`,
        null,
        report.id
      );
    }
  } catch (error) {
    console.error('Notify new report error:', error);
  }
};

// Notify submitters when sub-status changes (workflow progress)
const notifySubStatusChange = async (ticket, oldSubStatusId, newSubStatusId) => {
  try {
    console.log(`[SubStatusNotification] Sub-status change for ticket ${ticket.id}: ${oldSubStatusId} -> ${newSubStatusId}`);
    
    // Only notify if sub-status actually changed
    if (oldSubStatusId === newSubStatusId) {
      console.log(`[SubStatusNotification] No change detected, skipping`);
      return;
    }

    // Get new sub-status details
    let newSubStatus = null;
    if (newSubStatusId) {
      newSubStatus = await TicketSubStatus.findByPk(newSubStatusId);
      console.log(`[SubStatusNotification] New sub-status: ${newSubStatus?.name || 'None'}`);
    }

    // Get ALL reports linked to this ticket
    const reports = await Report.findAll({
      where: { ticket_id: ticket.id }
    });

    console.log(`[SubStatusNotification] Found ${reports?.length || 0} reports for ticket ${ticket.id}`);
    
    if (!reports || reports.length === 0) {
      console.log(`[SubStatusNotification] No reports found, skipping notifications`);
      return;
    }

    const subStatusName = newSubStatus ? newSubStatus.name : 'None';
    const title = 'Ticket Progress Update';
    
    // Notify each unique user who submitted a report
    const notifiedUsers = new Set();
    let createdCount = 0;
    for (const report of reports) {
      if (report.user_id && !notifiedUsers.has(report.user_id)) {
        notifiedUsers.add(report.user_id);
        
        const message = reports.length === 1
          ? `Your report (ID: ${report.id.slice(0, 8)}) has progressed to: "${subStatusName}".`
          : `Your report and ${reports.length - 1} other(s) have progressed to: "${subStatusName}".`;

        const notif = await createNotification(
          report.user_id,
          'sub_status_update',
          title,
          message,
          ticket.id,
          report.id
        );
        if (notif) createdCount++;
      }
    }
    console.log(`[SubStatusNotification] Created ${createdCount} notifications for ${notifiedUsers.size} unique users`);
  } catch (error) {
    console.error('Notify sub-status change error:', error);
  }
};

// Notify admins when a new inactive user is registered
const notifyNewUserPendingActivation = async (user) => {
  try {
    console.log(`[NewUserNotification] New inactive user registered: ${user.email}, role: ${user.role}, ia_id: ${user.ia_id}`);
    
    // Only notify if user is inactive
    if (user.is_active) {
      console.log(`[NewUserNotification] User is active, skipping notification`);
      return;
    }

    // Get admins to notify based on user role and IA
    let adminUsers = [];
    
    if (user.role === 'ia_admin' || user.role === 'ia_member') {
      // For IA users, notify both NIA admins and IA admins of the same IA
      const niaAdmins = await User.findAll({
        where: { role: 'nia_admin', is_active: true }
      });
      
      // Notify IA admins of the same IA
      let iaAdmins = [];
      if (user.ia_id) {
        iaAdmins = await User.findAll({
          where: { 
            role: 'ia_admin', 
            is_active: true,
            ia_id: user.ia_id
          }
        });
      }
      
      adminUsers = [...niaAdmins, ...iaAdmins];
    } else {
      // For NIA users, only notify NIA admins
      adminUsers = await User.findAll({
        where: { role: 'nia_admin', is_active: true }
      });
    }

    console.log(`[NewUserNotification] Found ${adminUsers.length} admins to notify`);

    const userName = `${user.first_name} ${user.last_name}`;
    const userRole = user.role.replace('_', ' ').toUpperCase();
    
    for (const admin of adminUsers) {
      // Skip notifying the user themselves if they happen to be an admin
      if (admin.id === user.id) continue;
      
      const message = user.ia_id 
        ? `New ${userRole} pending activation: ${userName} (${user.email}) from ${user.irrigatorAssociation?.name || 'Unknown IA'}. Please review and activate.`
        : `New ${userRole} pending activation: ${userName} (${user.email}). Please review and activate.`;
      
      await createNotification(
        admin.id,
        'new_user_pending',
        'New User Pending Activation',
        message,
        null,
        user.id
      );
    }
    
    console.log(`[NewUserNotification] Created notifications for new inactive user`);
  } catch (error) {
    console.error('Notify new user pending activation error:', error);
  }
};

module.exports = {
  getNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  createNotification,
  notifyTicketUpdate,
  notifyNewComment,
  notifyNewReport,
  notifySubStatusChange,
  notifyNewUserPendingActivation
};