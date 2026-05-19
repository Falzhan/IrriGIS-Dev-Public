const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Report = sequelize.define('Report', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    location: {
      type: DataTypes.GEOMETRY('POINT', 4326),
      allowNull: false
    },
    water_level: {
      type: DataTypes.ENUM('dry', 'low', 'normal', 'high', 'overflow'),
      defaultValue: 'normal'
    },
    silt_level: {
      type: DataTypes.ENUM('clean', 'light', 'normal', 'dirty', 'heavily_silted'),
      defaultValue: 'normal'
    },
    debris_level: {
      type: DataTypes.ENUM('clear', 'light', 'normal', 'heavy', 'blocked'),
      defaultValue: 'normal'
    },
    category: {
      type: DataTypes.ENUM('inspection', 'maintenance', 'cleaning', 'issue', 'other'),
      defaultValue: 'inspection'
    },
    remarks: DataTypes.TEXT,
    ris_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: 'river_irrigation_systems',
        key: 'id'
      }
    },
    gis_feature_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: 'gis_features',
        key: 'id'
      }
    },
    is_valid: {
      type: DataTypes.BOOLEAN,
      defaultValue: true
    },
    invalid_reason: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    location_name: {
      type: DataTypes.STRING(500),
      allowNull: true
    },
    ticketId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'ticket_id',
      references: {
        model: 'report_tickets',
        key: 'id'
      }
    }
  }, {
    tableName: 'reports',
    timestamps: true,
    paranoid: true
  });

  Report.associate = (models) => {
    Report.hasMany(models.ReportImage, {
      foreignKey: 'reportId',
      as: 'images',
      onDelete: 'CASCADE'
    });
    
    Report.hasMany(models.ReportTicket, {
      foreignKey: 'reportId',
      as: 'ReportTickets',
      onDelete: 'CASCADE'
    });
    
    Report.belongsTo(models.User, {
      foreignKey: 'user_id',
      onDelete: 'CASCADE'
    });
    Report.belongsTo(models.IrrigatorAssociation, {
      foreignKey: 'ia_id',
      onDelete: 'SET NULL'
    });
    Report.belongsTo(models.RiverIrrigationSystem, {
      foreignKey: 'ris_id',
      onDelete: 'SET NULL'
    });
    Report.belongsTo(models.GISFeature, {
      foreignKey: 'gis_feature_id',
      onDelete: 'SET NULL'
    });
    Report.belongsTo(models.ReportTicket, {
      foreignKey: 'ticketId',
      as: 'ticket',
      onDelete: 'SET NULL'
    });
  };

  return Report;
};