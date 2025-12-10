const db = require("../models");
const SupervisorApproval = db.supervisor_approvals;
const TaskHazard = db.task_hazards;
const RiskAssessment = db.risk_assessments;
const TaskRisk = db.task_risks;
const RiskAssessmentRisk = db.risk_assessment_risks;
const User = db.user;
const Notification = db.notifications;
const { successResponse, errorResponse, sendResponse } = require('../helper/responseHelper');
const { getCompanyId } = require('../helper/controllerHelper');
const { Op } = require('sequelize');
const { sendMail } = require('../helper/mail.helper');

/**
 * Helper function to get the appropriate model and risk model based on approvable type
 */
const getModelsForType = (approvableType) => {
  switch (approvableType) {
    case 'task_hazards':
      return {
        ApprovableModel: TaskHazard,
        RiskModel: TaskRisk,
        associations: {
          risks: 'risks',
          supervisor: 'supervisor',
          individuals: 'individuals'
        }
      };
    case 'risk_assessments':
      return {
        ApprovableModel: RiskAssessment,
        RiskModel: RiskAssessmentRisk,
        associations: {
          risks: 'risks',
          supervisor: 'supervisor',
          individuals: 'individuals'
        }
      };
    default:
      throw new Error(`Unsupported approvable type: ${approvableType}`);
  }
};

/**
 * Helper function to find approvable entity with company validation
 */
const findApprovableByIdAndCompany = async (id, approvableType, companyId) => {
  const { ApprovableModel } = getModelsForType(approvableType);
  
  const approvable = await ApprovableModel.findOne({
    where: { id, companyId }
  });
  
  if (!approvable) {
    throw new Error(`${approvableType.replace('_', ' ')} not found`);
  }
  
  return approvable;
};

/**
 * Create a new supervisor approval request
 * Used by both task hazard and risk assessment controllers
 * 
 * @param {number} approvableId - ID of the task hazard or risk assessment
 * @param {string} approvableType - 'task_hazards' or 'risk_assessments'
 * @param {number} supervisorId - ID of the supervisor to approve
 * @param {Object} transaction - Optional Sequelize transaction
 * @returns {Object} Created supervisor approval record
 */
exports.createApproval = async (approvableId, approvableType, supervisorId, transaction = null) => {
  try {
    // Get the approvable entity with all associations for snapshot
    const { ApprovableModel } = getModelsForType(approvableType);
    
    const approvableWithAssociations = await ApprovableModel.findByPk(approvableId, {
      include: [
        { model: User, as: 'supervisor' },
        { model: User, as: 'individuals' }
      ],
      transaction
    });

    if (!approvableWithAssociations) {
      throw new Error(`${approvableType.replace('_', ' ')} not found`);
    }

    // Create snapshot for the approval
    const { approvableSnapshot, risksSnapshot } = SupervisorApproval.createSnapshot(
      approvableWithAssociations,
      approvableType
    );

    // Create supervisor approval record
    const supervisorApproval = await SupervisorApproval.create({
      approvableId,
      approvableType,
      supervisorId,
      status: 'pending',
      approvableSnapshot,
      risksSnapshot
    }, { transaction });

    // Create notification for supervisor
    const entityName = approvableType === 'task_hazards' ? 'Task Hazard' : 'Risk Assessment';
    await Notification.create({
      userId: supervisorId,
      title: `${entityName} Pending Approval`,
      message: `A ${entityName.toLowerCase()} requires your approval. Please review the risks and take appropriate actions.`,
      type: "approval"
    }, { transaction });

    return supervisorApproval;

  } catch (error) {
    console.error('Error creating supervisor approval:', error);
    throw error;
  }
};

