const { Sequelize } = require('sequelize');

class SupervisorApproval extends Sequelize.Model {
  static init(sequelize, DataTypes) {
    return super.init({
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        allowNull: false,
        autoIncrement: true,
        field: 'id'
      },
      taskHazardId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        field: 'task_hazard_id',
        references: {
          model: 'task_hazards',
          key: 'id'
        }
      },
      supervisorId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        field: 'supervisor_id',
        references: {
          model: 'users',
          key: 'id'
        }
      },
      status: {
        type: DataTypes.ENUM('pending', 'approved', 'rejected'),
        allowNull: false,
        defaultValue: 'pending',
        field: 'status'
      },
      processedAt: {
        type: DataTypes.DATE,
        allowNull: true,
        field: 'processed_at'
      },
      comments: {
        type: DataTypes.TEXT,
        allowNull: true,
        field: 'comments'
      },
      // Snapshot of the task hazard at the time of approval request
      taskHazardSnapshot: {
        type: DataTypes.JSON,
        allowNull: false,
        field: 'task_hazard_snapshot'
      },
      // Snapshot of all risks at the time of approval request
      risksSnapshot: {
        type: DataTypes.JSON,
        allowNull: false,
        field: 'risks_snapshot'
      },
      // Flag to indicate if this approval was invalidated by changes
      isInvalidated: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
        field: 'is_invalidated'
      },
      // Reference to the approval that replaced this one (if invalidated)
      replacedByApprovalId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        field: 'replaced_by_approval_id',
        references: {
          model: 'supervisor_approvals',
          key: 'id'
        }
      }
    }, {
      sequelize,
      modelName: 'supervisor_approvals',
      tableName: 'supervisor_approvals',
      timestamps: true,
      underscored: true,
      paranoid: true
    });
  }

  static associate(models) {
    // Belongs to a task hazard
    this.belongsTo(models.task_hazards, {
      foreignKey: 'taskHazardId',
      as: 'taskHazard'
    });

    // Belongs to a supervisor (user)
    this.belongsTo(models.user, {
      foreignKey: 'supervisorId',
      as: 'supervisor'
    });

    // Self-referencing association for replacement tracking
    this.belongsTo(models.supervisor_approvals, {
      foreignKey: 'replacedByApprovalId',
      as: 'replacedByApproval'
    });

    this.hasOne(models.supervisor_approvals, {
      foreignKey: 'replacedByApprovalId',
      as: 'replacesApproval'
    });
  }

  // Instance method to approve the request
  async approve(comments = null, transaction = null) {
    const updateData = {
      status: 'approved',
      processedAt: new Date(),
      comments
    };

    const options = transaction ? { transaction } : {};
    return this.update(updateData, options);
  }

  // Instance method to reject the request
  async reject(comments = null, transaction = null) {
    const updateData = {
      status: 'rejected',
      processedAt: new Date(),
      comments
    };

    const options = transaction ? { transaction } : {};
    return this.update(updateData, options);
  }

  // Instance method to invalidate this approval (when changes are made)
  async invalidate(replacedByApprovalId = null, transaction = null) {
    const updateData = {
      isInvalidated: true,
      replacedByApprovalId
    };

    const options = transaction ? { transaction } : {};
    return this.update(updateData, options);
  }

  // Static method to create a snapshot of task hazard and risks
  static createSnapshot(taskHazard) {
    // Create a clean snapshot of the task hazard (remove sensitive/unnecessary fields)
    const taskHazardSnapshot = {
      id: taskHazard.id,
      date: taskHazard.date,
      time: taskHazard.time,
      scopeOfWork: taskHazard.scopeOfWork,
      assetHierarchyId: taskHazard.assetHierarchyId,
      systemLockoutRequired: taskHazard.systemLockoutRequired,
      trainedWorkforce: taskHazard.trainedWorkforce,
      location: taskHazard.location,
      geoFenceLimit: taskHazard.geoFenceLimit,
      individuals: taskHazard.individuals ? taskHazard.individuals.map(ind => ({
        id: ind.id,
        email: ind.email,
        name: ind.name,
        role: ind.role
      })) : [],
      supervisor: taskHazard.supervisor ? {
        id: taskHazard.supervisor.id,
        email: taskHazard.supervisor.email,
        name: taskHazard.supervisor.name,
        role: taskHazard.supervisor.role
      } : null,
      snapshotTakenAt: new Date()
    };

    // Create a clean snapshot of all risks
    const risksSnapshot = taskHazard.risks.map(risk => ({
      id: risk.id || null,
      riskDescription: risk.riskDescription,
      riskType: risk.riskType,
      asIsLikelihood: risk.asIsLikelihood,
      asIsConsequence: risk.asIsConsequence,
      mitigatingAction: risk.mitigatingAction,
      mitigatingActionType: risk.mitigatingActionType,
      mitigatedLikelihood: risk.mitigatedLikelihood,
      mitigatedConsequence: risk.mitigatedConsequence,
      requiresSupervisorSignature: risk.requiresSupervisorSignature
    }));

    return {
      taskHazardSnapshot,
      risksSnapshot
    };
  }
}

module.exports = SupervisorApproval; 