const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const ReportTicket = sequelize.define('ReportTicket', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
reportId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'report_id',
      references: {
        model: 'reports',
        key: 'id'
      }
    },
    status: {
      type: DataTypes.ENUM('pending', 'in_progress', 'rejected', 'closed'),
      defaultValue: 'pending'
    },
    sub_status_id: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'sub_status_id',
      references: {
        model: 'ticket_sub_statuses',
        key: 'id'
      }
    },
    assignedTo: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'assigned_to',
      references: {
        model: 'users',
        key: 'id'
      }
    },
    workflowSteps: {
      type: DataTypes.JSONB,
      defaultValue: [],
      field: 'workflow_steps'
    },
    comments: {
      type: DataTypes.JSONB,
      defaultValue: []
    },
    acknowledged_at: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'acknowledged_at'
    },
    resolved_at: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'resolved_at'
    }
  }, {
    tableName: 'report_tickets',
    timestamps: true,
    paranoid: false,
    underscored: true
  });

ReportTicket.associate = (models) => {
    // Report associations (original 1:1)
    ReportTicket.belongsTo(models.Report, {
      foreignKey: 'reportId',
      as: 'Report',
      onDelete: 'CASCADE'
    });
    
    // Reports linked by ticket_id (1:many for grouping)
    ReportTicket.hasMany(models.Report, {
      foreignKey: 'ticketId',
      as: 'Reports',
      onDelete: 'SET NULL'
    });
    
    // User associations
    ReportTicket.belongsTo(models.User, {
      foreignKey: 'assignedTo',
      as: 'assignedUser',
      onDelete: 'SET NULL'
    });
    
    // Sub status association
    ReportTicket.belongsTo(models.TicketSubStatus, {
      foreignKey: 'sub_status_id',
      as: 'subStatus',
      onDelete: 'SET NULL'
    });
    
    // Notification associations
    ReportTicket.hasMany(models.Notification, {
      foreignKey: 'related_ticket_id',
      as: 'notifications'
    });
  };

  return ReportTicket;
};