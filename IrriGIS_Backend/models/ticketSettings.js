const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const TicketSettings = sequelize.define('TicketSettings', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    proximity_threshold_meters: {
      type: DataTypes.INTEGER,
      defaultValue: 50,
      field: 'proximity_threshold_meters'
    },
    auto_group_enabled: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
      field: 'auto_group_enabled'
    }
  }, {
    tableName: 'ticket_settings',
    timestamps: true,
    underscored: true
  });

  return TicketSettings;
};