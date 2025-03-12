const db = require("../models");
const AssetHierarchy = db.asset_hierarchy;
const csv = require('csv-parse');
const fs = require('fs');

// Create and Save new Asset Hierarchy entries
exports.create = async (req, res) => {
  try {
    // Validate request
    if (!req.body.assets || !Array.isArray(req.body.assets)) {
      return res.status(400).json({
        status: false,
        message: "Assets array is required"
      });
    }

    // Validate each asset
    const validationErrors = [];
    req.body.assets.forEach((asset, index) => {
      if (!asset.id || !asset.name) {
        validationErrors.push(`Asset at index ${index} is missing required fields (id, name)`);
      }
      if (asset.level === undefined || isNaN(asset.level)) {
        validationErrors.push(`Asset at index ${index} has invalid level value`);
      }
    });

    if (validationErrors.length > 0) {
      return res.status(400).json({
        status: false,
        message: "Validation failed",
        errors: validationErrors
      });
    }

    // Start transaction
    const result = await db.sequelize.transaction(async (t) => {
      // Create all assets
      const assets = await Promise.all(
        req.body.assets.map(asset => 
          AssetHierarchy.create({
            id: asset.id,
            name: asset.name,
            description: asset.description || null,
            parent: asset.parent || null,
            level: parseInt(asset.level) || 0,
            fmea: asset.fmea || null,
            actions: asset.actions || null,
            criticalityAssessment: asset.criticalityAssessment || null,
            inspectionPoints: asset.inspectionPoints || null
          }, { transaction: t })
        )
      );

      return assets;
    });

    res.status(201).json({
      status: true,
      message: "Asset Hierarchy created successfully",
      data: result
    });

  } catch (error) {
    res.status(500).json({
      status: false,
      message: error.message || "Some error occurred while creating the Asset Hierarchy."
    });
  }
};

// Handle CSV file upload
exports.uploadCSV = async (req, res) => {
  try {
    console.log('Request received:', {
      body: req.body,
      file: req.file,
      headers: req.headers
    });

    if (!req.file) {
      console.log('No file received in request');
      return res.status(400).json({
        status: false,
        message: "No file uploaded. Please upload a CSV file.",
        details: "The request must include a file with the field name 'file'"
      });
    }

    console.log('File received:', {
      filename: req.file.filename,
      path: req.file.path,
      size: req.file.size,
      mimetype: req.file.mimetype,
      originalname: req.file.originalname
    });

    // Verify file exists
    if (!fs.existsSync(req.file.path)) {
      console.error('File not found at path:', req.file.path);
      return res.status(400).json({
        status: false,
        message: "File upload failed",
        details: "The uploaded file could not be found"
      });
    }

    const assets = [];
    const errors = [];

    // Read the file content first to check its structure
    const fileContent = fs.readFileSync(req.file.path, 'utf-8');
    console.log('File content preview:', fileContent.substring(0, 500));

    await new Promise((resolve, reject) => {
      fs.createReadStream(req.file.path)
        .pipe(csv.parse({ 
          columns: true, 
          skip_empty_lines: true,
          trim: true,
          relax_quotes: true,
          relax_column_count: true
        }))
        .on('data', (row) => {
          try {
            console.log('Processing row:', row);
            
            // Log the actual values being checked
            console.log('Row validation:', {
              id: row.id,
              name: row.name,
              level: row.level
            });

            if (!row.id || !row.name) {
              const error = `Row missing required fields (id, name): ${JSON.stringify(row)}`;
              console.error(error);
              errors.push(error);
              return;
            }

            const level = parseInt(row.level);
            if (isNaN(level)) {
              const error = `Invalid level value for asset ${row.id}: ${row.level}`;
              console.error(error);
              errors.push(error);
              return;
            }
            
            assets.push({
              id: row.id,
              name: row.name,
              description: row.description || null,
              parent: row.parent || null,
              level: level,
              fmea: row.fmea || null,
              actions: row.actions || null,
              criticalityAssessment: row.criticalityAssessment || null,
              inspectionPoints: row.inspectionPoints || null
            });
          } catch (error) {
            console.error('Error processing row:', error);
            errors.push(`Error processing row: ${error.message}`);
          }
        })
        .on('end', () => {
          console.log(`Processed ${assets.length} assets, found ${errors.length} errors`);
          if (errors.length > 0) {
            console.log('Validation errors:', errors);
          }
          resolve();
        })
        .on('error', (error) => {
          console.error('Error reading CSV:', error);
          reject(error);
        });
    });

    // If there are validation errors, return them
    if (errors.length > 0) {
      // Clean up the uploaded file
      fs.unlinkSync(req.file.path);
      return res.status(400).json({
        status: false,
        message: "CSV validation failed",
        errors: errors,
        details: "Please check the CSV file format and ensure all required fields are present"
      });
    }

    // Create all assets in a transaction
    const result = await db.sequelize.transaction(async (t) => {
      // First, clear existing data
      await AssetHierarchy.destroy({ where: {}, transaction: t });
      
      // Then create new assets
      const createdAssets = await Promise.all(
        assets.map(asset => 
          AssetHierarchy.create(asset, { transaction: t })
        )
      );

      return createdAssets;
    });

    // Clean up the uploaded file
    fs.unlinkSync(req.file.path);

    res.status(201).json({
      status: true,
      message: "Asset Hierarchy uploaded successfully",
      data: result
    });

  } catch (error) {
    console.error('Error in uploadCSV:', error);
    // Clean up the uploaded file in case of error
    if (req.file && req.file.path) {
      fs.unlinkSync(req.file.path);
    }
    res.status(500).json({
      status: false,
      message: error.message || "Some error occurred while uploading the Asset Hierarchy.",
      details: error.stack
    });
  }
};

// Retrieve all Asset Hierarchy entries
exports.findAll = async (req, res) => {
  try {
    const assets = await AssetHierarchy.findAll({
      order: [['level', 'ASC'], ['name', 'ASC']]
    });
    
    res.status(200).json({
      status: true,
      data: assets
    });
  } catch (error) {
    res.status(500).json({
      status: false,
      message: error.message || "Some error occurred while retrieving asset hierarchy."
    });
  }
};

// Find a single Asset Hierarchy entry with an id
exports.findOne = async (req, res) => {
  try {
    const asset = await AssetHierarchy.findByPk(req.params.id, {
      include: [{
        model: AssetHierarchy,
        as: 'children',
        include: [{
          model: AssetHierarchy,
          as: 'children'
        }]
      }]
    });

    if (!asset) {
      return res.status(404).json({
        status: false,
        message: "Asset not found"
      });
    }

    res.status(200).json({
      status: true,
      data: asset
    });
  } catch (error) {
    res.status(500).json({
      status: false,
      message: error.message || "Error retrieving Asset with id " + req.params.id
    });
  }
}; 