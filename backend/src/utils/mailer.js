// src/utils/mailer.js
const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');

// ============ TRANSPORTER ============

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

// ============ LOAD CSS CHUNG ============

const emailStylesPath = path.join(__dirname, '../public/email/email.css');
let EMAIL_STYLES = '';

try {
  EMAIL_STYLES = fs.readFileSync(emailStylesPath, 'utf8');
} catch (err) {
  console.warn(
    'Không đọc được file CSS cho email (public/email/email.css). Email vẫn gửi bình thường nhưng ít style hơn.'
  );
}

// Hàm bọc layout chung cho mọi email
function wrapWithLayout(title, bodyHtml) {
  const stylesBlock = EMAIL_STYLES ? `<style>${EMAIL_STYLES}</style>` : '';

  return `
  <!doctype html>
  <html lang="vi">
  <head>
    <meta charset="utf-8">
    <title>${title}</title>
    ${stylesBlock}
  </head>
  <body>
    <div class="email-wrapper">
      <div class="email-header">
        <div class="logo">Máy Tính Store</div>
      </div>
      <div class="email-body">
        ${bodyHtml}
      </div>
      <div class="email-footer">
        <p>Đây là email tự động, vui lòng không trả lời lại.</p>
        <p>Nếu bạn cần hỗ trợ, hãy liên hệ với chúng tôi.</p>
      </div>
    </div>
  </body>
  </html>
  `;
}

// ============ OTP EMAIL ============

function createOtpHtml({ otp, email }) {
  const body = `
    <h1>Yêu cầu đặt lại mật khẩu</h1>
    <p>Xin chào <strong>${email}</strong>,</p>
    <p>Chúng tôi nhận được yêu cầu đặt lại mật khẩu cho tài khoản của bạn tại
      <strong>Máy Tính Store</strong>.
    </p>
    <p>Vui lòng sử dụng mã xác nhận (OTP) bên dưới để hoàn tất bước xác thực:</p>

    <div class="otp-box">${otp}</div>

    <p>Mã OTP có hiệu lực trong vòng <strong>5 phút</strong>.
      Không chia sẻ mã này cho bất kỳ ai.
    </p>

    <p>Nếu bạn không yêu cầu đặt lại mật khẩu, vui lòng bỏ qua email này hoặc liên hệ với chúng tôi để được hỗ trợ.</p>

    <p>Trân trọng,<br>
    Đội ngũ <strong>Máy Tính Store</strong></p>
  `;

  return wrapWithLayout('Mã xác nhận đặt lại mật khẩu', body);
}

async function sendOtpMail(to, otp) {
  const subject = 'Mã xác nhận đặt lại mật khẩu - Máy Tính Store';

  const html = createOtpHtml({ otp, email: to });
  const text = `
Yêu cầu đặt lại mật khẩu - Máy Tính Store

Email: ${to}
Mã OTP của bạn là: ${otp}

Mã có hiệu lực trong 5 phút. Vui lòng không chia sẻ mã này cho bất kỳ ai.
  `.trim();

  await transporter.sendMail({
    from: `"Máy Tính Store" <${process.env.EMAIL_USER}>`,
    to,
    subject,
    text,
    html,
  });
}

// ============ ORDER CONFIRMATION EMAIL ============

function formatCurrency(v) {
  const num = Number(v) || 0;
  return num.toLocaleString('vi-VN') + ' ₫';
}