/**
 * Handle re-approval when an entity is modified
 * Invalidates existing approval and creates new one if needed
 * 
 * @param {number} approvableId - ID of the task hazard or risk assessment
 * @param {string} approvableType - 'task_hazards' or 'risk_assessments'
 * @param {number} supervisorId - ID of the supervisor to approve
 * @param {Object} currentApproval - The current approval record to invalidate
 * @param {Object} transaction - Optional Sequelize transaction
 * @returns {Object} New supervisor approval record
 */
exports.handleReapproval = async (approvableId, approvableType, supervisorId, currentApproval, transaction = null) => {
  try {
    // Get the approvable entity with all associations for snapshot
    const { ApprovableModel } = getModelsForType(approvableType);
    
    const approvableWithAssociations = await ApprovableModel.findByPk(approvableId, {
      include: [
        { model: User, as: 'supervisor' },
        { model: User, as: 'individuals' }
      ],
      transaction
    });

    // Create snapshot for the new approval
    const { approvableSnapshot, risksSnapshot } = SupervisorApproval.createSnapshot(
      approvableWithAssociations,
      approvableType
    );

    // Invalidate the existing approval
    await currentApproval.invalidate(null, transaction);

    // Create new approval record
    const newApproval = await SupervisorApproval.create({
      approvableId,
      approvableType,
      supervisorId,
      status: 'pending',
      approvableSnapshot,
      risksSnapshot
    }, { transaction });

    // Update the invalidated approval to reference the new one
    await currentApproval.update({
      replacedByApprovalId: newApproval.id
    }, { transaction });

    // Create notification for supervisor (re-approval)
    const entityName = approvableType === 'task_hazards' ? 'Task Hazard' : 'Risk Assessment';
    const title = `${entityName} Requires Re-approval`;
    const message = `A ${entityName.toLowerCase()} has been modified and requires your re-approval.`;
    
    await Notification.create({
      userId: supervisorId,
      title: title,
      message: message,
      type: "approval"
    }, { transaction });

    const html = `
      <html lang="en">    
        <body>
          <h2>${title}</h2>
          <p>${message}</p>
        </body>
      </html>
    `;

    // Get supervisor details for email
    const supervisor = await User.findByPk(supervisorId);
    if (supervisor) {
      sendMail(supervisor.email, title, message, html);
    }

    return newApproval;

  } catch (error) {
    console.error('Error handling re-approval:', error);
    throw error;
  }
};

/**
 * Get current approval status for a specific approvable entity
 * Returns the latest active approval if exists
 * 
 * @param {number} approvableId - ID of the task hazard or risk assessment
 * @param {string} approvableType - 'task_hazards' or 'risk_assessments'
 * @returns {Object|null} Approval info or null if no active approval
 */
exports.getApprovalInfo = async (approvableId, approvableType) => {
  try {
    // Get current active approval (not invalidated)
    const currentApproval = await SupervisorApproval.findOne({
      where: {
        approvableId,
        approvableType,
        isInvalidated: false
      },
      include: [
        { model: User, as: 'supervisor', attributes: ['id', 'email', 'name', 'role'] }
      ],
      order: [['createdAt', 'DESC']]
    });

    if (currentApproval) {
      const response = {
        id: currentApproval.id,
        status: currentApproval.status,
        createdAt: currentApproval.createdAt,
        processedAt: currentApproval.processedAt,
        comments: currentApproval.comments,
        isInvalidated: false,
        isLatest: true,
        approvableType: currentApproval.approvableType,
        supervisor: currentApproval.supervisor,
        approvableData: currentApproval.approvableSnapshot,
      };

      // Add legacy fields for backwards compatibility
      if (approvableType === 'task_hazards') {
        response.taskHazardData = currentApproval.approvableSnapshot;
      }

      return response;
    }
    return null;
  } catch (error) {
    console.error('Error fetching approval info:', error);
    return null;
  }
};

/**
 * Retrieve all supervisor approvals for the authenticated user's company
 * - Admin/superuser: Can see all approvals for the company
 * - Supervisor: Can only see approvals they are responsible for
 * 
 * This is the NEW unified endpoint for all approval types
 */
