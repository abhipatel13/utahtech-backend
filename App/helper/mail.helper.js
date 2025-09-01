const nodemailer = require("nodemailer");

function createTransport() {
    return nodemailer.createTransport({
      host: "smtp.hostinger.com",
      port: 465,
      secure: true,
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });
}

function sendMail(toEmail, subject, text, html) {
	const transporter = createTransport();
	transporter.sendMail({
		from: `"UTS Tool" <${process.env.EMAIL_USER}>`,
		to: toEmail,
		subject: subject,
		text: text,
		html: html
	})
	.then((info) => {
	console.log("Message sent: %s", info.messageId);
	})
	.catch(console.error);
}


module.exports = { sendMail };
