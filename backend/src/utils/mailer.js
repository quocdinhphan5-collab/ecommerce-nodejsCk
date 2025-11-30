const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

transporter.verify((err, success) => {
  if (err) {
    console.error('Lỗi cấu hình SMTP:', err.message);
  } else {
    console.log('SMTP sẵn sàng gửi mail');
  }
});

async function sendMail(to, subject, text) {
  await transporter.sendMail({
    from: `"Máy Tính Store" <${process.env.EMAIL_USER}>`,
    to,
    subject,
    text,
  });
}

module.exports = { sendMail };
