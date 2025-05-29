const db = require('../models');
const { checkPermission } = require('../middleware/auth');
const User = require('../models/User');
const { v4: uuidv4 } = require('uuid');

// Create a new Tactic
exports.create = async (req, res) => {
  try {
    if (!req.user || !req.user.company) {
      return res.status(401).json({ message: 'Unauthorized: User or company not found' });
    }

    const { analysisName, location, status, ...assetDetails } = req.body;
    console.log(req.body);
    
    // Create the tactic with all fields
    const tactic = await db.tactics.create({
      id: uuidv4(),
      company: req.user.company,
      analysisName,
      location,
      status,
      ...assetDetails,
    });
    
    res.status(201).json({
      status: true,
      data: tactic,
      message: 'Tactic created successfully'
    });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// Retrieve all Tactics
exports.findAll = async (req, res) => {
  try {
    if (!req.user || !req.user.company) {
      return res.status(401).json({ 
        status: false,
        message: 'Unauthorized: User or company not found' 
      });
    }

    const tactics = await db.tactics.findAll({
      where: {
        company: req.user.company
      }
    });
    
    console.log("tactics", tactics);
    res.json({
      status: true,
      data: tactics,
      message: 'Tactics retrieved successfully'
    });
  } catch (error) {
    console.error('Error fetching tactics:', error);
    res.status(500).json({ 
      status: false,
      message: error.message 
    });
  }
};

// Retrieve a single Tactic with id
exports.findOne = async (req, res) => {
  try {
    if (!req.user || !req.user.company) {
      return res.status(401).json({ message: 'Unauthorized: User or company not found' });
    }

    const tactic = await db.tactics.findOne({
      where: {
        id: req.params.id,
        company: req.user.company
      },
      include: [{
        model: db.User,
        as: 'creator',
        attributes: ['email']
      }]
    });
    
    if (!tactic) {
      return res.status(404).json({ message: 'Tactic not found' });
    }
    
    res.json(tactic);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Update a Tactic with id
exports.update = async (req, res) => {
  try {
    if (!req.user || !req.user.company) {
      return res.status(401).json({ message: 'Unauthorized: User or company not found' });
    }

    const [updated] = await db.tactics.update(req.body, {
      where: {
        id: req.params.id,
        company: req.user.company
      },
      returning: true
    });
    
    if (!updated) {
      return res.status(404).json({ message: 'Tactic not found' });
    }
    
    const tactic = await db.tactics.findOne({
      where: { 
        id: req.params.id,
        company: req.user.company
      },
      include: [{
        model: db.User,
        as: 'creator',
        attributes: ['email']
      }]
    });
    
    res.json(tactic);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// Delete a Tactic with id
exports.delete = async (req, res) => {
  try {
    if (!req.user || !req.user.company) {
      return res.status(401).json({ message: 'Unauthorized: User or company not found' });
    }

    const deleted = await db.tactics.destroy({
      where: {
        id: req.params.id,
        company: req.user.company
      }
    });
    
    if (!deleted) {
      return res.status(404).json({ message: 'Tactic not found' });
    }
    
    res.json({ message: 'Tactic deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}; 