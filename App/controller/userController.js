const models = require("../models");
const User = models.user;
const Op = models.Sequelize.Op;
const bcrypt = require("bcryptjs");

module.exports.createUser = async (req, res) => {
  const requiredFields = ["email", "password", "role"];
  try {
    requiredFields.forEach((field) => {
      if (!req.body[field] || req.body[field] === "") {
        return res.status(400).send({ status: 400, message: `${field} is required` });
      }
    });

    // Check if email is already in use
    let user = req.body;
    user.company_id = req.user.company_id;
    const existingUser = await User.findOne({ where: { email: user.email } });
    if (existingUser) {
      return res.status(400).send({ status: 400, message: "Email is already associated with an account" });
    }

    

    // Verfify password is hashed
    const hashRegex = /^\$2b\$/;
    if (!hashRegex.test(user.password)) {
      user.password = bcrypt.hashSync(user.password, 10);
    }

    // Create new user
    const newUser = await User.create(user);
    console.log(newUser);
    return res.status(201).send({ status: 201, data: newUser });
  } catch (err) {
    return res.status(500).send(err);
  }
};

module.exports.getAllUser = async (req, res) => {
  try {
    console.log("getAllUser");
    
    // Check if user has permission to view all users
    if (!req.user || !['admin', 'superuser'].includes(req.user.role)) {
      return res.status(403).send({ 
        status: 403, 
        message: "Access denied. Admin privileges required to view all users." 
      });
    }

    const result = await User.unscoped().findAll({
      attributes: ["id", "email", "name", "phone_no", "profile_pic","role", "company_id","supervisor_id","createdAt","updatedAt"],
      include: [
        {
          model: models.company,
          as: 'company',
          attributes: ["id", "name"],
        },
      ],
      where: {
        deleted_at: null, 
        company_id: req.user.company_id 
      }
    });

    if (result.length) {
      return res.status(200).send({ status: 200, data: result });
    } else {
      return res.status(404).send({ status: 404, message: "No users found" });
    }
  } catch (err) {
    console.error("Error in getAllUser:", err);
    return res.status(500).send({ status: 500, message: "Internal server error", error: err.message });
  }
};

module.exports.getAllUserRestricted = async (req, res) => {
  try {
    console.log("getAllUserRestricted");
    
    const result = await User.scope('basic').findAll({
      where: {
        company_id: req.user.company_id ,
      }
    });

    if (result.length) {
      return res.status(200).send({ status: 200, data: result });
    } else {
      return res.status(404).send({ status: 404, message: "No users found" });
    }
  } catch (err) {
    console.error("Error in getAllUser:", err);
    return res.status(500).send({ status: 500, message: "Internal server error", error: err.message });
  }
};


module.exports.updateUser = async (req, res) => {
  try {
    const userId = req.params.id;
    const { email, role, password, name, phone_no } = req.body;

    // Only superusers can update users
    if (req.user.role !== 'superuser') {
      return res.status(403).send({ 
        status: 403, 
        message: "Access denied. Only superusers can update users." 
      });
    }

    // Find the user to update
    const user = await User.findOne({ 
      where: { 
        id: userId,
        company_id: req.user.company_id
      } 
    });

    if (!user) {
      return res.status(404).send({ 
        status: 404, 
        message: "User not found or access denied" 
      });
    }

    // Prepare update data
    const updateData = {};
    
    // Update email if provided
    if (email && email !== user.email) {
      // Check if email is already in use
      const existingUser = await User.findOne({ 
        where: { 
          email: email,
          id: { [Op.ne]: userId } // Exclude current user
        } 
      });
      
      if (existingUser) {
        return res.status(400).send({ 
          status: 400, 
          message: "Email is already in use by another user" 
        });
      }
      updateData.email = email;
    }

    // Update role if provided
    if (role && role !== user.role) {
      const validRoles = ['superuser', 'admin', 'supervisor', 'user'];
      if (!validRoles.includes(role)) {
        return res.status(400).send({ 
          status: 400, 
          message: "Invalid role. Must be one of: " + validRoles.join(', ') 
        });
      }
      updateData.role = role;
    }

    // Update password if provided
    if (password) {
      // Hash the new password
      const hashRegex = /^\$2b\$/;
      if (!hashRegex.test(password)) {
        updateData.password = bcrypt.hashSync(password, 10);
      } else {
        updateData.password = password;
      }
    }

    // Update other fields
    if (name !== undefined) updateData.name = name;
    if (phone_no !== undefined) updateData.phone_no = phone_no;

    // Update the user
    const updatedUser = await user.update(updateData);

    // Return updated user without password
    const userResponse = {
      id: updatedUser.id,
      email: updatedUser.email,
      name: updatedUser.name,
      phone_no: updatedUser.phone_no,
      role: updatedUser.role,
      company_id: updatedUser.company_id,
      updatedAt: updatedUser.updatedAt
    };

    return res.status(200).send({ 
      status: 200, 
      data: userResponse,
      message: "User updated successfully" 
    });

  } catch (err) {
    console.error("Error in updateUser:", err);
    
    // Handle Sequelize validation errors
    if (err.name === 'SequelizeValidationError') {
      const validationErrors = err.errors.map(error => ({
        field: error.path,
        message: error.message,
        value: error.value
      }));
      
      return res.status(400).send({ 
        status: 400, 
        message: "Validation error", 
        errors: validationErrors
      });
    }
    
    // Handle unique constraint errors
    if (err.name === 'SequelizeUniqueConstraintError') {
      return res.status(400).send({ 
        status: 400, 
        message: "Email already exists", 
        error: "A user with this email already exists"
      });
    }
    
    return res.status(500).send({ 
      status: 500, 
      message: "Internal server error", 
      error: err.message 
    });
  }
};

