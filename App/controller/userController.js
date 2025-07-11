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
    if (req.body && req.params.id) {
      let userId = req.params.id;
      let UserSet = req.body;
      let user = await User.findOne({ where: { id: userId } });
      // Check if record exists in db
      if (user) {
        var edited = await user.update(UserSet);
      }

      if (edited) {
        res.send(edited);
      } else {
        res
          .status(500)
          .send({ status: 500, data: null, message: "User not  found" })
          .end();
      }
    }
  } catch (err) {
    return res.status(500).send(err);
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
    console.log("userId",userId);
    const user = await User.findOne({ where: { id: userId } });
    if (!user) {
      return res.status(404).send({ status: 404, message: "User not found" });
    }
    await user.destroy();
    return res.status(200).send({ status: 200, message: "User deleted successfully" });
  } catch (err) {
    return res.status(500).send(err);
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