exports.getAllApprovals = async (req, res) => {
  try {
    // Validate user company access
    const userCompanyId = req.user.company?.id;
    
    // Check if user has appropriate privileges
    const user = req.user;

    if (!user || !user.role || !(user.role === "admin" || user.role === "superuser" || user.role === "supervisor")) {
      return sendResponse(res, errorResponse("Access denied. Supervisor, admin, or superuser privileges required.", 403));
    }

    // Determine if user is admin/superuser or just supervisor
    const isSupervisor = user.role === "supervisor";

    // Parse query parameters for filtering
    const statusFilter = req.query.status;
    const typeFilter = req.query.approvableType || req.query.type; // 'task_hazards', 'risk_assessments', or 'all'
    const whereClause = {};
    
    if (statusFilter && ['pending', 'approved', 'rejected'].includes(statusFilter)) {
      whereClause.status = statusFilter;
    }

    if (typeFilter && ['task_hazards', 'risk_assessments'].includes(typeFilter)) {
      whereClause.approvableType = typeFilter;
    }

    // Optional invalidated filter
    if (req.query.includeInvalidated !== 'true') {
      whereClause.isInvalidated = false;
    }

    // Add supervisor filter if user is a supervisor (not admin/superuser)
    if (isSupervisor) {
      whereClause.supervisorId = user.id;
    }

    // Get approvals with polymorphic includes
    const approvals = await SupervisorApproval.findAll({
      include: [
        {
          model: TaskHazard,
          as: 'task_hazards',
          required: false,
          attributes: ['id', 'date', 'time', 'scopeOfWork', 'location', 'status'],
          include: [
            {
              model: User,
              as: 'individuals',
              attributes: ['id', 'email', 'name'],
              through: { attributes: [] }
            },
            {
              model: TaskRisk,
              as: 'risks',
              attributes: ['id', 'riskDescription', 'riskType', 'asIsLikelihood', 'asIsConsequence', 
                         'mitigatingAction', 'mitigatingActionType', 'mitigatedLikelihood', 
                         'mitigatedConsequence', 'requiresSupervisorSignature']
            }
          ]
        },
        {
          model: RiskAssessment,
          as: 'risk_assessments',
          required: false,
          attributes: ['id', 'date', 'time', 'scopeOfWork', 'location', 'status'],
          include: [
            {
              model: User,
              as: 'individuals',
              attributes: ['id', 'email', 'name'],
              through: { attributes: [] }
            },
            {
              model: RiskAssessmentRisk,
              as: 'risks',
              attributes: ['id', 'riskDescription', 'riskType', 'asIsLikelihood', 'asIsConsequence', 
                         'mitigatingAction', 'mitigatingActionType', 'mitigatedLikelihood', 
                         'mitigatedConsequence', 'requiresSupervisorSignature']
            }
          ]
        },
        {
          model: User,
          where: userCompanyId ? { company_id: userCompanyId } : {},
          as: 'supervisor',
          attributes: ['id', 'email', 'name', 'role']
        }
      ],
      where: whereClause,
      order: [['createdAt', 'DESC']]
    });

    // Group approvals by approvable entity
    const approvableMap = new Map();
    
    approvals.forEach(approval => {
      const approvableId = approval.approvableId;
      const approvableType = approval.approvableType;
      const key = `${approvableType}_${approvableId}`;
      
      if (!approvableMap.has(key)) {
        // Use the polymorphic approvable field set by the afterFind hook
        const approvableEntity = approval.approvable;
        
        approvableMap.set(key, {
          approvable: approvableEntity,
          approvableType: approvableType,
          approvals: []
        });
      }
      
      // Add approval to the approvable entity
      approvableMap.get(key).approvals.push(approval);
    });
    
    // Convert map to array and process each approvable entity
    const groupedApprovables = Array.from(approvableMap.values()).map(group => {
      // Sort approvals by creation date (most recent first)
      group.approvals.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      
      const latestApproval = group.approvals[0];
      const approvable = group.approvable;
      
      // Process each approval with appropriate data source
      const processedApprovals = group.approvals.map((approval, index) => {
        const isLatest = index === 0;
        
        // For latest approval, use live data; for others, use snapshot
        const approvableData = isLatest && approvable ? {
          id: approvable.id,
          date: approvable.date,
          time: approvable.time,
          scopeOfWork: approvable.scopeOfWork,
          location: approvable.location,
          status: approvable.status,
          risks: approvable.risks ? approvable.risks.map(risk => ({
            id: risk.id,
            riskDescription: risk.riskDescription,
            riskType: risk.riskType,
            asIsLikelihood: risk.asIsLikelihood,
            asIsConsequence: risk.asIsConsequence,
            mitigatingAction: risk.mitigatingAction,
            mitigatingActionType: risk.mitigatingActionType,
            mitigatedLikelihood: risk.mitigatedLikelihood,
            mitigatedConsequence: risk.mitigatedConsequence,
            requiresSupervisorSignature: risk.requiresSupervisorSignature
          })) : [],
          type: group.approvableType,
          // Add individuals field (array format for both entity types)
          individuals: approvable.individuals ? approvable.individuals.map(ind => ({
            id: ind.id,
            email: ind.email,
            name: ind.name
          })) : []
        } : {
          // Use snapshot data for historical approvals
          ...approval.approvableSnapshot,
          risks: approval.risksSnapshot
        };
        
        return {
          id: approval.id,
          status: approval.status,
          createdAt: approval.createdAt,
          processedAt: approval.processedAt,
          comments: approval.comments,
          isInvalidated: approval.isInvalidated,
          isLatest: isLatest,
          approvableType: approval.approvableType,
          supervisor: {
            id: approval.supervisor.id,
            email: approval.supervisor.email,
            name: approval.supervisor.name,
            role: approval.supervisor.role
          },
          approvableData: approvableData
        };
      });
      
      const entityData = {
        id: approvable ? approvable.id : latestApproval.approvableId,
        approvableType: group.approvableType,
        date: approvable ? approvable.date : latestApproval.approvableSnapshot.date,
        time: approvable ? approvable.time : latestApproval.approvableSnapshot.time,
        scopeOfWork: approvable ? approvable.scopeOfWork : latestApproval.approvableSnapshot.scopeOfWork,
        location: approvable ? approvable.location : latestApproval.approvableSnapshot.location,
        status: approvable ? approvable.status : latestApproval.approvableSnapshot.status,
        risks: approvable && approvable.risks ? approvable.risks.map(risk => ({
          id: risk.id,
          riskDescription: risk.riskDescription,
          riskType: risk.riskType,
          asIsLikelihood: risk.asIsLikelihood,
          asIsConsequence: risk.asIsConsequence,
          mitigatingAction: risk.mitigatingAction,
          mitigatingActionType: risk.mitigatingActionType,
          mitigatedLikelihood: risk.mitigatedLikelihood,
          mitigatedConsequence: risk.mitigatedConsequence,
          requiresSupervisorSignature: risk.requiresSupervisorSignature
        })) : (latestApproval.risksSnapshot || []),
        approvals: processedApprovals
      };
      
      // Add individuals field (array format for both entity types)
      const individualsList = approvable && approvable.individuals ? approvable.individuals : (latestApproval.approvableSnapshot.individuals || []);
      entityData.individuals = individualsList.map && Array.isArray(individualsList) ? individualsList.map(ind => ({
        id: ind.id,
        email: ind.email,
        name: ind.name
      })) : [];
      
      // Add supervisor email for consistency
      entityData.supervisor = latestApproval.supervisor ? latestApproval.supervisor.email : '';
      
      // Add latest approval info for easy access
      entityData.latestApproval = processedApprovals.find(a => a.isLatest) || null;
      
      return entityData;
    });
    
    // Sort approvable entities by most recent date
    groupedApprovables.sort((a, b) => new Date(b.date) - new Date(a.date));

    sendResponse(res, successResponse(
      "Supervisor approvals retrieved successfully",
      {
        entities: groupedApprovables,
        totalEntities: groupedApprovables.length,
        totalApprovals: approvals.length,
        filters: {
          status: statusFilter || 'all',
          type: typeFilter || 'all',
          includeInvalidated: req.query.includeInvalidated === 'true',
        },
      }
    ));

  } catch (error) {
    console.error('Error retrieving supervisor approvals:', error);
    sendResponse(res, errorResponse(
      error.message || "Some error occurred while retrieving supervisor approvals.",
      500
    ));
  }
};

