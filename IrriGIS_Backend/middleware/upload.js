const multer = require('multer');
const path = require('path');

// Configure storage for report images
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, path.join(__dirname, '../public/uploads'));
  },
  filename: function (req, file, cb) {
    const timestamp = Date.now();
    const userId = req.user ? req.user.id : 'guest'; 
    const cleanName = file.originalname.replace(/\s+/g, '_').toLowerCase();
    
    cb(null, `${timestamp}-${userId}-${cleanName}`);
  }
});

// Configure storage for user profile images
const userStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, path.join(__dirname, '../public/users'));
  },
  filename: function (req, file, cb) {
    const timestamp = Date.now();
    const cleanName = file.originalname.replace(/\s+/g, '_').toLowerCase();
    
    cb(null, `profile-${timestamp}-${cleanName}`);
  }
});

// File filter for images only
const fileFilter = (req, file, cb) => {
  const allowedTypes = /jpeg|jpg|png|gif|webp/;
  const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
  const mimetype = allowedTypes.test(file.mimetype);
    
  if (mimetype && extname) {
    cb(null, true);
  } else {
    cb(new Error('Only image files (JPEG, JPG, PNG, GIF, WebP) are allowed!'), false);
  }
};

// Initialize Multer for reports
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024,
    files: 10
  },
  fileFilter: fileFilter,
});

// Initialize Multer for user profiles
const uploadProfile = multer({
  storage: userStorage,
  limits: {
    fileSize: 5 * 1024 * 1024,
    files: 1
  },
  fileFilter: fileFilter,
});

module.exports = { upload, uploadProfile };