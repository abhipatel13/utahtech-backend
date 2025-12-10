const { Sequelize } = require('sequelize');

// Helper function for polymorphic associations
const uppercaseFirst = str => `${str[0].toUpperCase()}${str.substr(1)}`;

class SupervisorApproval extends Sequelize.Model {
  // Instance method for lazy loading the approvable entity
  getApprovable(options) {
    if (!this.approvableType) return Promise.resolve(null);
    const mixinMethodName = `get${uppercaseFirst(this.approvableType.replace('_', ''))}`;
    return this[mixinMethodName](options);
  }

  static init(sequelize, DataTypes) {
    return super.init({
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        allowNull: false,
        autoIncrement: true,
        field: 'id'
      },
      approvableId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        field: 'approvable_id'
      },
      approvableType: {
        type: DataTypes.STRING,
        allowNull: false,
        field: 'approvable_type'
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
      // Snapshot of the approvable entity at the time of approval request
      approvableSnapshot: {
        type: DataTypes.JSON,
        allowNull: false,
        field: 'approvable_snapshot'
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
      },
      // VIRTUAL fields for backwards compatibility - these don't exist in the database
      // They compute values from the polymorphic fields for legacy API responses
      taskHazardId: {
        type: DataTypes.VIRTUAL,
        get() {
          return this.approvableType === 'task_hazards' ? this.getDataValue('approvableId') : null;
        }
      },
      taskHazardSnapshot: {
        type: DataTypes.VIRTUAL,
        get() {
          return this.approvableType === 'task_hazards' ? this.getDataValue('approvableSnapshot') : null;
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
    // Polymorphic associations with task hazards
    this.belongsTo(models.task_hazards, {
      foreignKey: 'approvableId',
      constraints: false,
      as: 'task_hazards'
    });

    // Polymorphic associations with risk assessments
    this.belongsTo(models.risk_assessments, {
      foreignKey: 'approvableId',
      constraints: false,
      as: 'risk_assessments'
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

    // Add afterFind hook for eager loading support
    this.addHook('afterFind', findResult => {
      if (!findResult) return;
      if (!Array.isArray(findResult)) findResult = [findResult];
      for (const instance of findResult) {
        if (!instance) continue;
        if (instance.approvableType === 'task_hazards' && instance.task_hazards !== undefined) {
          instance.approvable = instance.task_hazards;
        } else if (instance.approvableType === 'risk_assessments' && instance.risk_assessments !== undefined) {
          instance.approvable = instance.risk_assessments;
        }
        // To prevent mistakes, remove concrete fields after setting approvable
        if (instance.dataValues) {
          delete instance.task_hazards;
          delete instance.dataValues.task_hazards;
          delete instance.risk_assessments;
          delete instance.dataValues.risk_assessments;
        }
      }
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

  /**
   * Static method to create a snapshot of approvable entity and risks
   * Supports both task_hazards and risk_assessments
   * 
   * @param {Object} approvable - The task hazard or risk assessment entity
   * @param {string} approvableType - Either 'task_hazards' or 'risk_assessments'
   * @returns {Object} Object containing approvableSnapshot and risksSnapshot
   */
  static createSnapshot(approvable, approvableType = 'task_hazards') {
    let approvableSnapshot;

    if (approvableType === 'task_hazards') {
      // Create a clean snapshot of the task hazard (remove sensitive/unnecessary fields)
      approvableSnapshot = {
        id: approvable.id,
        date: approvable.date,
        time: approvable.time,
        scopeOfWork: approvable.scopeOfWork,
        assetHierarchyId: approvable.assetHierarchyId,
        systemLockoutRequired: approvable.systemLockoutRequired,
        trainedWorkforce: approvable.trainedWorkforce,
        location: approvable.location,
        geoFenceLimit: approvable.geoFenceLimit,
        individuals: approvable.individuals ? approvable.individuals.map(ind => ({
          id: ind.id,
          email: ind.email,
          name: ind.name,
          role: ind.role
        })) : [],
        supervisor: approvable.supervisor ? {
          id: approvable.supervisor.id,
          email: approvable.supervisor.email,
          name: approvable.supervisor.name,
          role: approvable.supervisor.role
        } : null,
        snapshotTakenAt: new Date(),
        type: 'task_hazards'
      };
    } else if (approvableType === 'risk_assessments') {
      // Create a clean snapshot of the risk assessment
      approvableSnapshot = {
        id: approvable.id,
        date: approvable.date,
        time: approvable.time,
        scopeOfWork: approvable.scopeOfWork,
        assetHierarchyId: approvable.assetHierarchyId,
        location: approvable.location,
        individuals: approvable.individuals ? approvable.individuals.map(ind => ({
          id: ind.id,
          email: ind.email,
          name: ind.name,
          role: ind.role
        })) : [],
        supervisor: approvable.supervisor ? {
          id: approvable.supervisor.id,
          email: approvable.supervisor.email,
          name: approvable.supervisor.name,
          role: approvable.supervisor.role
        } : null,
        snapshotTakenAt: new Date(),
        type: 'risk_assessments'
      };
    } else {
      throw new Error(`Unsupported approvable type: ${approvableType}`);
    }

    // Create a clean snapshot of all risks
    const risksSnapshot = approvable.risks ? approvable.risks.map(risk => ({
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
    })) : [];

    return {
      approvableSnapshot,
      risksSnapshot
    };
  }

  /**
   * Format approval for response with backwards compatibility
   * Returns both new field names and legacy field names for task hazards
   * 
   * @param {boolean} includeLegacyFields - Whether to include legacy taskHazard* fields
   * @returns {Object} Formatted approval object
   */
  toResponseJSON(includeLegacyFields = true) {
    const response = {
      id: this.id,
      approvableId: this.approvableId,
      approvableType: this.approvableType,
      supervisorId: this.supervisorId,
      status: this.status,
      processedAt: this.processedAt,
      comments: this.comments,
      approvableSnapshot: this.approvableSnapshot,
      risksSnapshot: this.risksSnapshot,
      isInvalidated: this.isInvalidated,
      replacedByApprovalId: this.replacedByApprovalId,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt
    };

    // Add legacy fields for backwards compatibility with task hazards
    if (includeLegacyFields && this.approvableType === 'task_hazards') {
      response.taskHazardId = this.approvableId;
      response.taskHazardSnapshot = this.approvableSnapshot;
    }

    // Include supervisor if loaded
    if (this.supervisor) {
      response.supervisor = {
        id: this.supervisor.id,
        email: this.supervisor.email,
        name: this.supervisor.name,
        role: this.supervisor.role
      };
    }

    return response;
  }
}

module.exports = SupervisorApproval;
