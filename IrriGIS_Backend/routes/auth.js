//routes/auth.js
const router = require('express').Router();
const { login, register } = require('../controllers/authController'); 
const { authenticate } = require('../middleware/auth');
const passport = require('passport');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { User } = require('../models');
const { uploadProfile } = require('../middleware/supabaseUpload');

const generateOAuthToken = async (user) => {
  const sessionToken = crypto.randomBytes(32).toString('hex');
  await user.update({ session_token: sessionToken });
  return jwt.sign(
    { id: user.id, role: user.role, sessionToken },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN }
  );
};

function encodeState(redirectUri) {
  console.log('Encoding state:', redirectUri);
  const encoded = Buffer.from(redirectUri).toString('base64');
  console.log('Encoded state:', encoded);
  return encoded;
}

function decodeState(state) {
  console.log('Decoding state:', state);
  try {
    const decoded = Buffer.from(state, 'base64').toString('utf8');
    console.log('Decoded state:', decoded);
    return decoded;
  } catch (error) {
    console.error('State decode error:', error);
    return null;
  }
}

// ============================================================================
// HELPER: Get redirect URI for OAuth callback
// ============================================================================


// ============================================================================
// ROUTES
// ============================================================================

router.post('/login', login);
router.post('/register', (req, res, next) => {
  uploadProfile.single('profileImage')(req, res, (err) => {
    if (err && err.code === 'LIMIT_UNEXPECTED_FILE') {
      req.file = undefined;
    }
    next();
  });
}, register); 

// Google OAuth
router.get('/google',
  (req, res, next) => {
    console.log('Google OAuth route called - query:', req.query);
    let redirectUri = req.query.redirect_uri ||
      (process.env.FRONTEND_URL || 'http://localhost:5173') + '/oauth/callback';

    const state = encodeState(redirectUri);

    console.log('Google OAuth - redirectUri:', redirectUri, 'state:', state);

    passport.authenticate('google', {
      scope: ['profile', 'email'],
      session: false,
      state,
      failureRedirect: `/api/auth/failure?reason=google&state=${state}` 
    })(req, res, next);
  }
);

router.get('/google/callback',
  (req, res, next) => {
    console.log('Google callback route called - query:', req.query);
    passport.authenticate('google', {
      session: false,
      failureRedirect: `/api/auth/failure?reason=google&state=${req.query.state}`,
    })(req, res, next);
  },
  async (req, res) => {
    console.log('Google callback - user:', req.user);
    const redirectUri = decodeState(req.query.state) ||
      (process.env.FRONTEND_URL || 'http://localhost:5173') + '/oauth/callback';

    if (!req.user) {
      console.log('Google callback - no user, redirecting with error');
      return res.redirect(`${redirectUri}?error=google_auth_failed`);
    }
    if (!req.user.is_active) {
      console.log('Google callback - user not active');
      return res.redirect(`${redirectUri}?error=account_inactive`);
    }
    if (req.user.role === 'ia_admin' && !req.user.ia_id) {
      console.log('Google callback - ia_admin no IA assigned');
      return res.redirect(`${redirectUri}?error=no_ia_assigned`);
    }

    console.log('Google callback - success, generating token');
    const token = await generateOAuthToken(req.user);
    const userObj = {
      id: req.user.id,
      email: req.user.email,
      first_name: req.user.first_name,
      last_name: req.user.last_name,
      role: req.user.role,
      profile_image_url: req.user.profile_image_url,
      provider: req.user.auth_provider || 'google',
      ia_id: req.user.ia_id || null,
      address: req.user.address || null,
      isNewUser: req.user.updatedAt - req.user.createdAt < 300000
    };
    console.log('Google callback - redirecting to:', redirectUri);
    res.redirect(`${redirectUri}?token=${encodeURIComponent(token)}&user=${encodeURIComponent(JSON.stringify(userObj))}`);
  }
);

