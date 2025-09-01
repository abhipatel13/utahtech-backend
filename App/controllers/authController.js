const models = require('../models');
const User = models.user;
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const passwordResetToken = models.reset_passwords;
const crypto = require('crypto');
const { sendMail } = require('../helper/mail.helper.js');
const { successResponse, errorResponse, sendResponse } = require('../helper/responseHelper');
const { isValidEmail } = require('../helper/validationHelper');

module.exports.login = async (req, res) => {
	try {
		const { email, password } = req.body;

		// Validate required fields
		if (!email || !password) {
			const response = errorResponse('Email and password are required', 400);
			return sendResponse(res, response);
		}

		// Validate email format
		if (!isValidEmail(email)) {
			const response = errorResponse('Invalid email format', 400);
			return sendResponse(res, response);
		}

		// Find user by email only
		const user = await User.scope('auth').findOne({ 
			where: {
				email: email,
				deleted_at: null  // Only active users
			}
		});

		if (!user) {
			const response = errorResponse("Invalid email or password", 401);
			return sendResponse(res, response);
		}

		// Verify password
		const isPasswordValid = await user.comparePassword(password);
		if (!isPasswordValid) {
			const response = errorResponse("Invalid email or password", 401);
			return sendResponse(res, response);
		}

		// Update last login
		await user.updateLastLogin();

		// Generate JWT token
		const token = jwt.sign(
			{ userId: user.id, role: user.role, company: user.company },
			process.env.JWT_SECRET,
			{ expiresIn: process.env.JWT_EXPIRATION || '24h' }
		);

		// Return user data and token
		const response = successResponse('Login successful', {
			user: {
				_id: user.id,
				email: user.email,
				role: user.role,
				company_id: user.company_id,
				company: user.company
			},
			token
		});

		return sendResponse(res, response);

	} catch (error) {
		console.error('Login error:', error);
		const response = errorResponse('Internal server error', 500);
		return sendResponse(res, response);
	}
};

module.exports.forgotPassword = async (req, res) => {
	try {
		const { email } = req.body;

		// Validate required fields
		if (!email) {
			const response = errorResponse('Email is required', 400);
			return sendResponse(res, response);
		}

		// Validate email format
		if (!isValidEmail(email)) {
			const response = errorResponse('Invalid email format', 400);
			return sendResponse(res, response);
		}

		// Find user by email
		const user = await User.findOne({
			where: { email: email, deleted_at: null }
		});

		if (!user) {
			const response = errorResponse('Email does not exist', 404);
			return sendResponse(res, response);
		}

		// Generate reset token
		const resetToken = crypto.randomBytes(16).toString('hex');
		const resetUrl = `${process.env.LIVE_URL}/auth/resetpassword/${resetToken}`;
		
		// Clean up old tokens for this user
		await passwordResetToken.destroy({ 
			where: { user_id: user.id } 
		});

		// Create new reset token
		await passwordResetToken.create({ 
			user_id: user.id, 
			reset_token: resetToken 
		});

		const subject = "Reset Password Request";
		const text = `You are receiving this because you (or someone else) have requested the reset of the password for your account. Please click on the following link, or paste this into your browser to complete the process: ${resetUrl} If you did not request this, please ignore this email and your password will remain unchanged.`;
		const html = `<p>You are receiving this because you (or someone else) have requested the reset of the password for your account.</p>
		<p>Please click on the following link, or paste this into your browser to complete the process:</p>
		<p><a href="${resetUrl}">Reset Password</a></p>
		<p>If you did not request this, please ignore this email and your password will remain unchanged.</p>`;

		sendMail(
			email, 
			subject, 
			text, 
			html
		);
		
		const response = successResponse('Password reset email sent successfully');
		return sendResponse(res, response);

	} catch (error) {
		console.error('Forgot password error:', error);
		const response = errorResponse('Internal server error', 500);
		return sendResponse(res, response);
	}
};

