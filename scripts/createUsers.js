const bcrypt = require("bcryptjs");
const e = require("express");
require("dotenv").config();

const createUsers = async (sequelize) => {
  // Provide a company name and the number fo users to create for each role
  const companyName = "Madeup Mining Co";
  const roles = [
    ["superuser", 1],
    ["admin", 1],
    ["supervisor", 2],
    ["user", 5],
  ];

  try {
    const CompanyModel = sequelize.models.company;
    if (!CompanyModel) {
      throw new Error("Company model not found");
    }

    // Check if the company exists
    let company = await CompanyModel.findOne({ where: { name: companyName } });
    if (!company) {
      // If the company does not exist, create it
      company = await CompanyModel.create({ name: companyName });
      console.log("Created company:", company);
    } else {
    //   console.log("Company already exists:", company);
    }

    const UserModel = sequelize.models.users;
    if (!UserModel) {
      throw new Error("User model not found");
    }
    // Get existing users for the company
    const existingUsers = await UserModel.findAll({
      where: { company_id: company.id },
    });

    const existingUsersByRole = {};
    for (const user of existingUsers) {
      if (!existingUsersByRole[user.role]) {
        existingUsersByRole[user.role] = [];
      }
      existingUsersByRole[user.role].push(user);
    }
    // console.log('Existing users by role:', existingUsersByRole);

    // Create users for each role
    for (let i = 0; i < roles.length; i++) {
      const [role, requiredCount] = roles[i];
      const existingCount = existingUsersByRole[role]
        ? existingUsersByRole[role].length
        : 0;
      for (let j = existingCount; j < requiredCount; j++) {
        const email = `${role}${j + 1}@${companyName
          .replace(/\s+/g, "")
          .toLowerCase()}.com`;
        const password = `${role}${j + 1}123`;
        const hashedPassword = bcrypt.hashSync(password, 10);
        var supervisorId = null;

        // Select a random supervisor if the role is 'user'
        if (
          role === "user" &&
          existingUsersByRole["supervisor"] &&
          existingUsersByRole["supervisor"].length > 0
        ) {
          const supervisors = existingUsersByRole["supervisor"];
          supervisorId =
            supervisors[Math.floor(Math.random() * supervisors.length)].id;
        }
        console.log(
          `Creating user: ${email} with role: ${role}, supervisorId: ${supervisorId}`
        );

        await UserModel.create({
          email: email,
          password: hashedPassword,
          role: role,
          company_id: company.id,
          supervisorId: supervisorId,
        }).then((user) => {
          if (!existingUsersByRole[user.role]) {
            existingUsersByRole[user.role] = [];
          }
          existingUsersByRole[user.role].push(user);
        });
        console.log(`User ${email} created successfully with role ${role}.`);
      }
    }
    console.log("All users created successfully.");

  } catch (error) {
    console.error("Error creating users:", error);
  }
  process.exit(0);
};

module.exports = createUsers;