module.exports.getUserById = async function (req, res) {
  try {
    var userId = req.params.id;
    let user = await User.findOne({
      where: { id: userId },
      include: ["supervisor"],
    });
    if (user) {
      res.status(200).send({ status: 200, data: user }).end();
    } else {
      res
        .status(500)
        .send({ status: 500, data: null, message: "User not  found" })
        .end();
    }
  } catch (e) {
    return res.status(500).send(e);
  }
};

module.exports.deleteUser = async (req, res) => {
  try {
    const userId = req.params.id;

    // Only superusers can delete users
    if (req.user.role !== 'superuser') {
      return res.status(403).send({ 
        status: 403, 
        message: "Access denied. Only superusers can delete users." 
      });
    }

    const user = await User.findOne({ 
      where: { 
        id: userId,
        company_id: req.user.company_id // Can only delete users from same company
      } 
    });

    if (!user) {
      return res.status(404).send({ 
        status: 404, 
        message: "User not found or access denied" 
      });
    }

    await user.destroy();
    return res.status(200).send({ 
      status: 200, 
      message: "User deleted successfully" 
    });
  } catch (err) {
    console.error("Error in deleteUser:", err);
    return res.status(500).send({ 
      status: 500, 
      message: "Internal server error", 
      error: err.message 
    });
  }
};

// Reset user password (superuser only)
module.exports.resetUserPassword = async (req, res) => {
  try {
    const userId = req.params.id;
    const { newPassword } = req.body;

    // Only superusers can reset passwords
    if (req.user.role !== 'superuser') {
      return res.status(403).send({ 
        status: 403, 
        message: "Access denied. Only superusers can reset passwords." 
      });
    }

    if (!newPassword) {
      return res.status(400).send({ 
        status: 400, 
        message: "New password is required" 
      });
    }

    // Find the user to update
    const user = await User.findOne({ 
      where: { 
        id: userId,
        company_id: req.user.company_id // Can only reset passwords for users from same company
      } 
    });

    if (!user) {
      return res.status(404).send({ 
        status: 404, 
        message: "User not found or access denied" 
      });
    }

    // Hash the new password
    const hashedPassword = bcrypt.hashSync(newPassword, 10);

    // Update the user's password
    await user.update({ password: hashedPassword });

    return res.status(200).send({ 
      status: 200, 
      message: "Password reset successfully" 
    });

  } catch (err) {
    console.error("Error in resetUserPassword:", err);
    return res.status(500).send({ 
      status: 500, 
      message: "Internal server error", 
      error: err.message 
    });
  }
};

// Alternative raw SQL approach (uncomment if unscoped() still doesn't work)
/*
module.exports.getAllUserRaw = async (req, res) => {
  try {
    console.log("getAllUser with raw SQL");
    
    // Check if user has permission to view all users
    if (!req.user || !['admin', 'superuser'].includes(req.user.role)) {
      return res.status(403).send({ 
        status: 403, 
        message: "Access denied. Admin privileges required to view all users." 
      });
    }

    const [results] = await models.sequelize.query(`
      SELECT 
        u.id, u.email, u.name, u.phone_no, u.profile_pic, u.role, 
        u.company_id, u.supervisor_id, u.created_at as createdAt, u.updated_at as updatedAt,
        c.id as "company.id", c.name as "company.name"
      FROM users u
      LEFT JOIN company c ON u.company_id = c.id
      WHERE u.deleted_at IS NULL
      ORDER BY u.id
    `);

    console.log("Raw SQL result", results);

    if (results.length) {
      return res.status(200).send({ status: 200, data: results });
    } else {
      return res.status(404).send({ status: 404, message: "No users found" });
    }
  } catch (err) {
    console.error("Error in getAllUserRaw:", err);
    return res.status(500).send({ status: 500, message: "Internal server error", error: err.message });
  }
};
*/
