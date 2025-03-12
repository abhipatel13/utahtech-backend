const nodemailer = require('nodemailer');

const Transporter = nodemailer.createTransport({
	host: 'smtp.gmail.com',
	port: 587,
	secure: false, // true for 465, false for other ports
	auth: {
		user: '4x5085fbb@gmail.com', // generated ethereal user
		pass: 'tknjooovrjfodlvy', 
	},
	tls: {
		rejectUnauthorized: false,
	},
});
module.exports = Transporter;
