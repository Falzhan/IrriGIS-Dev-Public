module.exports = (sequelize, DataTypes) => {
  const ReportImage = sequelize.define('ReportImage', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    // JS Name: reportId -> DB Column: report_id
    reportId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'report_id', 
      references: {
        model: 'reports',
        key: 'id'
      }
    },
    // JS Name: imageUrl -> DB Column: image_url
    imageUrl: {
      type: DataTypes.STRING,
      allowNull: false,
      field: 'image_url',
      validate: {
        notEmpty: true
      }
    },
    // JS Name: isPrimary -> DB Column: is_primary
    isPrimary: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      field: 'is_primary'
    },
    caption: {
      type: DataTypes.STRING,
      allowNull: true
    }
  }, {
    timestamps: true,       // Enables createdAt/updatedAt
    tableName: 'report_images',
    underscored: true       // Standardizes snake_case for auto-generated fields
  });

  ReportImage.associate = (models) => {
    ReportImage.belongsTo(models.Report, { foreignKey: 'reportId', as: 'report' });
  };

  return ReportImage;
};