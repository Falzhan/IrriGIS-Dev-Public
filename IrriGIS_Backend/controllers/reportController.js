const { Report, ReportImage, User, AuditLog, ReportTicket, TicketSettings, TicketSubStatus, IrrigatorAssociation, sequelize } = require('../models');
const { Op } = require('sequelize');
const { notifyNewReport } = require('./notificationController');
const { uploadMultipleToSupabase } = require('../middleware/supabaseUpload');
const https = require('https');

const WATER_INT_TO_STR = { '1': 'dry', '2': 'low', '3': 'normal', '4': 'high', '5': 'overflow' };
const SILT_INT_TO_STR = { '1': 'clean', '2': 'light', '3': 'normal', '4': 'dirty', '5': 'heavily_silted' };
const DEBRIS_INT_TO_STR = { '1': 'clear', '2': 'light', '3': 'normal', '4': 'heavy', '5': 'blocked' };

const convertLevel = (value, map) => {
  if (!value) return 'normal';
  if (typeof value === 'string' && map[value]) return map[value];
  if (typeof value === 'number' && map[value.toString()]) return map[value.toString()];
  return value;
};

const findMatchingTicket = async (newReport, settings) => {
  if (!settings || !settings.auto_group_enabled) return null;
  
  const thresholdMeters = settings.proximity_threshold_meters || 50;
  const thresholdDegrees = thresholdMeters / 111320;
  
  const createdAt = newReport.createdAt || new Date();
  const dayStart = new Date(createdAt);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(createdAt);
  dayEnd.setHours(23, 59, 59, 999);
  
  const locationJSON = JSON.stringify(newReport.location);
  
  // Build where clause dynamically to handle null gis_feature_id properly
  const whereClause = {
    category: newReport.category,
    createdAt: { [Op.between]: [dayStart, dayEnd] },
    id: { [Op.ne]: newReport.id }
  };
  
  // Handle gis_feature_id - only add to where clause if it has a value
  // For null values, we use a different approach to avoid Sequelize issues
  if (newReport.gis_feature_id) {
    whereClause.gis_feature_id = newReport.gis_feature_id;
  }
  
  const similarReports = await Report.findAll({
    include: [{
      model: ReportTicket,
      as: 'ticket',
      where: {
        status: { [Op.in]: ['pending', 'in_progress'] }
      }
    }],
    where: {
      [Op.and]: [
        whereClause,
        sequelize.where(
          sequelize.fn('ST_Dwithin',
            sequelize.col('location'),
            sequelize.fn('ST_GeomFromGeoJSON', locationJSON),
            thresholdDegrees
          ),
          true
        )
      ]
    },
    order: [['createdAt', 'ASC']],
    limit: 1
  });
  
  return similarReports.length > 0 ? similarReports[0].ticket : null;
};

