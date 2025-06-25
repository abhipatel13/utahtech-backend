const models = require("../models");
const User = models.users;
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
    const existingUser = await User.findOne({ where: { email: user.email } });
    if (existingUser) {
      return res.status(400).send({ status: 400, message: "Email is already associated with an account" });
    }

    // Lookup the company id, if not provided
    if (user.company_id === undefined || user.company_id === "") {
      if (user.company === undefined || user.company === "") {
        return res.status(400).send({ status: 400, message: "Company is required" });
      }
      const company = await models.company.findOne({
        where: { name: user.company },
      });
      if (!company) {
        return res.status(404).send({ status: 404, message: "Company not found" });
      }
      user.company_id = company.id;
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
    const result = await User.findAll({
      attributes: ["id", "email", "name", "phone_no", "profile_pic"],
    });

    if (result.length) {
      return res.status(201).send({ status: 201, data: result });
    } else {
      return res.status(401).send({ status: 401, message: "User not Found" });
    }
  } catch (err) {
    return res.status(500).send(err);
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