/**
 * Process supervisor approval (approve or reject)
 * Works with both task hazards and risk assessments
 */
exports.processApproval = async (req, res) => {
  let transaction;
  
  try {
    // Validate user company access
    const userCompanyId = getCompanyId(req);
    const user = req.user;

    if (!user || !user?.role || user.role === "user") {
      return sendResponse(res, errorResponse("Access denied. Supervisor privileges required to process approvals.", 403));
    }

    console.log("userCompanyId:", userCompanyId);
    console.log("approval id:", req.params.id);

    // Find the approval record
    const approval = await SupervisorApproval.findByPk(req.params.id, {
      include: [
        { model: User, as: 'supervisor', attributes: ['id', 'email', 'name', 'role'] }
      ]
    });

    if (!approval) {
      return sendResponse(res, errorResponse("Approval record not found.", 404));
    }

    if (approval.status !== 'pending') {
      return sendResponse(res, errorResponse("This approval has already been processed.", 400));
    }

    if (approval.isInvalidated) {
      return sendResponse(res, errorResponse("This approval has been invalidated by subsequent changes.", 400));
    }

    // Verify the approvable entity exists and belongs to user's company
    await findApprovableByIdAndCompany(approval.approvableId, approval.approvableType, userCompanyId);

    // Get the approvable entity with individuals for notifications
    const { ApprovableModel } = getModelsForType(approval.approvableType);
    const approvableWithIndividuals = await ApprovableModel.findByPk(approval.approvableId, {
      include: [
        { model: User, as: 'individuals' }
      ]
    });

    transaction = await db.sequelize.transaction();

    let userName = user.name || user.email || user.id;
    let updatedApprovable;
    let approvalAction;
    let comments = `Updated by: ${userName}.`;
    let additionalComments = req.body.comments || "";
    comments += ` Comments: ${additionalComments}`;

    // Handle approval or rejection
    if (req.body.status === 'Approved') {
      // Approve the approval record
      await approval.approve(comments, transaction);
      
      // Update approvable entity status
      updatedApprovable = await approvableWithIndividuals.update({
        status: 'Active'  // or whatever status indicates approved
      }, { transaction });

      approvalAction = 'approved';

    } else if (req.body.status === 'Rejected') {
      // Reject the approval record
      await approval.reject(comments, transaction);
      
      // Update approvable entity status
      updatedApprovable = await approvableWithIndividuals.update({
        status: 'Rejected'
      }, { transaction });

      approvalAction = 'rejected';

    } else {
      await transaction.rollback();
      return sendResponse(res, errorResponse("Invalid approval status. Must be 'Approved' or 'Rejected'.", 400));
    }

    // Create notifications for all individuals
    const entityName = approval.approvableType === 'task_hazards' ? 'Task Hazard' : 'Risk Assessment';
    
    await Promise.all(approvableWithIndividuals.individuals.map(async individual => {
      await Notification.create({
        userId: individual.id,
        title: `${entityName} ${approvalAction.charAt(0).toUpperCase() + approvalAction.slice(1)}`,
        message: `A ${entityName.toLowerCase()} you are part of has been ${approvalAction} by your supervisor.`,
        type: approval.approvableType === 'task_hazards' ? "hazard" : "risk"
      }, { transaction });
    }));

    await transaction.commit();

    // Return response with approval details
    const response = {
      approvable: updatedApprovable,
      approval: {
        id: approval.id,
        status: approval.status,
        processedAt: approval.processedAt,
        comments: approval.comments,
        approvableType: approval.approvableType,
        supervisor: {
          id: user.id,
          email: user.email,
          name: user.name
        }
      }
    };

    sendResponse(res, successResponse(
      `${entityName} ${approvalAction} successfully`, 
      response
    ));

  } catch (error) {
    if (transaction) await transaction.rollback();
    
    console.error('Error processing supervisor approval:', error);
    sendResponse(res, errorResponse(
      error.message || "Some error occurred while processing the approval.",
      500
    ));
  }
};

