const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const UserSettings = sequelize.define('UserSettings', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    default_user_active: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
      field: 'default_user_active'
    }
  }, {
    tableName: 'user_settings',
    timestamps: true,
    underscored: true
  });

  return UserSettings;
};
