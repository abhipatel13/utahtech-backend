'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // First, add the new columns
    await queryInterface.addColumn('tactics', 'analysis_name', {
      type: Sequelize.STRING,
      allowNull: false,
      after: 'id'
    });

    await queryInterface.addColumn('tactics', 'asset_details', {
      type: Sequelize.JSON,
      allowNull: false,
      after: 'status'
    });

    // Then migrate existing data
    const tactics = await queryInterface.sequelize.query(
      'SELECT * FROM tactics',
      { type: queryInterface.sequelize.QueryTypes.SELECT }
    );

    for (const tactic of tactics) {
      const assetDetails = {
        asset_id: tactic.asset_number,
        manufacturer: tactic.manufacturer,
        model: tactic.model,
        asset_group: tactic.asset_group,
        description: tactic.asset_description,
        criticality: tactic.criticality,
        failure_mode: tactic.failure_mode,
        failure_cause: tactic.failure_cause,
        failure_effect: tactic.failure_effect,
        failure_evident: tactic.step1_failure_evident,
        affects_safety: tactic.step2_affects_safety_environment,
        suitable_task: tactic.step3_suitable_task_exists,
        maintenance_strategy: tactic.maintenance_strategy,
        controls: tactic.current_controls,
        actions: tactic.recommended_actions,
        responsibility: tactic.responsibility,
        activity_name: tactic.activity_name,
        activity_desc: tactic.activity_description,
        activity_type: tactic.activity_type,
        activity_cause: tactic.activity_cause,
        activity_source: tactic.activity_source,
        tactic: tactic.tactic,
        shutdown: tactic.shutdown_type,
        department: tactic.department,
        frequency: tactic.frequency,
        doc_number: tactic.document_number,
        doc_desc: tactic.document_description,
        picture: tactic.picture,
        resource: tactic.resource_type,
        hours: tactic.usage_hours,
        units: tactic.assigned_units,
        overhaul: tactic.major_overhaul,
        shutdowns: tactic.other_shutdowns
      };

      await queryInterface.sequelize.query(
        'UPDATE tactics SET asset_details = :assetDetails WHERE id = :id',
        {
          replacements: { 
            assetDetails: JSON.stringify(assetDetails),
            id: tactic.id 
          }
        }
      );
    }

    // Finally, drop the old columns
    const columnsToRemove = [
      'asset_number', 'manufacturer', 'model', 'asset_group', 'asset_description',
      'criticality', 'failure_mode', 'failure_cause', 'failure_effect',
      'step1_failure_evident', 'step2_affects_safety_environment',
      'step3_suitable_task_exists', 'maintenance_strategy', 'current_controls',
      'recommended_actions', 'responsibility', 'activity_name', 'activity_description',
      'activity_type', 'activity_cause', 'activity_source', 'tactic', 'shutdown_type',
      'department', 'frequency', 'document_number', 'document_description', 'picture',
      'resource_type', 'usage_hours', 'assigned_units', 'major_overhaul', 'other_shutdowns'
    ];

    for (const column of columnsToRemove) {
      await queryInterface.removeColumn('tactics', column);
    }
  },

  down: async (queryInterface, Sequelize) => {
    // First, recreate all the old columns
    const columns = {
      asset_number: { type: Sequelize.STRING, allowNull: false },
      manufacturer: { type: Sequelize.STRING, allowNull: false },
      model: { type: Sequelize.STRING, allowNull: false },
      asset_group: { type: Sequelize.STRING, allowNull: false },
      asset_description: { type: Sequelize.STRING, allowNull: false },
      criticality: { type: Sequelize.STRING, allowNull: false },
      failure_mode: { type: Sequelize.STRING, allowNull: false },
      failure_cause: { type: Sequelize.STRING, allowNull: false },
      failure_effect: { type: Sequelize.STRING, allowNull: false },
      step1_failure_evident: { type: Sequelize.STRING, defaultValue: 'Yes' },
      step2_affects_safety_environment: { type: Sequelize.STRING, defaultValue: 'No' },
      step3_suitable_task_exists: { type: Sequelize.STRING, defaultValue: 'Yes' },
      maintenance_strategy: { type: Sequelize.STRING, defaultValue: 'Schedule preventive' },
      current_controls: { type: Sequelize.STRING },
      recommended_actions: { type: Sequelize.STRING },
      responsibility: { type: Sequelize.STRING },
      activity_name: { type: Sequelize.STRING },
      activity_description: { type: Sequelize.STRING },
      activity_type: { type: Sequelize.STRING },
      activity_cause: { type: Sequelize.STRING },
      activity_source: { type: Sequelize.STRING },
      tactic: { type: Sequelize.STRING },
      shutdown_type: { type: Sequelize.STRING },
      department: { type: Sequelize.STRING },
      frequency: { type: Sequelize.STRING },
      document_number: { type: Sequelize.STRING },
      document_description: { type: Sequelize.STRING },
      picture: { type: Sequelize.STRING },
      resource_type: { type: Sequelize.STRING },
      usage_hours: { type: Sequelize.STRING },
      assigned_units: { type: Sequelize.STRING },
      major_overhaul: { type: Sequelize.STRING },
      other_shutdowns: { type: Sequelize.STRING }
    };

    for (const [columnName, columnDef] of Object.entries(columns)) {
      await queryInterface.addColumn('tactics', columnName, columnDef);
    }

    // Then migrate data back from JSON
    const tactics = await queryInterface.sequelize.query(
      'SELECT id, asset_details FROM tactics',
      { type: queryInterface.sequelize.QueryTypes.SELECT }
    );

    for (const tactic of tactics) {
      const assetDetails = JSON.parse(tactic.asset_details);
      await queryInterface.sequelize.query(
        `UPDATE tactics SET 
          asset_number = :asset_id,
          manufacturer = :manufacturer,
          model = :model,
          asset_group = :asset_group,
          asset_description = :description,
          criticality = :criticality,
          failure_mode = :failure_mode,
          failure_cause = :failure_cause,
          failure_effect = :failure_effect,
          step1_failure_evident = :failure_evident,
          step2_affects_safety_environment = :affects_safety,
          step3_suitable_task_exists = :suitable_task,
          maintenance_strategy = :maintenance_strategy,
          current_controls = :controls,
          recommended_actions = :actions,
          responsibility = :responsibility,
          activity_name = :activity_name,
          activity_description = :activity_desc,
          activity_type = :activity_type,
          activity_cause = :activity_cause,
          activity_source = :activity_source,
          tactic = :tactic,
          shutdown_type = :shutdown,
          department = :department,
          frequency = :frequency,
          document_number = :doc_number,
          document_description = :doc_desc,
          picture = :picture,
          resource_type = :resource,
          usage_hours = :hours,
          assigned_units = :units,
          major_overhaul = :overhaul,
          other_shutdowns = :shutdowns
        WHERE id = :id`,
        {
          replacements: { 
            ...assetDetails,
            id: tactic.id 
          }
        }
      );
    }

    // Finally remove the new columns
    await queryInterface.removeColumn('tactics', 'asset_details');
    await queryInterface.removeColumn('tactics', 'analysis_name');
  }
}; 