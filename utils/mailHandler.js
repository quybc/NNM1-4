const nodemailer = require("nodemailer");


const transporter = nodemailer.createTransport({
    host: process.env.MAILTRAP_HOST || "sandbox.smtp.mailtrap.io",
    port: Number(process.env.MAILTRAP_PORT || 2525),
    secure: false, // Use true for port 465, false for port 587
    auth: {
        user: process.env.MAILTRAP_USER || "",
        pass: process.env.MAILTRAP_PASS || "",
    },
});

async function deliverMail(mailOptions) {
    if (!transporter.options.auth.user || !transporter.options.auth.pass) {
        throw new Error("Mailtrap credentials are missing. Please set MAILTRAP_USER and MAILTRAP_PASS.");
    }

    const info = await transporter.sendMail({
        from: process.env.MAIL_FROM || 'admin@haha.com',
        ...mailOptions
    });

    console.log("Message sent:", info.messageId);
    return info;
}

module.exports = {
    sendMail: async (to, url) => {
        return await deliverMail({
            to: to,
            subject: "RESET PASSWORD REQUEST",
            text: "lick vo day de doi pass", // Plain-text version of the message
            html: "lick vo <a href="+url+">day</a> de doi pass", // HTML version of the message
        });
    },
    sendWelcomePasswordMail: async (to, username, password) => {
        return await deliverMail({
            to: to,
            subject: "THONG TIN TAI KHOAN MOI",
            text: `Tai khoan cua ban da duoc tao.\nUsername: ${username}\nPassword: ${password}\nVui long doi mat khau sau khi dang nhap.`,
            html: `
                <p>Tai khoan cua ban da duoc tao.</p>
                <p><strong>Username:</strong> ${username}</p>
                <p><strong>Password:</strong> ${password}</p>
                <p>Vui long doi mat khau sau khi dang nhap.</p>
            `
        });
    }
}