// Enrich location_name via Nominatim reverse geocoding (delayed, non-blocking)
const enrichLocationName = (reportId, lat, lon, originalLocationName) => {
  // Delay 2 seconds to avoid Nominatim rate limits and let the initial response return quickly
  setTimeout(async () => {
    try {
      const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=18&addressdetails=1`;
      const response = await new Promise((resolve, reject) => {
        const req = https.get(url, { headers: { 'User-Agent': 'IrriGIS-App/1.0' } }, (res) => {
          let data = '';
          res.on('data', (chunk) => data += chunk);
          res.on('end', () => resolve({ status: res.statusCode, body: data }));
        });
        req.on('error', reject);
        req.setTimeout(5000, () => { req.destroy(); reject(new Error('Nominatim request timeout')); });
      });

      if (response.status !== 200) {
        console.log(`Nominatim returned status ${response.status} for report ${reportId}, keeping original location_name`);
        return;
      }

      const data = JSON.parse(response.body);
      if (!data || !data.display_name) {
        console.log(`No display_name in Nominatim response for report ${reportId}, keeping original`);
        return;
      }

      // Parse the address object for a structured location name
      const addr = data.address || {};
      const parts = [];
      const road = addr.road || addr.footway || addr.pedestrian || addr.highway || null;
      const neighbourhood = addr.neighbourhood || addr.quarter || addr.suburb || null;
      const village = addr.village || addr.hamlet || addr.residential || null;
      const city = addr.city || addr.town || addr.municipality || null;
      const county = addr.county || addr.state_district || null;

      if (road) parts.push(road);
      if (neighbourhood && neighbourhood !== road) parts.push(neighbourhood);
      if (village && village !== road && village !== neighbourhood) parts.push(village);

      const localPart = parts.join(', ');
      let enrichedName = null;

      if (localPart && city) {
        enrichedName = `${localPart}, ${city}`;
      } else if (localPart) {
        enrichedName = localPart;
      } else if (city) {
        enrichedName = city;
      } else if (county) {
        enrichedName = county;
      }

      if (!enrichedName) {
        console.log(`Could not parse structured location for report ${reportId}, keeping original`);
        return;
      }

      // Only update if the enriched name is meaningfully different
      if (!originalLocationName || enrichedName !== originalLocationName) {
        await Report.update(
          { location_name: enrichedName },
          { where: { id: reportId } }
        );
        console.log(`Enriched location_name for report ${reportId}: "${enrichedName}" (was: "${originalLocationName || 'null'}")`);
      }
    } catch (error) {
      console.error(`Nominatim enrichment failed for report ${reportId}:`, error.message);
      // Silently fail — original location_name from the App is preserved
    }
  }, 2000); // 2-second delay
};

// Create a new report
const createReport = async (req, res) => {
  // Start transaction
  const t = await sequelize.transaction();

  try {
    const {
      category,
      water_level,
      silt_level,
      debris_level,
      remarks, 
      latitude,
      longitude,
      captions,
      gis_feature_id,
      location_name
    } = req.body;

    // 2. Prepare Location
    const locationData = { 
      type: 'Point', 
      coordinates: [parseFloat(longitude), parseFloat(latitude)] 
    };

    const reportData = {
      user_id: req.user.id,
      ia_id: req.user.ia_id,
      category: category || 'inspection',
      water_level: convertLevel(water_level, WATER_INT_TO_STR) || 'normal',
      silt_level: convertLevel(silt_level, SILT_INT_TO_STR) || 'normal',
      debris_level: convertLevel(debris_level, DEBRIS_INT_TO_STR) || 'normal',
      remarks: remarks, 
      location: locationData,
      location_name: location_name,
      status: 'Pending',
      gis_feature_id: gis_feature_id || null
    };
    
    // 3. Create Report Record
    const report = await Report.create(reportData, { transaction: t });

    // 4. Get ticket settings for grouping logic
    const ticketSettings = await TicketSettings.findOne();
    
    // 5. Try to find matching ticket (or create new one) - ONLY for 'issue' category
    let ticket = null;
    if (category === 'issue') {
      const matchingTicket = await findMatchingTicket(report, ticketSettings);
      
      if (matchingTicket) {
        ticket = matchingTicket;
        await report.update({ ticketId: ticket.id }, { transaction: t });
      } else {
        ticket = await ReportTicket.create({
          reportId: report.id,
          status: 'pending',
          assignedTo: null,
          workflowSteps: [],
          comments: []
        }, { transaction: t });
        await report.update({ ticketId: ticket.id }, { transaction: t });
      }
    }

    // 5. Handle Multiple Images with Supabase
    // Ensure req.files is always an array (React Native sometimes sends single file as object)
    const files = Array.isArray(req.files) ? req.files : (req.files ? [req.files] : []);
    if (files.length > 0) {
      // Ensure captions is an array even if 1 or 0 were sent
      const captionList = Array.isArray(captions) ? captions : (captions ? [captions] : []);

      // Upload files to Supabase and get URLs
      const imageUrls = await uploadMultipleToSupabase(files, req.user.id);

      // Create ReportImage records with Supabase URLs
      const imagePromises = imageUrls.map((imageUrl, index) => {
        return ReportImage.create({
          reportId: report.id,        // Matches Model JS definition
          imageUrl: imageUrl,         // Supabase URL instead of local path
          isPrimary: index === 0,     // First image is primary
          caption: captionList[index] || `Report Image ${index + 1}`
        }, { transaction: t });
      });

      await Promise.all(imagePromises);
    }

    // 6. Commit
    await t.commit();

    // 7. Fetch complete data for response
    const finalReport = await Report.findByPk(report.id, {
      include: [{ model: ReportImage, as: 'images' }] 
    });

// 8. Notify admins about new report
     notifyNewReport(finalReport);

     // 9. Backend Nominatim enrichment (non-blocking, 2-second delay)
     if (latitude && longitude) {
       enrichLocationName(report.id, parseFloat(latitude), parseFloat(longitude), location_name);
     }

     // 10. Audit log for report creation (after commit to ensure record exists)
    await AuditLog.create({
      userId: req.user?.id || null,
      action: 'CREATE',
      tableName: 'reports',
      recordId: report.id,
      newData: reportData
    });

    res.status(201).json({ success: true, report: finalReport });

  } catch (error) {
    if (t && !t.finished) {
      await t.rollback();
    }
    console.error('Create report error:', error);
    res.status(400).json({ 
      success: false, 
      message: error.message 
    });
  }
};

// Get all reports with pagination, filtering, and role-based access
const getAllReports = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      category,
      status,
      water_level,
      silt_level,
      debris_level,
      startDate,
      endDate,
      sortBy = 'createdAt',
      sortOrder = 'DESC',
      gis_feature_id
    } = req.query;

    // Build where clause
    const whereClause = {};
    
    if (category) whereClause.category = category;
    if (water_level) whereClause.water_level = water_level;
    if (silt_level) whereClause.silt_level = silt_level;
    if (debris_level) whereClause.debris_level = debris_level;
    if (gis_feature_id) whereClause.gis_feature_id = gis_feature_id;
    
    // Date range filtering
    if (startDate || endDate) {
      whereClause.createdAt = {};
      if (startDate) whereClause.createdAt[Op.gte] = new Date(startDate);
      if (endDate) whereClause.createdAt[Op.lte] = new Date(endDate);
    }

    // Role-based access control
    const userRole = req.user.role;
    const userId = req.user.id;
    const userIaId = req.user.ia_id;

    if (userRole === 'ia_member') {
      // IA members can see their own reports + IA reports
      whereClause[Op.or] = [
        { user_id: userId },
        { ia_id: userIaId }
      ];
    } else if (userRole === 'ia_admin') {
      // IA admins can see all reports from their IA
      whereClause.ia_id = userIaId;
    }
    // NIA staff (nia_admin, nia_field_officer) can see all reports

    // Calculate pagination
    const offset = (parseInt(page) - 1) * parseInt(limit);

    const { count, rows: reports } = await Report.findAndCountAll({
      where: whereClause,
      include: [
        {
          model: ReportImage,
          as: 'images',
          attributes: ['id', 'imageUrl', 'isPrimary', 'caption', 'createdAt']
        },
        {
          model: User,
          as: 'User',
          attributes: ['id', 'first_name', 'last_name', 'email', 'role', 'profile_image_url']
        },
        {
          model: ReportTicket,
          as: 'ticket',
          attributes: ['id', 'status', 'sub_status_id', 'assigned_to', 'acknowledged_at', 'resolved_at', 'workflow_steps', 'report_id', 'createdAt'],
          include: [
            {
              model: TicketSubStatus,
              as: 'subStatus',
              attributes: ['id', 'name', 'color']
            },
            {
              model: User,
              as: 'assignedUser',
              attributes: ['id', 'first_name', 'last_name']
            }
          ]
        },
        {
          model: IrrigatorAssociation,
          as: 'IrrigatorAssociation',
          attributes: ['id', 'name']
        }
      ],
      attributes: ['id', 'user_id', 'ia_id', 'category', 'water_level', 'silt_level', 'debris_level', 'remarks', 'location', 'location_name', 'gis_feature_id', 'ticket_id', 'is_valid', 'invalid_reason', 'createdAt', 'updatedAt'],
      order: [[sortBy, sortOrder.toUpperCase()]],
      limit: parseInt(limit),
      offset: offset
    });

    const totalPages = Math.ceil(count / parseInt(limit));

    res.status(200).json({
      success: true,
      data: {
        reports,
        pagination: {
          total: count,
          totalPages,
          currentPage: parseInt(page),
          limit: parseInt(limit)
        }
      }
    });
  } catch (error) {
    console.error('Get all reports error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch reports'
    });
  }
};

// Get single report by ID
const getReportById = async (req, res) => {
  try {
    const { id } = req.params;
    const userRole = req.user.role;
    const userId = req.user.id;
    const userIaId = req.user.ia_id;

    const report = await Report.findByPk(id, {
      attributes: ['id', 'user_id', 'ia_id', 'category', 'water_level', 'silt_level', 'debris_level', 'remarks', 'location', 'location_name', 'gis_feature_id', 'ticket_id', 'is_valid', 'invalid_reason', 'createdAt', 'updatedAt'],
      include: [
        {
          model: ReportImage,
          as: 'images',
          attributes: ['id', 'imageUrl', 'isPrimary', 'caption', 'createdAt']
        },
        {
          model: User,
          as: 'User',
          attributes: ['id', 'first_name', 'last_name', 'email', 'role', 'profile_image_url']
        },
        {
          model: ReportTicket,
          as: 'ticket',
          attributes: ['id', 'status', 'sub_status_id', 'assigned_to', 'acknowledged_at', 'resolved_at', 'workflow_steps', 'report_id', 'createdAt'],
          include: [
            {
              model: TicketSubStatus,
              as: 'subStatus',
              attributes: ['id', 'name', 'color']
            },
            {
              model: User,
              as: 'assignedUser',
              attributes: ['id', 'first_name', 'last_name']
            }
          ]
        },
        {
          model: ReportTicket,
          as: 'ReportTickets',
          attributes: ['id', 'status', 'sub_status_id', 'assigned_to', 'acknowledged_at', 'resolved_at', 'workflow_steps', 'report_id', 'createdAt'],
          include: [
            {
              model: TicketSubStatus,
              as: 'subStatus',
              attributes: ['id', 'name', 'color']
            }
          ]
        },
        {
          model: IrrigatorAssociation,
          as: 'IrrigatorAssociation',
          attributes: ['id', 'name']
        }
      ]
    });

    if (!report) {
      return res.status(404).json({
        success: false,
        message: 'Report not found'
      });
    }

    // Authorization check
    const isOwner = report.user_id === userId;
    const isSameIA = report.ia_id === userIaId;
    const isNiaStaff = ['nia_admin', 'nia_field_officer'].includes(userRole);

    if (!isOwner && !isSameIA && !isNiaStaff) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    res.status(200).json({
      success: true,
      data: report
    });
  } catch (error) {
    console.error('Get report error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch report'
    });
  }
};

// Update report
const updateReport = async (req, res) => {
  const t = await sequelize.transaction();

  try {
    const { id } = req.params;
    const {
      category,
      water_level,
      silt_level,
      debris_level,
      remarks,
      latitude,
      longitude,
      captions,
      deleteImageIds, // Array of image IDs to delete
      is_valid, // For marking report as invalid/spam
      invalid_reason, // Reason for invalidation
      ticket_id // For merging/unmerging reports to tickets
    } = req.body;

    const userId = req.user.id;
    const userRole = req.user.role;

    // Find the report
    const report = await Report.findByPk(id, {
      include: [{ model: ReportImage, as: 'images' }],
      transaction: t
    });

    if (!report) {
      await t.rollback();
      return res.status(404).json({
        success: false,
        message: 'Report not found'
      });
    }

    // Authorization: Only owner or NIA admin can update
    const isOwner = report.user_id === userId;
    const isNiaAdmin = userRole === 'nia_admin';

    if (!isOwner && !isNiaAdmin) {
      await t.rollback();
      return res.status(403).json({
        success: false,
        message: 'Not authorized to update this report'
      });
    }

    // Build update data
    const updateData = {};
    if (category) updateData.category = category;
    if (water_level) updateData.water_level = convertLevel(water_level, WATER_INT_TO_STR);
    if (silt_level) updateData.silt_level = convertLevel(silt_level, SILT_INT_TO_STR);
    if (debris_level) updateData.debris_level = convertLevel(debris_level, DEBRIS_INT_TO_STR);
    if (remarks !== undefined) updateData.remarks = remarks;
    if (is_valid !== undefined) updateData.is_valid = is_valid;
    if (invalid_reason !== undefined) updateData.invalid_reason = invalid_reason;
    if (ticket_id !== undefined) updateData.ticketId = ticket_id || null;
    
    // Update location if both lat and long provided
    if (latitude && longitude) {
      updateData.location = {
        type: 'Point',
        coordinates: [parseFloat(longitude), parseFloat(latitude)]
      };
    }

    // Update the report
    await report.update(updateData, { transaction: t });

    // Handle image deletions
    if (deleteImageIds && deleteImageIds.length > 0) {
      const idsToDelete = Array.isArray(deleteImageIds) ? deleteImageIds : [deleteImageIds];
      
      await ReportImage.destroy({
        where: {
          id: idsToDelete,
          reportId: id
        },
        transaction: t
      });
    }

    // Handle new image uploads
    // Ensure req.files is always an array (React Native sometimes sends single file as object)
    const files = Array.isArray(req.files) ? req.files : (req.files ? [req.files] : []);
    if (files.length > 0) {
      const captionList = Array.isArray(captions) ? captions : (captions ? [captions] : []);

      // Check if there are existing images to determine if new images should be primary
      const existingImages = await ReportImage.count({
        where: { reportId: id },
        transaction: t
      });

      const imagePromises = files.map((file, index) => {
        const imagePath = `/uploads/${file.filename}`;
        
        return ReportImage.create({
          reportId: id,
          imageUrl: imagePath,
          isPrimary: existingImages === 0 && index === 0, // Only primary if no existing images
          caption: captionList[index] || `Report Image ${index + 1}`
        }, { transaction: t });
      });

      await Promise.all(imagePromises);
    }

    // Commit transaction
    await t.commit();

    // Fetch updated report
    const updatedReport = await Report.findByPk(id, {
      include: [
        { model: ReportImage, as: 'images' },
        { model: User, as: 'User', attributes: ['id', 'first_name', 'last_name', 'email'] }
      ]
    });

    res.status(200).json({
      success: true,
      message: 'Report updated successfully',
      data: updatedReport
    });
  } catch (error) {
    if (t && !t.finished) {
      await t.rollback();
    }
    console.error('Update report error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to update report'
    });
  }
};

// Delete report (soft delete)
const deleteReport = async (req, res) => {
  const t = await sequelize.transaction();

  try {
    const { id } = req.params;

    const report = await Report.findByPk(id, { transaction: t });

    if (!report) {
      await t.rollback();
      return res.status(404).json({
        success: false,
        message: 'Report not found'
      });
    }

    // Soft delete the report (paranoid mode)
    await report.destroy({ transaction: t });

    // Associated images will be soft deleted via CASCADE
    await t.commit();

    res.status(200).json({
      success: true,
      message: 'Report deleted successfully'
    });
  } catch (error) {
    if (t && !t.finished) {
      await t.rollback();
    }
    console.error('Delete report error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to delete report'
    });
  }
};

module.exports = {
  createReport,
  getAllReports,
  getReport: getReportById,
  updateReport,
  deleteReport
};