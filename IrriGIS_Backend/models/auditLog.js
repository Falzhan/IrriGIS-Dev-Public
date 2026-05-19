const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const AuditLog = sequelize.define('AuditLog', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'user_id',
      references: {
        model: 'users',
        key: 'id'
      }
    },
    action: {
      type: DataTypes.STRING(10),
      allowNull: false
    },
    tableName: {
      type: DataTypes.STRING(100),
      allowNull: false,
      field: 'table_name'
    },
    recordId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'record_id'
    },
    oldData: {
      type: DataTypes.JSONB,
      allowNull: true,
      field: 'old_data'
    },
    newData: {
      type: DataTypes.JSONB,
      allowNull: true,
      field: 'new_data'
    }
  }, {
    tableName: 'audit_log',
    timestamps: true,
    paranoid: false,
    underscored: true
  });

  return AuditLog;
};