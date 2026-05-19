const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const GISFeature = sequelize.define('GISFeature', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    feature_type: {
      type: DataTypes.ENUM('main_canal', 'lateral', 'farm_ditch', 'pipeline', 'canal', 'river', 'other')
    },
    geometry: {
      type: DataTypes.GEOMETRY('GEOMETRY', 4326),
      allowNull: false
    },
    properties: DataTypes.JSONB,
    ris_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: 'river_irrigation_systems',
        key: 'id'
      }
    },
    ia_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: 'irrigator_associations',
        key: 'id'
      }
    }
  }, {
    tableName: 'gis_features',
    timestamps: false,
    underscored: false
  });

  GISFeature.associate = (models) => {
    GISFeature.belongsTo(models.IrrigatorAssociation, {
      foreignKey: 'ia_id',
      as: 'irrigatorAssociation',
      onDelete: 'SET NULL'
    });
    GISFeature.belongsTo(models.RiverIrrigationSystem, {
      foreignKey: 'ris_id',
      as: 'riverIrrigationSystem',
      onDelete: 'SET NULL'
    });
  };

  return GISFeature;
};