/**
 * Get approval history for a specific approvable entity
 * Returns all approval records including invalidated ones for audit trail
 */
exports.getApprovalHistory = async (req, res) => {
  try {
    // Validate user company access
    const userCompanyId = getCompanyId(req);
    const { approvableType } = req.query;
    
    if (!approvableType || !['task_hazards', 'risk_assessments'].includes(approvableType)) {
      return sendResponse(res, errorResponse("Valid approvableType query parameter required (task_hazards or risk_assessments).", 400));
    }

    // Find approvable entity with company validation
    await findApprovableByIdAndCompany(req.params.id, approvableType, userCompanyId);

    // Get all approval records for this approvable entity (including invalidated ones)
    const approvalHistory = await SupervisorApproval.findAll({
      where: { 
        approvableId: req.params.id,
        approvableType: approvableType
      },
      include: [
        { 
          model: User, 
          as: 'supervisor', 
          attributes: ['id', 'email', 'name', 'role'] 
        },
        {
          model: SupervisorApproval,
          as: 'replacedByApproval',
          required: false,
          attributes: ['id', 'status', 'createdAt']
        }
      ],
      order: [['createdAt', 'DESC']]
    });

    // Format approval history for response
    const formattedHistory = approvalHistory.map(approval => {
      const formatted = {
        id: approval.id,
        status: approval.status,
        createdAt: approval.createdAt,
        processedAt: approval.processedAt,
        comments: approval.comments,
        isInvalidated: approval.isInvalidated,
        approvableType: approval.approvableType,
        supervisor: {
          id: approval.supervisor.id,
          email: approval.supervisor.email,
          name: approval.supervisor.name,
          role: approval.supervisor.role
        },
        approvableSnapshot: approval.approvableSnapshot,
        risksSnapshot: approval.risksSnapshot,
        replacedBy: approval.replacedByApproval ? {
          id: approval.replacedByApproval.id,
          status: approval.replacedByApproval.status,
          createdAt: approval.replacedByApproval.createdAt
        } : null
      };

      // Add legacy fields for backwards compatibility
      if (approvableType === 'task_hazards') {
        formatted.taskHazardSnapshot = approval.approvableSnapshot;
      }

      return formatted;
    });

    const entityName = approvableType === 'task_hazards' ? 'Task Hazard' : 'Risk Assessment';

    sendResponse(res, successResponse(
      "Approval history retrieved successfully",
      {
        approvableId: parseInt(req.params.id),
        approvableType: approvableType,
        entityName: entityName,
        totalApprovals: formattedHistory.length,
        approvals: formattedHistory
      }
    ));

  } catch (error) {
    console.error('Error retrieving approval history:', error);
    
    if (error.message.includes("not found")) {
      return sendResponse(res, errorResponse(error.message, 404));
    }
    
    sendResponse(res, errorResponse(
      error.message || `Error retrieving approval history for approvable entity with id ${req.params.id}`,
      500
    ));
  }
};

module.exports = exports;





