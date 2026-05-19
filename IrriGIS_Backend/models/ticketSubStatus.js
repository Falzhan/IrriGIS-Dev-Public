const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const TicketSubStatus = sequelize.define('TicketSubStatus', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    name: {
      type: DataTypes.STRING(100),
      allowNull: false
    },
    slug: {
      type: DataTypes.STRING(50),
      allowNull: false,
      unique: true
    },
    color: {
      type: DataTypes.STRING(20),
      defaultValue: '#6C757D'
    },
    icon: {
      type: DataTypes.STRING(50),
      allowNull: true
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    display_order: {
      type: DataTypes.INTEGER,
      defaultValue: 0
    },
    is_active: {
      type: DataTypes.BOOLEAN,
      defaultValue: true
    },
    is_system: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    }
  }, {
    tableName: 'ticket_sub_statuses',
    underscored: true,
    timestamps: true,
    paranoid: false
  });

  TicketSubStatus.associate = (models) => {
    TicketSubStatus.hasMany(models.ReportTicket, {
      foreignKey: 'sub_status_id',
      as: 'tickets'
    });
  };

  return TicketSubStatus;
};