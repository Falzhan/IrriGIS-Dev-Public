const { Report, ReportImage, ReportTicket, User, IrrigatorAssociation, RiverIrrigationSystem, GISFeature, sequelize } = require('../models');
const { Op } = require('sequelize');

const includeOptions = [
  { 
    model: ReportTicket, 
    as: 'ReportTickets',
    required: false,
    paranoid: false
  },
  {
    model: User,
    as: 'User',
    attributes: ['id', 'first_name', 'last_name', 'email']
  },
  {
    model: IrrigatorAssociation,
    as: 'IrrigatorAssociation',
    attributes: ['id', 'name', 'code'],
    paranoid: false
  },
  {
    model: ReportImage,
    as: 'images',
    attributes: ['id', 'imageUrl', 'isPrimary', 'caption'],
    required: false,
    paranoid: false
  }
];

const getReportsGeoJSON = async (req, res) => {
  try {
    const {
      status,
      ris_id,
      ia_id,
      category,
      urgency,
      date_from,
      date_to,
      bounds,
      month,
      page = 1,
      limit = 100
    } = req.query;

    const where = {};
    const include = includeOptions.map(opt => ({ ...opt }));

    if (status) {
      const ticketIdx = include.findIndex(i => i.as === 'ReportTickets');
      if (ticketIdx >= 0) {
        include[ticketIdx].where = { status };
        include[ticketIdx].required = true;
      }
    }

    if (ris_id) where.ris_id = ris_id;
    if (ia_id) where.ia_id = ia_id;
    if (category) where.category = category;

    // Month filter - filter by reports.created_at
    if (month) {
      const [year, monthNum] = month.split('-').map(Number);
      const monthStart = new Date(year, monthNum - 1, 1);
      const monthEnd = new Date(year, monthNum, 0, 23, 59, 59, 999);

      where.created_at = {
        [Op.between]: [monthStart, monthEnd]
      };
    }

    if (date_from || date_to) {
      if (!where.created_at) where.created_at = {};
      if (date_from) where.created_at[Op.gte] = new Date(date_from);
      if (date_to) where.created_at[Op.lte] = new Date(date_to);
    }

    if (bounds) {
      const [minLng, minLat, maxLng, maxLat] = bounds.split(',').map(Number);
      where.location = {
        [Op.and]: [
          sequelize.where(
            sequelize.fn('ST_X', sequelize.col('location')),
            { [Op.between]: [minLng, maxLng] }
          ),
          sequelize.where(
            sequelize.fn('ST_Y', sequelize.col('location')),
            { [Op.between]: [minLat, maxLat] }
          )
        ]
      };
    }

    const offset = (page - 1) * limit;
    const { count, rows: reports } = await Report.findAndCountAll({
      where,
      include,
      attributes: ['id', 'user_id', 'ia_id', 'location', 'water_level', 'silt_level', 'debris_level', 'category', 'remarks', 'ris_id', 'gis_feature_id', 'is_valid', 'invalid_reason', 'location_name', 'created_at', 'updated_at', 'ticket_id'],
      limit: parseInt(limit),
      offset,
      order: [['created_at', 'DESC']]
    });

    let filteredReports = reports;
    if (urgency) {
      filteredReports = reports.filter(r => {
        const levelScore = getUrgencyScore(r.water_level, r.silt_level, r.debris_level);
        return urgency === 'high' ? levelScore >= 12 : levelScore < 12;
      });
    }

    const features = filteredReports.map(report => {
      const coords = report.location ?
        [report.location.coordinates[0], report.location.coordinates[1]] :
        [0, 0];

      const imageUrls = report.images ?
        report.images.map(img => img.imageUrl) : [];

      const ticket = report.ReportTickets && report.ReportTickets.length > 0
        ? report.ReportTickets[0]
        : null;

      // Debug logging for created_at
      console.log(`Report ${report.id}: created_at = ${report.created_at}, ticket_id = ${report.ticket_id}`);

      return {
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: coords
        },
        properties: {
          id: report.id,
          water_level: report.water_level,
          silt_level: report.silt_level,
          debris_level: report.debris_level,
          category: report.category,
          remarks: report.remarks,
          location_name: report.location_name,
          status: ticket ? ticket.status : 'no_ticket',
          ticket_id: report.ticket_id || (ticket ? ticket.id : null),
          report_id: ticket ? ticket.reportId : report.id,
          is_valid: report.is_valid,
          created_at: report.created_at ? new Date(report.created_at).toISOString() : null,
          createdAt: report.created_at ? new Date(report.created_at).toISOString() : null,
          updated_at: report.updated_at,
          reporter: report.User ? {
            id: report.User.id,
            name: `${report.User.first_name} ${report.User.last_name}`,
            email: report.User.email
          } : null,
          irrigator_association: report.IrrigatorAssociation ? {
            id: report.IrrigatorAssociation.id,
            name: report.IrrigatorAssociation.name
          } : null,
          images: imageUrls.map(url => ({ imageUrl: url })),
          urgency_score: getUrgencyScore(report.water_level, report.silt_level, report.debris_level)
        }
      };
    });

    res.json({
      type: 'FeatureCollection',
      features,
      metadata: {
        total: count,
        page: parseInt(page),
        limit: parseInt(limit),
        filters: { status, ris_id, ia_id, category, urgency }
      }
    });
  } catch (error) {
    console.error('Get reports GeoJSON error:', error);
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

const getFeaturesGeoJSON = async (req, res) => {
  try {
    const { ris_id, ia_id, feature_type, lat, lng, radius } = req.query;

    const where = {};
    if (ris_id) where.ris_id = ris_id;
    if (ia_id) where.ia_id = ia_id;
    if (feature_type) where.feature_type = feature_type;

    let radiusMeters = parseInt(radius) || 200;
    let userLat = parseFloat(lat);
    let userLng = parseFloat(lng);
    let hasSpatialFilter = false;

    if (!isNaN(userLat) && !isNaN(userLng) && radiusMeters > 0) {
      hasSpatialFilter = true;
      radiusMeters = Math.min(radiusMeters, 5000);
    }

    if (hasSpatialFilter) {
      const distanceExpr = `
        CASE 
          WHEN ST_GeometryType(geometry) = 'ST_Point' THEN
            ST_Distance(geometry, ST_SetSRID(ST_MakePoint(${userLng}, ${userLat}), 4326)::geography)
          WHEN ST_GeometryType(geometry) = 'ST_LineString' THEN
            ST_Distance(geometry, ST_SetSRID(ST_MakePoint(${userLng}, ${userLat}), 4326)::geography)
          ELSE 
            ST_Distance(ST_Centroid(geometry), ST_SetSRID(ST_MakePoint(${userLng}, ${userLat}), 4326)::geography)
        END
      `;
      const dwithinExpr = `
        CASE 
          WHEN ST_GeometryType(geometry) = 'ST_Point' THEN
            ST_DWithin(geometry, ST_SetSRID(ST_MakePoint(${userLng}, ${userLat}), 4326)::geography, ${radiusMeters})
          WHEN ST_GeometryType(geometry) = 'ST_LineString' THEN
            ST_DWithin(geometry, ST_SetSRID(ST_MakePoint(${userLng}, ${userLat}), 4326)::geography, ${radiusMeters})
          ELSE
            ST_DWithin(ST_Centroid(geometry), ST_SetSRID(ST_MakePoint(${userLng}, ${userLat}), 4326)::geography, ${radiusMeters})
        END
      `;

      const conditions = [];
      if (where.ris_id) conditions.push(`ris_id = '${where.ris_id}'`);
      if (where.ia_id) conditions.push(`ia_id = '${where.ia_id}'`);
      if (where.feature_type) conditions.push(`feature_type = '${where.feature_type}'`);
      
      const whereClause = conditions.length > 0 ? `AND ${conditions.join(' AND ')}` : '';

      const query = `
        SELECT 
          id, feature_type, geometry, properties, ris_id, ia_id,
          ${distanceExpr} as distance
        FROM "gis_features"
        WHERE ${dwithinExpr} ${whereClause}
        ORDER BY distance ASC
        LIMIT 500
      `;

      const [features] = await sequelize.query(query, { type: sequelize.QueryTypes.SELECT });

      console.log('DEBUG: Raw SQL query results:', features);
      console.log('DEBUG: Features type:', typeof features);
      console.log('DEBUG: Features isArray:', Array.isArray(features));

      // Handle both single object and array results from sequelize.query
      const featureRows = Array.isArray(features) ? features : (features ? [features] : []);
      console.log('DEBUG: featureRows length:', featureRows.length);
      console.log('DEBUG: featureRows:', featureRows);

      const geojson = featureRows.map((f, index) => {
        console.log(`DEBUG: Processing feature ${index}:`, f);
        console.log(`DEBUG: Feature ${index} geometry:`, f.geometry);
        console.log(`DEBUG: Feature ${index} geometry type:`, typeof f.geometry);
        
        let geom = f.geometry;
        if (geom && typeof geom === 'object') {
          console.log(`DEBUG: Feature ${index} geometry is object, processing...`);
          if (geom.type && geom.coordinates) {
            console.log(`DEBUG: Feature ${index} has type and coordinates`);
            geom = { type: geom.type, coordinates: geom.coordinates };
          } else if (geom.toGeoJSON) {
            console.log(`DEBUG: Feature ${index} has toGeoJSON method`);
            geom = geom.toGeoJSON();
          } else {
            console.log(`DEBUG: Feature ${index} geometry object but no type/coordinates or toGeoJSON`);
          }
        } else {
          console.log(`DEBUG: Feature ${index} geometry is not object or is null/undefined`);
        }
        
        const feature = {
          type: 'Feature',
          id: f.id,
          geometry: geom,
          properties: {
            feature_type: f.feature_type,
            ...(f.properties || {}),
            ris_id: f.ris_id,
            ia_id: f.ia_id,
            distance: Math.round(f.distance || 0)
          }
        };
        console.log(`DEBUG: Processed feature ${index}:`, feature);
        return feature;
      });

      console.log('DEBUG: Final geojson array length:', geojson.length);
      console.log('DEBUG: Final geojson:', geojson);

      return res.json({
        type: 'FeatureCollection',
        features: geojson,
        metadata: {
          total: featureRows.length,
          filters: { ris_id, ia_id, feature_type, lat, lng, radius: radiusMeters },
          search_point: { lat: userLat, lng: userLng }
        }
      });
    }

    const features = await GISFeature.findAll({
      where,
      attributes: ['id', 'feature_type', 'geometry', 'properties', 'ris_id', 'ia_id'],
      paranoid: false,
      limit: parseInt(req.query.limit) || 500,
      subQuery: false
    });

    const geojson = features.map(f => {
      let geom = f.geometry;
      if (geom && typeof geom === 'object') {
        if (geom.type && geom.coordinates) {
          geom = { type: geom.type, coordinates: geom.coordinates };
        } else if (geom.toGeoJSON) {
          geom = geom.toGeoJSON();
        }
      }
      
      return {
        type: 'Feature',
        id: f.id,
        geometry: geom,
        properties: {
          feature_type: f.feature_type,
          ...(f.properties || {}),
          ris_id: f.ris_id,
          ia_id: f.ia_id
        }
      };
    });

    res.json({
      type: 'FeatureCollection',
      features: geojson,
      metadata: {
        total: features.length,
        filters: { ris_id, ia_id, feature_type }
      }
    });
  } catch (error) {
    console.error('Get features GeoJSON error:', error);
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

const getRISList = async (req, res) => {
  try {
    const { with_stats } = req.query;

    const attributes = ['id', 'name', 'code'];
    const include = [];

    if (with_stats === 'true') {
      include.push({
        model: Report,
        as: 'reports',
        attributes: [],
        duplicating: false,
        required: false
      });
    }

    const systems = await RiverIrrigationSystem.findAll({
      attributes,
      include,
      order: [['name', 'ASC']]
    });

    let response = systems.map(ris => ({
      id: ris.id,
      name: ris.name,
      code: ris.code
    }));

    if (with_stats === 'true') {
      for (let ris of response) {
        const stats = await getRISStats(ris.id);
        ris.dataValues = { ...ris.dataValues, ...stats };
      }
    }

    res.json({ success: true, data: response });
  } catch (error) {
    console.error('Get RIS list error:', error);
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

const getRISById = async (req, res) => {
  try {
    const { id } = req.params;
    const { include_layers } = req.query;

    const ris = await RiverIrrigationSystem.findByPk(id, {
      attributes: ['id', 'name', 'code', 'service_area']
    });

    if (!ris) {
      return res.status(404).json({ success: false, message: 'RIS not found' });
    }

    const response = {
      id: ris.id,
      name: ris.name,
      code: ris.code,
      service_area: ris.service_area ? {
        type: 'Feature',
        geometry: ris.service_area,
        properties: { name: ris.name }
      } : null,
      stats: await getRISStats(id)
    };

    if (include_layers === 'true') {
        const [features, reports, ias] = await Promise.all([
        GISFeature.findAll({
          where: { ris_id: id },
          attributes: ['id', 'feature_type', 'geometry', 'properties'],
          paranoid: false
        }),
        Report.findAll({
          where: { ris_id: id },
          include: [
            { model: ReportTicket, as: 'ReportTickets', attributes: ['status'], paranoid: false },
            { model: User, as: 'User', attributes: ['first_name', 'last_name'] }
          ]
        }),
        IrrigatorAssociation.findAll({
          where: { ris_id: id },
          attributes: ['id', 'name', 'code'],
          paranoid: false
        })
      ]);

      response.layers = {
        canals: {
          type: 'FeatureCollection',
          features: features.map(f => ({
            type: 'Feature',
            geometry: f.geometry,
            properties: { id: f.id, feature_type: f.feature_type, ...f.properties }
          }))
        },
        reports: {
          type: 'FeatureCollection',
          features: reports.map(r => {
            const ticket = r.ReportTickets && r.ReportTickets.length > 0 ? r.ReportTickets[0] : null;
            return {
              type: 'Feature',
              geometry: r.location,
              properties: {
                id: r.id,
                status: ticket ? ticket.status : 'no_ticket',
                water_level: r.water_level,
                created_at: r.created_at
              }
            };
          })
        },
        irrigator_associations: ias.map(ia => ({
          id: ia.id,
          name: ia.name,
          code: ia.code
        }))
      };
    }

    res.json({ success: true, data: response });
  } catch (error) {
    console.error('Get RIS by ID error:', error);
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

const getStats = async (req, res) => {
  try {
    const { ris_id, ia_id, date_from, date_to } = req.query;

    const where = {};
    if (ris_id) where.ris_id = ris_id;
    if (ia_id) where.ia_id = ia_id;
    if (date_from || date_to) {
      where.created_at = {};
      if (date_from) where.created_at[Op.gte] = new Date(date_from);
      if (date_to) where.created_at[Op.lte] = new Date(date_to);
    }

    const [totalReports, byStatus, byLevel, recentReports] = await Promise.all([
      Report.count({ where }),
      ReportTicket.findAll({
        attributes: ['status', [sequelize.fn('COUNT', 'status'), 'count']],
        group: ['status'],
        raw: true,
        paranoid: false
      }),
      Report.findAll({
        where,
        attributes: ['water_level', 'silt_level', 'debris_level'],
        raw: true
      }),
      Report.findAll({
        where,
      include: [
        { model: User, as: 'User', attributes: ['first_name', 'last_name'] },
        { model: ReportTicket, as: 'ReportTickets', attributes: ['status'], paranoid: false }
      ],
      order: [['created_at', 'DESC']],
      limit: 10
    })
    ]);

    const levelCounts = {
      water: { dry: 0, low: 0, normal: 0, high: 0, overflow: 0 },
      silt: { clean: 0, light: 0, normal: 0, dirty: 0, heavily_silted: 0 },
      debris: { clear: 0, light: 0, normal: 0, heavy: 0, blocked: 0 }
    };

    byLevel.forEach(r => {
      levelCounts.water[r.water_level] = (levelCounts.water[r.water_level] || 0) + 1;
      levelCounts.silt[r.silt_level] = (levelCounts.silt[r.silt_level] || 0) + 1;
      levelCounts.debris[r.debris_level] = (levelCounts.debris[r.debris_level] || 0) + 1;
    });

    const urgencyCounts = { high: 0, normal: 0 };
    byLevel.forEach(r => {
      const score = getUrgencyScore(r.water_level, r.silt_level, r.debris_level);
      if (score >= 12) urgencyCounts.high++;
      else urgencyCounts.normal++;
    });

    res.json({
      success: true,
      data: {
        total_reports: totalReports,
        by_status: byStatus.reduce((acc, s) => ({ ...acc, [s.status]: parseInt(s.count) }), {}),
        by_level: levelCounts,
        urgency: urgencyCounts,
        recent_reports: recentReports.map(r => {
          const ticket = r.ReportTickets && r.ReportTickets.length > 0 ? r.ReportTickets[0] : null;
          return {
            id: r.id,
            water_level: r.water_level,
            silt_level: r.silt_level,
            debris_level: r.debris_level,
            status: ticket ? ticket.status : 'no_ticket',
            reporter: r.User ? `${r.User.first_name} ${r.User.last_name}` : 'Unknown',
            created_at: r.created_at
          };
        })
      }
    });
  } catch (error) {
    console.error('Get stats error:', error);
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

const getIAList = async (req, res) => {
  try {
    const { ris_id } = req.query;

    const where = {};
    if (ris_id) where.ris_id = ris_id;

    const ias = await IrrigatorAssociation.findAll({
      where,
      attributes: ['id', 'name', 'code', 'ris_id', 'service_area'],
      order: [['name', 'ASC']],
      paranoid: false
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
    console.error('Get IA list error:', error);
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

async function getRISStats(risId) {
  const [reportCount, iaCount, featureCount, latestReport] = await Promise.all([
    Report.count({ where: { ris_id: risId } }),
    IrrigatorAssociation.count({ where: { ris_id: risId }, paranoid: false }),
    GISFeature.count({ where: { ris_id: risId }, paranoid: false }),
    Report.findOne({
      where: { ris_id: risId },
      order: [['created_at', 'DESC']],
      attributes: ['created_at']
    })
  ]);

  return {
    report_count: reportCount,
    ia_count: iaCount,
    feature_count: featureCount,
    last_report: latestReport ? latestReport.created_at : null
  };
}

function getUrgencyScore(waterLevel, siltLevel, debrisLevel) {
  const levelMap = {
    dry: 1, low: 2, normal: 3, high: 4, overflow: 5,
    clean: 1, light: 2, normal: 3, dirty: 4, heavily_silted: 5,
    clear: 1, light: 2, normal: 3, heavy: 4, blocked: 5
  };

  const water = levelMap[waterLevel] || 3;
  const silt = levelMap[siltLevel] || 3;
  const debris = levelMap[debrisLevel] || 3;

  return water + silt + debris;
}

const createGISFeature = async (req, res) => {
  try {
    const { feature_type, geometry, properties, ris_id, ia_id } = req.body;

    if (!feature_type || !geometry) {
      return res.status(400).json({ success: false, message: 'feature_type and geometry are required' });
    }

    const feature = await GISFeature.create({
      feature_type,
      geometry,
      properties: properties || {},
      ris_id: ris_id || null,
      ia_id: ia_id || null
    });

    res.status(201).json({ success: true, data: feature });
  } catch (error) {
    console.error('Create GIS feature error:', error);
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

const updateGISFeature = async (req, res) => {
  try {
    const { id } = req.params;
    const { feature_type, geometry, properties, ris_id, ia_id } = req.body;

    const feature = await GISFeature.findByPk(id);
    if (!feature) {
      return res.status(404).json({ success: false, message: 'GIS feature not found' });
    }

    await feature.update({
      ...(feature_type && { feature_type }),
      ...(geometry && { geometry }),
      ...(properties !== undefined && { properties }),
      ...(ris_id !== undefined && { ris_id: ris_id || null }),
      ...(ia_id !== undefined && { ia_id: ia_id || null })
    });

    res.json({ success: true, data: feature });
  } catch (error) {
    console.error('Update GIS feature error:', error);
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

const deleteGISFeature = async (req, res) => {
  try {
    const { id } = req.params;

    const feature = await GISFeature.findByPk(id);
    if (!feature) {
      return res.status(404).json({ success: false, message: 'GIS feature not found' });
    }

    await feature.destroy();
    res.json({ success: true, message: 'GIS feature deleted' });
  } catch (error) {
    console.error('Delete GIS feature error:', error);
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

const getGISFeatureById = async (req, res) => {
  try {
    const { id } = req.params;

    const feature = await GISFeature.findByPk(id, { paranoid: false });
    if (!feature) {
      return res.status(404).json({ success: false, message: 'GIS feature not found' });
    }

    let geom = feature.geometry;
    if (geom && typeof geom === 'object' && geom.toGeoJSON) {
      geom = geom.toGeoJSON();
    }

    res.json({
      success: true,
      data: {
        id: feature.id,
        feature_type: feature.feature_type,
        geometry: geom,
        properties: feature.properties,
        ris_id: feature.ris_id,
        ia_id: feature.ia_id,
        created_at: feature.created_at,
        updated_at: feature.updated_at
      }
    });
  } catch (error) {
    console.error('Get GIS feature error:', error);
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

const createIA = async (req, res) => {
  try {
    const { name, code, service_area, ris_id } = req.body;

    if (!name || !code) {
      return res.status(400).json({ success: false, message: 'name and code are required' });
    }

    const ia = await IrrigatorAssociation.create({
      name,
      code,
      service_area,
      ris_id
    });

    res.status(201).json({ success: true, data: ia });
  } catch (error) {
    console.error('Create IA error:', error);
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

const updateIA = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, code, service_area, ris_id } = req.body;

    const ia = await IrrigatorAssociation.findByPk(id, { paranoid: false });
    if (!ia) {
      return res.status(404).json({ success: false, message: 'IA not found' });
    }

    await ia.update({
      ...(name && { name }),
      ...(code && { code }),
      ...(service_area !== undefined && { service_area }),
      ...(ris_id !== undefined && { ris_id })
    });

    res.json({ success: true, data: ia });
  } catch (error) {
    console.error('Update IA error:', error);
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

const deleteIA = async (req, res) => {
  try {
    const { id } = req.params;

    const ia = await IrrigatorAssociation.findByPk(id, { paranoid: false });
    if (!ia) {
      return res.status(404).json({ success: false, message: 'IA not found' });
    }

    await ia.destroy();
    res.json({ success: true, message: 'IA deleted' });
  } catch (error) {
    console.error('Delete IA error:', error);
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

const getIAById = async (req, res) => {
  try {
    const { id } = req.params;

    const ia = await IrrigatorAssociation.findByPk(id, { paranoid: false });
    if (!ia) {
      return res.status(404).json({ success: false, message: 'IA not found' });
    }

    let geom = ia.service_area;
    if (geom && typeof geom === 'object' && geom.toGeoJSON) {
      geom = geom.toGeoJSON();
    }

    res.json({
      success: true,
      data: {
        id: ia.id,
        name: ia.name,
        code: ia.code,
        service_area: geom,
        ris_id: ia.ris_id,
        created_at: ia.created_at,
        updated_at: ia.updated_at
      }
    });
  } catch (error) {
    console.error('Get IA error:', error);
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

const getIAGeoJSON = async (req, res) => {
  try {
    const { ris_id } = req.query;

    const where = {};
    if (ris_id) where.ris_id = ris_id;

    const ias = await IrrigatorAssociation.findAll({
      where,
      paranoid: false
    });

    const features = ia.map(ia => {
      let geom = ia.service_area;
      if (geom && typeof geom === 'object' && geom.toGeoJSON) {
        geom = geom.toGeoJSON();
      }

      return {
        type: 'Feature',
        geometry: geom,
        properties: {
          id: ia.id,
          name: ia.name,
          code: ia.code,
          ris_id: ia.ris_id
        }
      };
    });

    res.json({
      type: 'FeatureCollection',
      features,
      metadata: { total: ias.length }
    });
  } catch (error) {
    console.error('Get IA GeoJSON error:', error);
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

module.exports = {
  getReportsGeoJSON,
  getFeaturesGeoJSON,
  getRISList,
  getRISById,
  getStats,
  getIAList,
  createGISFeature,
  updateGISFeature,
  deleteGISFeature,
  getGISFeatureById,
  createIA,
  updateIA,
  deleteIA,
  getIAById,
  getIAGeoJSON
};
