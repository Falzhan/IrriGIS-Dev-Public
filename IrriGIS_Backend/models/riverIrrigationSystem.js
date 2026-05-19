const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const RiverIrrigationSystem = sequelize.define('RiverIrrigationSystem', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false
    },
    code: {
      type: DataTypes.STRING(50),
      allowNull: false,
      unique: true
    },
    service_area: {
      type: DataTypes.GEOMETRY('MULTIPOLYGON', 4326),
      allowNull: true
    }
  }, {
    tableName: 'river_irrigation_systems',
    underscored: true,
    timestamps: true
  });

  RiverIrrigationSystem.associate = (models) => {
    RiverIrrigationSystem.hasMany(models.IrrigatorAssociation, {
      foreignKey: 'ris_id',
      as: 'irrigatorAssociations'
    });
    RiverIrrigationSystem.hasMany(models.GISFeature, {
      foreignKey: 'ris_id',
      as: 'gisFeatures'
    });
    RiverIrrigationSystem.hasMany(models.User, {
      foreignKey: 'ris_id',
      as: 'users'
    });
    RiverIrrigationSystem.hasMany(models.Report, {
      foreignKey: 'ris_id',
      as: 'reports'
    });
  };

  return RiverIrrigationSystem;
};
