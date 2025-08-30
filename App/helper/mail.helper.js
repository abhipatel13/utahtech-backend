const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
	host: "smtp.hostinger.com",
	port: 465,
	secure: true,
	auth: {
		user: process.env.EMAIL_USER,
		pass: process.env.EMAIL_PASS,
	},
});

const sendMail = async (to, subject, html) => {
	const info = await transporter.sendMail({
		from: `"UTS Tool" <${process.env.EMAIL_USER}>`,
		to: to,
		subject: subject,
		html: html,
	});
	console.log("user.email", to);
	console.log("info", info);
};


module.exports = {transporter, sendMail};
