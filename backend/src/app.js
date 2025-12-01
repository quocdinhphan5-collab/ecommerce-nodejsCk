require('dotenv').config();

const express = require('express');
const path = require('path');
const session = require('express-session');
const morgan = require('morgan');
const methodOverride = require('method-override');
const http = require('http');
const { Server } = require('socket.io');
const connectDB = require('./config/db');
const { attachUser } = require('./middleware/auth');
const User = require('./models/User');
const Product = require('./models/Product');
const Order = require('./models/Order');
const DiscountCode = require('./models/DiscountCode');
const indexRoutes = require('./routes/index');
const authRoutes = require('./routes/auth');
const productRoutes = require('./routes/product');
const cartRoutes = require('./routes/cart');
const orderRoutes = require('./routes/order');
const adminRoutes = require('./routes/admin');
const app = express();
const server = http.createServer(app);
app.use(express.static(path.join(__dirname, 'public')));
const io = new Server(server);
const addressRoutes = require("./routes/address");

app.set('io', io);

const PORT = process.env.PORT || 3000;
const MONGO_URL = process.env.MONGO_URL || 'mongodb://mongo:27017/ecommerce_db';

// MIDDLEWARE CƠ BẢN
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use("/address", addressRoutes);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(methodOverride('_method'));
app.use(morgan('dev'));

// Session lưu trong MongoDB
app.use(
  session({
    secret: process.env.SESSION_SECRET || 'secret123',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 1000 * 60 * 60 * 24 }, // 1 ngày
  })
);

// currentUser dùng trong mọi view
app.use((req, res, next) => {
  res.locals.currentUser = req.session.user || null;
  next();
});

app.use(attachUser);

// ROUTES
app.use('/', indexRoutes);
app.use('/', authRoutes);
app.use('/', productRoutes);
app.use('/', cartRoutes);
app.use('/', orderRoutes);
app.use('/admin', adminRoutes);

// SOCKET.IO
io.on('connection', (socket) => {
  socket.on('join-product', (productId) => {
    if (productId) {
      socket.join(productId.toString());
    }
  });
});

// SEED DỮ LIỆU MẪU
async function seed() {
  try {
    const adminEmail = process.env.ADMIN_EMAIL || 'admin@example.com';
    const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';

    // Tạo admin mặc định
    let admin = await User.findOne({ email: adminEmail });
    if (!admin) {
      admin = new User({
        fullName: 'Quản trị viên',
        email: adminEmail,
        password: adminPassword,
        role: 'admin',
        address: 'TP. Hồ Chí Minh',
      });
      await admin.save();
      console.log('✅ Đã tạo tài khoản admin mặc định:', adminEmail, '/', adminPassword);
    }

    // Nếu chưa có sản phẩm -> tạo mẫu
    const productCount = await Product.countDocuments();
    if (productCount === 0) {
      const sample = await Product.create({
        name: 'Laptop Gaming XYZ',
        brand: 'Dell',
        category: 'laptop',
        price: 20000000,
        description:
          'Laptop gaming cấu hình mạnh, CPU Intel i7, RAM 16GB, SSD 512GB, card đồ họa rời. Phù hợp chơi game và làm việc đồ họa. Mô tả mẫu ít nhất 5 dòng để minh họa nội dung yêu cầu. Dòng 4. Dòng 5.',
        images: [
          '/images/sample-laptop-1.jpg',
          '/images/sample-laptop-2.jpg',
          '/images/sample-laptop-3.jpg',
        ],
        variants: [
          { name: 'RAM 16GB / SSD 512GB', price: 20000000, stock: 5 },
          { name: 'RAM 32GB / SSD 1TB',  price: 26000000, stock: 3 },
        ],
      });
      console.log('✅ Đã tạo sản phẩm mẫu:', sample.name);

      const discount = await DiscountCode.create({
        code: 'ABC12',
        discountValue: 500000,
        usageLimit: 10,
      });

      const order = await Order.create({
        user: admin._id,
        email: admin.email,
        shippingAddress: admin.address,
        items: [
          {
            product: sample._id,
            name: sample.name,
            variantName: sample.variants[0].name,
            price: sample.variants[0].price,
            quantity: 1,
          },
        ],
        totalAmount: sample.variants[0].price - discount.discountValue,
        discountCode: discount._id,
        discountValue: discount.discountValue,
        usedLoyaltyPoints: 0,
        status: 'Delivered',
        history: [
          { status: 'Delivered', updatedAt: new Date() },
          { status: 'Shipping',  updatedAt: new Date() },
          { status: 'Confirmed', updatedAt: new Date() },
          { status: 'Pending',   updatedAt: new Date() },
        ],
      });

      // Trừ tồn kho theo từng biến thể
      for (const item of orderItems) {
        try {
          if (item.product && typeof item.variantIndex === 'number') {
            await Product.updateOne(
              {
                _id: item.product,
                [`variants.${item.variantIndex}.stock`]: { $gte: item.quantity },
              },
              {
                $inc: {
                  [`variants.${item.variantIndex}.stock`]: -item.quantity,
                },
              }
            );
          }
        } catch (e) {
          console.error('Lỗi trừ tồn kho cho item', item, e);
        }
      }

      admin.loyaltyPoints += Math.floor(order.totalAmount * 0.0001);
      await admin.save();
      console.log('✅ Đã tạo đơn hàng mẫu:', order._id);
    }
  } catch (err) {
    console.error('Lỗi seed dữ liệu:', err);
  }
}

// ROUTE HEALTHCHECK
app.get('/health', (req, res) => res.json({ status: 'ok' }));

// 404
app.use((req, res) => {
  res.status(404).send('Không tìm thấy trang');
});

// START APP
async function start() {
  try {
    await connectDB();  
    await seed();
    server.listen(PORT, () => {
      console.log(`Server chạy tại http://localhost:${PORT}`);
    });
  } catch (err) {
    console.error('⛔ Không thể khởi động ứng dụng vì lỗi MongoDB:', err.message);
    process.exit(1);
  }
}

start();