const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Notification = sequelize.define('Notification', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    type: {
      type: DataTypes.STRING(50),
      allowNull: false
    },
    title: {
      type: DataTypes.STRING(255),
      allowNull: false
    },
    message: {
      type: DataTypes.TEXT,
      allowNull: false
    },
    is_read: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    related_ticket_id: {
      type: DataTypes.UUID,
      allowNull: true
    },
    related_report_id: {
      type: DataTypes.UUID,
      allowNull: true
    }
  }, {
    tableName: 'notifications',
    timestamps: true,
    updatedAt: false,
    paranoid: false
  });

  Notification.associate = (models) => {
    Notification.belongsTo(models.User, {
      foreignKey: 'user_id',
      as: 'user',
      onDelete: 'CASCADE'
    });
    Notification.belongsTo(models.ReportTicket, {
      foreignKey: 'related_ticket_id',
      as: 'relatedTicket',
      onDelete: 'SET NULL'
    });
  };

  return Notification;
};