// Facebook OAuth
router.get('/facebook/callback',
  async (req, res, next) => {
    console.log('Facebook callback route called - code:', req.query.code ? 'present' : 'none');
    const state = req.query.state;
    const redirectUri = decodeState(state) ||
      (process.env.FRONTEND_URL || 'http://localhost:5173') + '/oauth/callback';

    if (!req.query.code) {
      console.log('Facebook callback - no code in request');
      return next();
    }

    const code = req.query.code;
    const cacheKey = code.substring(0, 20);
    if (facebookCallbackCache.has(cacheKey)) {
      console.log('Facebook callback - code already used, redirecting directly');
      return res.redirect(`${redirectUri}?error=code_already_used`);
    }
    facebookCallbackCache.set(cacheKey, Date.now());
    setTimeout(() => facebookCallbackCache.delete(cacheKey), CACHE_TTL);

    passport.authenticate('facebook', {
      session: false,
      failureRedirect: `/api/auth/failure?reason=facebook&state=${state}`,
    })(req, res, next);
  },
  async (req, res) => {
    try {
      console.log('Facebook callback - user:', req.user ? req.user.id : 'none');
      const redirectUri = decodeState(req.query.state) ||
        (process.env.FRONTEND_URL || 'http://localhost:5173') + '/oauth/callback';

    if (!req.user) {
      console.log('Facebook callback - no user, redirecting with error');
      return res.redirect(`${redirectUri}?error=facebook_auth_failed`);
    }
    if (!req.user.is_active) {
      console.log('Facebook callback - user not active');
      return res.redirect(`${redirectUri}?error=account_inactive`);
    }
    if (req.user.role === 'ia_admin' && !req.user.ia_id) {
      console.log('Facebook callback - ia_admin no IA assigned');
      return res.redirect(`${redirectUri}?error=no_ia_assigned`);
    }

    console.log('Facebook callback - generating token');
    const token = await generateOAuthToken(req.user);
    const userObj = {
      id: req.user.id,
      email: req.user.email,
      first_name: req.user.first_name,
      last_name: req.user.last_name,
      role: req.user.role,
      profile_image_url: req.user.profile_image_url,
      provider: req.user.auth_provider || 'facebook',
      ia_id: req.user.ia_id || null,
      address: req.user.address || null,
      isNewUser: req.user.updatedAt - req.user.createdAt < 300000
    };

    const finalUrl = `${redirectUri}?token=${encodeURIComponent(token)}&user=${encodeURIComponent(JSON.stringify(userObj))}`;
    console.log('Facebook callback - final redirect URL (first 100 chars):', finalUrl.substring(0, 100));

    res.redirect(finalUrl);
  } catch (error) {
    console.error('Facebook callback - error:', error);
    const redirectUri = decodeState(req.query.state) ||
      (process.env.FRONTEND_URL || 'http://localhost:5173') + '/oauth/callback';
    res.redirect(`${redirectUri}?error=server_error`);
  }
});

// OAuth failure handler
router.get('/failure', (req, res) => {
  console.log('Failure handler called - full query:', req.query);
  const { reason, error, state } = req.query;

  let message = "Social authentication failed.";
  if (reason === 'inactive') message = "Account not activated. Please wait for admin approval.";
  else if (reason === 'forbidden') message = "Access denied. This account is not authorized for admin panel.";
  else if (reason === 'no_ia') message = "No IA assigned. Please contact administrator.";
  else if (reason === 'google') {
    message = "Google sign-in failed. Please try again.";
    if (error?.includes('access_denied')) message = "Google access denied. Please allow access to continue.";
    if (error?.includes('redirect_uri_mismatch')) message = "Google redirect URI mismatch. Check OAuth configuration.";
  } else if (reason === 'facebook') {
    message = "Facebook sign-in failed. Please try again.";
    if (error?.includes('access_denied')) message = "Facebook access denied. Please allow access to continue.";
    if (error?.includes('redirect_uri_mismatch')) message = "Facebook redirect URI mismatch. Check OAuth configuration.";
  }

  const redirectUri = decodeState(state) ||
    (process.env.FRONTEND_URL || 'http://localhost:5173') + '/oauth/callback';

  console.log('Failure handler - redirecting to:', redirectUri, 'message:', message);
  res.redirect(`${redirectUri}?error=${encodeURIComponent(message)}`);
});

// Update user profile image
router.put('/profile-image', authenticate, uploadProfile.single('profileImage'), async (req, res) => {
  try {
    const { User } = require('../models');
    const { uploadProfileToSupabase } = require('../middleware/supabaseUpload');
    
    const user = await User.findByPk(req.user.id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    if (req.file) {
      // Upload new profile image to Supabase
      const imageUrl = await uploadProfileToSupabase(req.file, req.user.id);
      
      // Update user's profile_image_url
      await user.update({ profile_image_url: imageUrl });
      
      res.json({ 
        success: true, 
        message: 'Profile image updated successfully',
        profile_image_url: imageUrl
      });
    } else {
      res.status(400).json({ 
        success: false, 
        message: 'No image file provided' 
      });
    }
  } catch (error) {
    console.error('Profile image upload error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to upload profile image' 
    });
  }
});

router.get('/test', authenticate, (req, res) => {
  res.json({ 
    success: true, 
    user: req.user 
  });
});

module.exports = router;