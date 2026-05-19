const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const User = sequelize.define('User', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    email: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
      validate: {
        isEmail: true
      }
    },
    password_hash: {
      type: DataTypes.STRING,
      allowNull: true // Allow null for social login users
    },
    first_name: {
      type: DataTypes.STRING,
      allowNull: false
    },
    last_name: {
      type: DataTypes.STRING,
      allowNull: false
    },
    role: {
      type: DataTypes.ENUM('nia_admin', 'nia_field_officer', 'ia_admin', 'ia_member'),
      defaultValue: 'ia_member'
    },
    contact_number: {
      type: DataTypes.STRING,
      allowNull: true
    },
    address: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    // New fields for Social Login
    auth_provider: {
      type: DataTypes.STRING,
      defaultValue: 'local' // 'local', 'google', 'facebook'
    },
    google_id: {
      type: DataTypes.STRING,
      unique: true,
      allowNull: true
    },
    facebook_id: {
      type: DataTypes.STRING,
      unique: true,
      allowNull: true
    },
    is_active: {
      type: DataTypes.BOOLEAN,
      defaultValue: true
    },
    ia_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: 'irrigator_associations',
        key: 'id'
      }
    },
    ris_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: 'river_irrigation_systems',
        key: 'id'
      }
    },
    session_token: {
      type: DataTypes.STRING,
      allowNull: true
    },
    profile_image_url: {
      type: DataTypes.TEXT,
      allowNull: true
    }
  }, {
    tableName: 'users',
    underscored: true, // Converts camelCase to snake_case in DB (e.g. firstName -> first_name)
    timestamps: true,
    hooks: {
      beforeCreate: async (user) => {
        if (user.password_hash) {
          const bcrypt = require('bcrypt');
          const saltRounds = 10;
          user.password_hash = await bcrypt.hash(user.password_hash, saltRounds);
        }
      }
    }
  });

  // Associations
  User.associate = (models) => {
    User.belongsTo(models.IrrigatorAssociation, {
      foreignKey: 'ia_id',
      as: 'irrigatorAssociation'
    });
    User.belongsTo(models.RiverIrrigationSystem, {
      foreignKey: 'ris_id',
      as: 'riverIrrigationSystem'
    });
    User.hasMany(models.Report, {
      foreignKey: 'user_id',
      as: 'reports'
    });
  };

  // Instance method to validate password
  User.prototype.validPassword = async function(password) {
    if (!this.password_hash) {
      return false; // No password set (e.g., social login users)
    }
    const bcrypt = require('bcrypt');
    return await bcrypt.compare(password, this.password_hash);
  };

  return User;
};