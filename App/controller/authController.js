/* eslint-disable no-restricted-syntax */
const _ = require('lodash');
const models = require('../models');
const User = models.users;
const Op = models.Sequelize.Op;
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const passwordResetToken = models.reset_passwords;
const crypto = require('crypto');
const transporter = require('../helper/mail.helper.js');

module.exports.login = async (req, res) => {
	const body = _.pick(req.body, ['email', 'password', 'company']);

	if (
		body.email === undefined ||
		body.email === '' ||
		body.password === undefined ||
		body.password === '' ||
		body.company === undefined ||
		body.company === ''
	) {
		return res.status(400).json({
			status: false,
			message: 'Email, password, and company are required',
			data: {}
		});
	}

	try {
		// Find user by both email and company
		const matched_user = await User.findOne({ 
			where: {
				email: body.email,
				company: body.company,
				is_deleted: '0'  // Only active users
			}
		});

		if (!matched_user) {
			return res.status(401).json({
				status: false,
				message: "Invalid email or company name"
			});
		}

		// Verify password
		let passwordHash = matched_user.password;
		if (bcrypt.compareSync(body.password, passwordHash)) {
			const token = generateAccessToken(matched_user.id.toString());
			
			// Return user data without sensitive information
			return res.header('Authorization', token).json({
				status: true,
				message: 'Login successful',
				data: {
					user: {
						id: matched_user.id,
						email: matched_user.email,
						name: matched_user.name,
						company: matched_user.company,
						role: matched_user.role,
						department: matched_user.department,
						business_unit: matched_user.business_unit,
						plant: matched_user.plant,
						user_type: matched_user.user_type
					},
					token
				}
			});
		} else {
			return res.status(401).json({
				status: false,
				message: "Invalid password"
			});
		}
	} catch (error) {
		console.error('Login error:', error);
		return res.status(500).json({ 
			status: false, 
			message: "Internal server error",
			error: error.message 
		});
	}
};

function generateAccessToken(userid) {
	// expires after half and hour (1800 seconds = 30 minutes)
	return jwt.sign({userId : userid}, process.env.TOKEN_SECRET, { expiresIn: '1h' });
  }



  module.exports.forgotPassword = async function (req, res) {
    if (!req.body.email) {
        return res
        .status(500)
        .json({ status : 500, message: 'Email is required' });
        }
        const user = await User.findOne({
				where : {
				email:req.body.email
				}
        });
        if (!user) {
        return res
        .status(409)
        .json({  status : 409, message: 'Email does not exist' });
        }
        var resettoken = new passwordResetToken({ _userId: user.id, resettoken: crypto.randomBytes(16).toString('hex') });
        let savedToken = resettoken.save();
        passwordResetToken.destroy({ where : {_userId: user.id, resettoken: { [Op.ne]: resettoken.resettoken }} });
        res.status(200).json({ status : 200, message: 'Reset Password successfully.' });
        // let testAccount = await nodemailer.createTestAccount();
        var mailOptions = {
        from: '"Test Mail" <keshavgarg0696@gmail.com>',
        to: user.email,
        subject: 'Reset Password Request',
        text: `You are receiving this because you (or someone else) have requested the reset of the password for your account.
        Please click on the following link, or paste this into your browser to complete the process:\n
        <a href ="${process.env.LIVE_URL}/resetPassword/${resettoken.resettoken}">Reset Password</a>  \n
        If you did not request this, please ignore this email and your password will remain unchanged.\n`
        }
        transporter.sendMail(mailOptions, (err, info) => {
            if(!err){
                console.log("Email sent")
            } else {
              console.log(err)
            }
        })
 }

 module.exports.resetPassword = async function (req, res) {
    let userToken = await  passwordResetToken.findOne({ where :{resettoken: req.body.resettoken} });
       if (!userToken) {
         return res
           .status(409)
           .json({ message: 'Token has expired' });
       }
 
      let userEmail =  await  User.findOne({id: userToken._userId});
         if (!userEmail) {
           return res
             .status(409)
             .json({ message: 'User does not exist with this email' });
         }
         return bcrypt.hash(req.body.newPassword, 10, async (err, hash) => {
           if (err) {
             return res
               .status(400)
               .json({ message: 'Error hashing password' });
           }
           userEmail.password = hash;
           await userEmail.save();

               userToken.destroy();
               return res
                 .status(201)
                 .json({ message: 'Password reset successfully' });
 
         });
      
 
 }

module.exports.register = async (req, res) => {
	try {
        console.log(req.body)
        if (
			req.body.email === undefined ||
			req.body.password === undefined
		) {
			return res.json({
				status: 0,
				message: 'All fields are required',
				data: {},
			});
		}

		const checkuser = await User.findOne({
			where : {
				email: req.body.email
			}
		});

		if (
			!_.isEmpty(checkuser)
			 &&
			checkuser.is_deleted === 0
		) {
			return res.json({
				status: 0,
				message: 'Email already in used',
				data: {},
			});
		}
		const data = req.body;

		if (
			!_.isEmpty(checkuser) &&
			checkuser.is_deleted === 1
		) {
			checkuser.email = data.email;
			checkuser.password =  bcrypt.hashSync(data.password,10);
			return checkuser
				.save()
				.then((userinfo) => {
					return Promise.all([userinfo.generateAuthToken(), userinfo]);
				})
				.then(async (result) => {
					const [token, userinfo] = result;
					await userinfo.saveOtp();
					res.header('Authorization', token).json({
						status: 200,
						message: 'OTP send successfully',
						data: userinfo,
					});
				});
		}
		data.password =  bcrypt.hashSync(data.password,10);
		const userObj = new User(data);
		return userObj
			.save()
			.then((userinfo) => {
				return Promise.all([userinfo.generateAuthToken(), userinfo]);
			})
			.then(async (result) => {
				const [token, userinfo] = result;
				await userinfo.sendOtp();
				res.header('Authorization', token).json({
					status: 200,
					message: 'OTP send successfully',
					data: userinfo,
				});
			});
	} catch (e) {
		if (e.code === '11000') {
			return res.json({
				status: 0,
				message: 'Email or mobile number already in used',
				data: {},
			});
		}
		// logger.error(e.message);
		console.log(e.message);
		return res.json({ status: 0, message: e.message, data: {} });
	}
};

// Add new function to find user by email and company
module.exports.findUserByEmailAndCompany = async (req, res) => {
    try {
        const { email, company } = req.body;

        if (!email || !company) {
            return res.status(400).json({
                status: false,
                message: 'Email and company are required'
            });
        }

        console.log('Searching for user with email:', email, 'and company:', company);

        // Try to find user in the Sequelize users model
        const user = await User.findOne({
            where: {
                email: email,
                company: company,
                is_deleted: '0'  // Only find active users
            },
            attributes: ['id', 'email', 'name', 'company', 'department', 'role', 'business_unit', 'plant', 'user_type']
        });

        if (!user) {
            console.log('No user found with email:', email, 'and company:', company);
            return res.status(404).json({
                status: false,
                message: 'No user found with the provided email and company'
            });
        }
        // Return user data without sensitive information
        return res.status(200).json({
            status: true,
            message: 'User found successfully',
            data: {
                id: user.id,
                email: user.email,
                name: user.name,
                company: user.company,
                department: user.department,
                role: user.role,
                business_unit: user.business_unit,
                plant: user.plant,
                user_type: user.user_type
            }
        });

    } catch (error) {
        console.error('Error in findUserByEmailAndCompany:', error);
        return res.status(500).json({
            status: false,
            message: 'Internal server error',
            error: error.message
        });
    }
};
