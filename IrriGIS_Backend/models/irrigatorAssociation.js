const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const IrrigatorAssociation = sequelize.define('IrrigatorAssociation', {
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
      type: DataTypes.GEOMETRY('GEOMETRY', 4326),
      allowNull: true
    },
    ris_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: 'river_irrigation_systems',
        key: 'id'
      }
    }
  }, {
    tableName: 'irrigator_associations',
    timestamps: false,
    underscored: false
  });

  IrrigatorAssociation.associate = (models) => {
    IrrigatorAssociation.belongsTo(models.RiverIrrigationSystem, {
      foreignKey: 'ris_id',
      as: 'riverIrrigationSystem'
    });
    IrrigatorAssociation.hasMany(models.User, {
      foreignKey: 'ia_id',
      as: 'users'
    });
    IrrigatorAssociation.hasMany(models.Report, {
      foreignKey: 'ia_id',
      as: 'reports'
    });
    IrrigatorAssociation.hasMany(models.GISFeature, {
      foreignKey: 'ia_id',
      as: 'gisFeatures'
    });
  };

  return IrrigatorAssociation;
};