function createOrderHtml({ user, order, breakdown }) {
  const {
    subtotal,
    tax,
    shippingFee,
    discountValue,
    usedPointsValue,
    totalBefore,
    total,
  } = breakdown;

  const orderCode = String(order._id).slice(-8).toUpperCase();
  const createdAt = order.createdAt ? new Date(order.createdAt) : new Date();

  const itemsRows = (order.items || [])
    .map(
      (it, idx) => `
      <tr>
        <td>${idx + 1}</td>
        <td>
          ${it.name}
          ${it.variantName ? `<div class="item-variant">Phiên bản: ${it.variantName}</div>` : ''}
        </td>
        <td class="text-right">${formatCurrency(it.price)}</td>
        <td class="text-center">${it.quantity}</td>
        <td class="text-right">${formatCurrency(it.price * it.quantity)}</td>
      </tr>
    `
    )
    .join('');

  const body = `
    <h1>Xác nhận đơn hàng #${orderCode}</h1>

    <p>Xin chào <strong>${user.fullName || user.email}</strong>,</p>
    <p>Cảm ơn bạn đã đặt hàng tại <strong>Máy Tính Store</strong>.
       Chúng tôi đã tiếp nhận đơn hàng của bạn với thông tin như sau:</p>

    <div class="order-summary">
      <div><strong>Mã đơn hàng:</strong> #${orderCode}</div>
      <div><strong>Ngày đặt:</strong> ${createdAt.toLocaleString('vi-VN', {
        timeZone: 'Asia/Ho_Chi_Minh',
      })}</div>
      <div><strong>Email:</strong> ${user.email}</div>
      ${user.phone ? `<div><strong>Số điện thoại:</strong> ${user.phone}</div>` : ''}
      <div><strong>Địa chỉ giao hàng:</strong> ${order.shippingAddress}</div>
    </div>

    <h2>Chi tiết sản phẩm</h2>
    <table class="order-table">
      <thead>
        <tr>
          <th>STT</th>
          <th>Sản phẩm</th>
          <th>Đơn giá</th>
          <th>Số lượng</th>
          <th>Thành tiền</th>
        </tr>
      </thead>
      <tbody>
        ${itemsRows}
      </tbody>
    </table>

    <div class="order-total">
      <div>
        <span>Tạm tính:</span>
        <span>${formatCurrency(subtotal)}</span>
      </div>
      <div>
        <span>Thuế (VAT 10%):</span>
        <span>${formatCurrency(tax)}</span>
      </div>
      <div>
        <span>Phí vận chuyển:</span>
        <span>${formatCurrency(shippingFee)}</span>
      </div>
      ${
        discountValue > 0
          ? `<div>
               <span>Giảm giá (mã khuyến mãi):</span>
               <span>- ${formatCurrency(discountValue)}</span>
             </div>`
          : ''
      }
      ${
        usedPointsValue > 0
          ? `<div>
               <span>Giảm giá từ điểm thưởng:</span>
               <span>- ${formatCurrency(usedPointsValue)}</span>
             </div>`
          : ''
      }
      <hr>
      <div class="order-grand-total">
        <span>Tổng thanh toán:</span>
        <span>${formatCurrency(total)}</span>
      </div>
    </div>

    <p>Đây là email được gửi để xác nhận đơn hàng, chúng tôi sẽ tiến hành đóng gói và giao cho đơn vị vận chuyển.
       Thời gian giao hàng dự kiến từ 2–5 ngày làm việc (tùy khu vực).</p>

    <p>Nếu bạn cần chỉnh sửa thông tin đơn hàng, vui lòng liên hệ với chúng tôi trong thời gian sớm nhất.</p>

    <p>Trân trọng,<br>
    Đội ngũ <strong>Máy Tính Store</strong></p>
  `;

  return wrapWithLayout('Xác nhận đơn hàng', body);
}

async function sendOrderConfirmationMail({ to, user, order, breakdown }) {
  const orderCode = String(order._id).slice(-8).toUpperCase();
  const subject = `Xác nhận đơn hàng #${orderCode} - Máy Tính Store`;

  const html = createOrderHtml({ user, order, breakdown });

  const textLines = [];
  textLines.push(`Xin chào ${user.fullName || user.email},`);
  textLines.push('');
  textLines.push(
    `Đơn hàng #${orderCode} tại Máy Tính Store đã được tiếp nhận. Tổng thanh toán: ${formatCurrency(
      breakdown.total
    )}.`
  );
  textLines.push(`Địa chỉ giao hàng: ${order.shippingAddress}`);
  textLines.push('');
  textLines.push('Chi tiết từng sản phẩm:');
  (order.items || []).forEach((it) => {
    textLines.push(
      `- ${it.name}${it.variantName ? ' (' + it.variantName + ')' : ''} x${
        it.quantity
      } = ${formatCurrency(it.price * it.quantity)}`
    );
  });
  textLines.push('');
  textLines.push('Cảm ơn bạn đã mua sắm tại Máy Tính Store.');

  await transporter.sendMail({
    from: `"Máy Tính Store" <${process.env.EMAIL_USER}>`,
    to,
    subject,
    text: textLines.join('\n'),
    html,
  });
}

// ============ HÀM GỬI MAIL ĐƠN GIẢN (fallback) ============

async function sendMail(to, subject, text, html) {
  await transporter.sendMail({
    from: `"Máy Tính Store" <${process.env.EMAIL_USER}>`,
    to,
    subject,
    text,
    html: html || `<pre style="font-family: monospace">${text}</pre>`,
  });
}

module.exports = {
  sendMail,
  sendOtpMail,
  sendOrderConfirmationMail,
};
