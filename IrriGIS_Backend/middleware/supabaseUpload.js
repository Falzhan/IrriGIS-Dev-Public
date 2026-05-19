const multer = require('multer');
const { createClient } = require('@supabase/supabase-js');

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// Configure multer to use memory storage
const storage = multer.memoryStorage();

// File filter for images only
const fileFilter = (req, file, cb) => {
  const allowedTypes = /jpeg|jpg|png|gif|webp/;
  const extname = allowedTypes.test(file.originalname.toLowerCase().split('.').pop());
  const mimetype = allowedTypes.test(file.mimetype);
  
  if (mimetype && extname) {
    cb(null, true);
  } else {
    cb(new Error('Only image files (JPEG, JPG, PNG, GIF, WebP) are allowed!'), false);
  }
};

// Initialize Multer with memory storage
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB
    files: 10
  },
  fileFilter: fileFilter,
});

// Initialize Multer for user profiles (single file)
const uploadProfile = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB
    files: 1
  },
  fileFilter: fileFilter,
});

// Helper function to upload file to Supabase
const uploadToSupabase = async (file, bucket, folder, filename) => {
  try {
    const filePath = `${folder}/${filename}`;
    
    const { data, error } = await supabase.storage
      .from(bucket)
      .upload(filePath, file.buffer, {
        contentType: file.mimetype,
        upsert: true
      });
    
    if (error) {
      throw error;
    }
    
    // Get public URL
    const { data: { publicUrl } } = supabase.storage
      .from(bucket)
      .getPublicUrl(filePath);
    
    return publicUrl;
  } catch (error) {
    console.error('Supabase upload error:', error);
    throw error;
  }
};

// Upload multiple files (for reports)
const uploadMultipleToSupabase = async (files, userId) => {
  const uploadPromises = files.map(async (file, index) => {
    const timestamp = Date.now();
    const cleanName = file.originalname.replace(/\s+/g, '_').toLowerCase();
    const filename = `${timestamp}-${userId}-${index}-${cleanName}`;
    
    return uploadToSupabase(file, 'uploads', 'report-images', filename);
  });
  
  try {
    const urls = await Promise.all(uploadPromises);
    return urls;
  } catch (error) {
    console.error('Multiple files upload error:', error);
    throw error;
  }
};

// Upload single file (for user profiles)
const uploadProfileToSupabase = async (file, userId) => {
  const timestamp = Date.now();
  const cleanName = file.originalname.replace(/\s+/g, '_').toLowerCase();
  const filename = `profile-${timestamp}-${userId}-${cleanName}`;
  
  return uploadToSupabase(file, 'users', 'profile-images', filename);
};

// Delete file from Supabase
const deleteFromSupabase = async (url) => {
  try {
    // Extract bucket and file path from URL
    const urlParts = url.split('/');
    const bucket = urlParts[5]; // e.g., 'uploads' or 'users'
    const filePath = urlParts.slice(6).join('/'); // everything after bucket
    
    const { error } = await supabase.storage
      .from(bucket)
      .remove([filePath]);
    
    if (error) {
      throw error;
    }
    
    return true;
  } catch (error) {
    console.error('Supabase delete error:', error);
    throw error;
  }
};

module.exports = {
  upload,
  uploadProfile,
  uploadToSupabase,
  uploadMultipleToSupabase,
  uploadProfileToSupabase,
  deleteFromSupabase
};