module.exports.resetPassword = async (req, res) => {
	try {
		const { token, newPassword } = req.body;

		// Validate required fields
		if (!token || !newPassword) {
			const response = errorResponse('Reset token and new password are required', 400);
			return sendResponse(res, response);
		}

		// Find the reset token
		const userToken = await passwordResetToken.findOne({ 
			where: { reset_token: token } 
		});

		if (!userToken) {
			const response = errorResponse('Invalid or expired reset token', 400);
			return sendResponse(res, response);
		}

		// check if token hasnt expired
		if (userToken.createdAt < Date.now() - 1000 * 60 * 60 * 24) {
			userToken.destroy();
			const response = errorResponse('Token has expired', 400);
			return sendResponse(res, response);
		}

		// Find the user
		const user = await User.findByPk(userToken.user_id);
		if (!user) {
			const response = errorResponse('User not found', 404);
			return sendResponse(res, response);
		}

		// Hash the new password
		const hashedPassword = await bcrypt.hash(newPassword, 10);

		// Update user password
		await user.update({ password: hashedPassword });

		// Delete the reset token
		await userToken.destroy();

		const response = successResponse('Password reset successfully');
		return sendResponse(res, response);

	} catch (error) {
		console.error('Reset password error:', error);
		const response = errorResponse('Internal server error', 500);
		return sendResponse(res, response);
	}
};

module.exports.register = async (req, res) => {
	try {
		const { email, password, role } = req.body;

		// Validate required fields
		if (!email || !password) {
			const response = errorResponse('Email and password are required', 400);
			return sendResponse(res, response);
		}

		// Validate email format
		if (!isValidEmail(email)) {
			const response = errorResponse('Invalid email format', 400);
			return sendResponse(res, response);
		}

		// Check if user already exists
		const existingUser = await User.findOne({
			where: { email: email, deleted_at: null }
		});

		if (existingUser) {
			const response = errorResponse('Email already in use', 409);
			return sendResponse(res, response);
		}

		// Hash password
		const hashedPassword = await bcrypt.hash(password, 10);

		// Create new user
		const userData = {
			email,
			password: hashedPassword,
			role: role || 'user'
		};

		const user = await User.create(userData);

		// Generate token
		const token = jwt.sign(
			{ userId: user.id, role: user.role },
			process.env.JWT_SECRET,
			{ expiresIn: process.env.JWT_EXPIRATION || '24h' }
		);

		const response = successResponse('User created successfully', {
			user: user.toJSON(),
			token
		}, 201);

		return sendResponse(res, response);

	} catch (error) {
		console.error('Registration error:', error);
		
		if (error.name === 'SequelizeUniqueConstraintError') {
			const response = errorResponse('Email already in use', 409);
			return sendResponse(res, response);
		}

		const response = errorResponse('Internal server error', 500);
		return sendResponse(res, response);
	}
};

module.exports.findUserByEmailAndCompany = async (req, res) => {
	try {
		const { email, company } = req.body;

		// Validate required fields
		if (!email || !company) {
			const response = errorResponse('Email and company are required', 400);
			return sendResponse(res, response);
		}

		// Validate email format
		if (!isValidEmail(email)) {
			const response = errorResponse('Invalid email format', 400);
			return sendResponse(res, response);
		}

		// Find user by email and company_id
		const user = await User.findOne({
			where: {
				email: email,
				company_id: parseInt(company),
				deleted_at: null  // Only find active users
			},
			attributes: ['id', 'email', 'name', 'company_id', 'department', 'role', 'business_unit', 'plant'],
			include: [
				{
					model: models.company,
					as: 'company',
					attributes: ['id', 'name']
				}
			]
		});

		if (!user) {
			const response = errorResponse('No user found with the provided email and company', 404);
			return sendResponse(res, response);
		}

		// Return user data without sensitive information
		const response = successResponse('User found successfully', {
			id: user.id,
			email: user.email,
			name: user.name,
			company: user.company,
			department: user.department,
			role: user.role,
			business_unit: user.business_unit,
			plant: user.plant
		});

		return sendResponse(res, response);

	} catch (error) {
		console.error('Error in findUserByEmailAndCompany:', error);
		const response = errorResponse('Internal server error', 500);
		return sendResponse(res, response);
	}
};

