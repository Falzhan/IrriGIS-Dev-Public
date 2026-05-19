require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { sequelize } = require('./models');
const app = express();
require('dotenv').config();
const { authenticate, authorize } = require('./middleware/auth');
const authRoutes = require('./routes/auth');
const passport = require('passport');
require('./config/passport');
const path = require('path');

// Middleware
const corsOptions = {
  origin: function (origin, callback) {
    // Allow all origins for development (local networks, mobile app, web admin)
    // Also allows deployed frontend on render.com
    if (!origin || origin.startsWith('http://localhost') || 
        origin.startsWith('http://192.168.') || origin.startsWith('http://10.') ||
        origin.startsWith('https://irrigis') || origin.startsWith('https://')) {
      callback(null, true);
    } else {
      callback(null, true); // Allow all for now
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
};
app.use(cors(corsOptions));
app.use(express.json());
app.use(express.urlencoded({ extended: true })); // Handle FormData
app.use(passport.initialize());
app.use('/api/auth', authRoutes);
const reportRoutes = require('./routes/report');
app.use('/api/reports', reportRoutes);

const ticketRoutes = require('./routes/ticket');
app.use('/api/tickets', ticketRoutes);

const userRoutes = require('./routes/users');
app.use('/api/users', userRoutes);

const gisRoutes = require('./routes/gis');
app.use('/api/gis', gisRoutes);

const notificationRoutes = require('./routes/notification');
app.use('/api/notifications', notificationRoutes);

const ticketSubStatusRoutes = require('./routes/ticketSubStatus');
app.use('/api/ticket-sub-statuses', ticketSubStatusRoutes);

const reportPresetRoutes = require('./routes/reportPreset');
app.use('/api/report-presets', reportPresetRoutes);

const ticketSettingsRoutes = require('./routes/ticketSettings');
app.use('/api/ticket-settings', ticketSettingsRoutes);

const userSettingsRoutes = require('./routes/userSettings');
app.use('/api/user-settings', userSettingsRoutes);

// Redirect old static file routes to Supabase (for backward compatibility)
app.get('/uploads/:filename', (req, res) => {
  const { filename } = req.params;
  const supabaseUrl = `https://lqhmeqjramkmzmyexnvk.supabase.co/storage/v1/object/public/uploads/report-images/${filename}`;
  res.redirect(301, supabaseUrl);
});

app.get('/users/:filename', (req, res) => {
  const { filename } = req.params;
  const supabaseUrl = `https://lqhmeqjramkmzmyexnvk.supabase.co/storage/v1/object/public/users/profile-images/${filename}`;
  res.redirect(301, supabaseUrl);
});

// Example protected route
app.get('/profile', authenticate, (req, res) => {
  res.json(req.user);
});

// Admin-only route example
app.get('/admin', authenticate, authorize('nia_admin'), (req, res) => {
  res.json({ message: 'Admin dashboard' });
});

// Test database connection
async function testConnection() {
  try {
    await sequelize.authenticate();
    console.log('Database connection established successfully');
  } catch (error) {
    console.error('Unable to connect to database:', error);
  }
}

// Sync models and start server
sequelize.sync({ force: false })
  .then(() => {
    app.listen(3000, () => {
      console.log('Server running on port 3000');
      testConnection();
    });
  })
  .catch(err => console.error('Database sync error:', err));

module.exports = app;