module.exports.logout = async (req, res) => {
	try {
		// In a stateless JWT system, we don't need to do anything on the server
		// The client will handle removing the token
		const response = successResponse('Logged out successfully');
		return sendResponse(res, response);
	} catch (error) {
		console.error('Logout error:', error);
		const response = errorResponse('Internal server error', 500);
		return sendResponse(res, response);
	}
};

module.exports.getProfile = async (req, res) => {
	try {
		const user = await User.findByPk(req.user.id, {
			attributes: ['id', 'email', 'name', 'role', 'department', 'phone_no', 'profile_pic', 'company_id', 'supervisor_id', 'createdAt', 'updatedAt'],
			include: [
				{
					model: models.company,
					as: 'company',
					attributes: ['id', 'name']
				}
			]
		});

		if (!user) {
			const response = errorResponse('User not found', 404);
			return sendResponse(res, response);
		}

		// Map phone_no to phone for consistency with frontend
		const userData = {
			id: user.id,
			email: user.email,
			name: user.name,
			role: user.role,
			department: user.department,
			phone: user.phone_no, // Map phone_no to phone
			profile_pic: user.profile_pic,
			company_id: user.company_id,
			supervisor_id: user.supervisor_id,
			createdAt: user.createdAt,
			updatedAt: user.updatedAt,
			company: user.company,
			permissions: user.getPermissions()
		};

		const response = successResponse('Profile retrieved successfully', userData);
		return sendResponse(res, response);

	} catch (error) {
		console.error('Profile error:', error);
		const response = errorResponse('Internal server error', 500);
		return sendResponse(res, response);
	}
};

module.exports.updateProfile = async (req, res) => {
	try {
		const { name, email, department, phone, currentPassword, newPassword } = req.body;
		const userId = req.user.id;

		// Find the user
		const user = await User.scope('auth').findByPk(userId);
		if (!user) {
			const response = errorResponse('User not found', 404);
			return sendResponse(res, response);
		}

		const updateData = {};

		// Update email if provided
		if (email && email !== user.email) {
			// Validate email format
			if (!isValidEmail(email)) {
				const response = errorResponse('Invalid email format', 400);
				return sendResponse(res, response);
			}

			// Check if email is already in use
			const existingUser = await User.findOne({
				where: { 
					email: email, 
					id: { [models.Sequelize.Op.ne]: userId },
					deleted_at: null
				}
			});

			if (existingUser) {
				const response = errorResponse('Email is already in use', 409);
				return sendResponse(res, response);
			}

			updateData.email = email;
		}

		// Update other fields
		if (name !== undefined) updateData.name = name;
		if (department !== undefined) updateData.department = department;
		if (phone !== undefined) updateData.phone_no = phone;

		// Update password if provided
		if (newPassword) {
			if (!currentPassword) {
				const response = errorResponse('Current password is required to set new password', 400);
				return sendResponse(res, response);
			}

			// Verify current password
			const isCurrentPasswordValid = await user.comparePassword(currentPassword);
			if (!isCurrentPasswordValid) {
				const response = errorResponse('Current password is incorrect', 400);
				return sendResponse(res, response);
			}

			// Hash new password
			updateData.password = await bcrypt.hash(newPassword, 10);
		}

		// Update the user
		await user.update(updateData);

		// Return updated user data without password
		const updatedUser = await User.findByPk(userId, {
			attributes: { exclude: ['password'] },
			include: [
				{
					model: models.company,
					as: 'company',
					attributes: ['id', 'name']
				}
			]
		});

		const response = successResponse('Profile updated successfully', {
			id: updatedUser.id,
			email: updatedUser.email,
			name: updatedUser.name,
			phone: updatedUser.phone_no,
			department: updatedUser.department,
			role: updatedUser.role,
			company: updatedUser.company
		});

		return sendResponse(res, response);

	} catch (error) {
		console.error('Update profile error:', error);
		
		if (error.name === 'SequelizeUniqueConstraintError') {
			const response = errorResponse('Email already in use', 409);
			return sendResponse(res, response);
		}

		const response = errorResponse('Internal server error', 500);
		return sendResponse(res, response);
	}
};