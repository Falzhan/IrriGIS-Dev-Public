//config/passport.js
const crypto = require('crypto');

const generateSessionToken = () => crypto.randomBytes(32).toString('hex');

const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const FacebookStrategy = require('passport-facebook').Strategy;
const { User } = require('../models'); // Ensure this path matches your folder structure
const bcrypt = require('bcrypt');

// 1. SERIALIZATION (Session/Cookie handling)
passport.serializeUser((user, done) => done(null, user.id));

passport.deserializeUser(async (id, done) => {
  try {
    const user = await User.findByPk(id);
    done(null, user);
  } catch (error) {
    done(error, null);
  }
});


// 2. GOOGLE STRATEGY
if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  const backendUrl = process.env.BACKEND_URL || 'https://irrigis-backend.onrender.com';
  console.log('Google strategy - backendUrl:', backendUrl);
  console.log('Google strategy - callbackURL:', `${backendUrl}/api/auth/google/callback`);
  
  const googleStrategy = new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: `${backendUrl}/api/auth/google/callback`,
  }, async (accessToken, refreshToken, profile, done) => {
    try {
      console.log('Google OAuth profile received:', { id: profile.id, email: profile.emails?.[0]?.value });
      console.log('Google OAuth tokens received:', { hasAccessToken: !!accessToken, hasRefreshToken: !!refreshToken });
      
      // A. Check if user exists by Google ID
      let user = await User.findOne({ where: { google_id: profile.id } });

      // B. If not found by ID, check by Email (to merge accounts)
      if (!user) {
        user = await User.findOne({ where: { email: profile.emails[0].value } });
        
        if (user) {
          // Merge: Existing email user is now linking Google
          user.google_id = profile.id;
          user.auth_provider = 'google';
          await user.save();
        }
      }

      // C. If still no user, Create New
      // For new OAuth users:
      // - @nia.gov.ph & @msugensan.edu.ph -> nia_field_officer (auto-activated)
      // - Other emails -> ia_member (requires admin approval)
      if (!user) {
        const email = profile.emails[0].value;
        const isNiaEmail = email.endsWith('@nia.gov.ph') || email.endsWith('@msugensan.edu.ph');
        
        user = await User.create({
          email: email,
          first_name: profile.name.givenName,
          last_name: profile.name.familyName,
          google_id: profile.id,
          auth_provider: 'google',
          role: isNiaEmail ? 'nia_field_officer' : 'ia_member',
          password_hash: null, // Explicitly null for OAuth
          is_active: isNiaEmail // Auto-activate NIA personnel
        });
      }

      // D. Return user - callback route will check is_active and redirect accordingly
      done(null, user);
    } catch (error) {
      console.error('Google Auth Error:', error);
      done(error, null);
    }
  });
  passport.use(googleStrategy);
  console.log('Google OAuth strategy initialized');
} else {
  console.log('Google OAuth strategy skipped - credentials not found');
}

// 3. FACEBOOK STRATEGY (With Phone Number Support)
if (process.env.FACEBOOK_APP_ID && process.env.FACEBOOK_APP_SECRET) {
  const backendUrl = process.env.BACKEND_URL || 'https://irrigis-backend.onrender.com';
  const facebookStrategy = new FacebookStrategy({
    clientID: process.env.FACEBOOK_APP_ID,
    clientSecret: process.env.FACEBOOK_APP_SECRET,
    callbackURL: `${backendUrl}/api/auth/facebook/callback`,
    profileFields: ['id', 'emails', 'name'], // We ask for email, but might not get it
  }, async (accessToken, refreshToken, profile, done) => {
    try {
      console.log('Facebook OAuth profile received:', { id: profile.id, emails: profile.emails });
      console.log('Facebook OAuth tokens received:', { hasAccessToken: !!accessToken, hasRefreshToken: !!refreshToken });
      
      // --- LOGIC START ---
      
      // 1. GENERATE PLACEHOLDER EMAIL
      // If profile.emails is undefined or empty, create a unique fake email based on FB ID.
      // This satisfies the database "NOT NULL" and "UNIQUE" constraints.
      const hasEmail = profile.emails && profile.emails.length > 0;
      const email = hasEmail ? profile.emails[0].value : `fb-${profile.id}@no-email.facebook.com`;

      // 2. CHECK BY FACEBOOK ID (Primary Check)
      // This identifies users who already signed up with FB, regardless of email changes.
      console.log('Facebook strategy - checking by facebook_id:', profile.id);
      let user = await User.findOne({ where: { facebook_id: profile.id } });
      console.log('Facebook strategy - user found by facebook_id:', user ? user.id : null);

      // 3. CHECK BY EMAIL (Secondary Check - Only if we have a real email)
      if (!user && hasEmail) {
        console.log('Facebook strategy - checking by email:', email);
        user = await User.findOne({ where: { email: email } });
        console.log('Facebook strategy - user found by email:', user ? user.id : null);
        
        if (user) {
          console.log('Facebook strategy - merging account, linking facebook_id');
          // Merge: Use existing account and link FB ID
          user.facebook_id = profile.id;
          user.auth_provider = 'facebook'; 
          await user.save();
        }
      }

      // 4. CREATE NEW USER
      if (!user) {
        user = await User.create({
          email: email, // Uses the placeholder if real email is missing
          first_name: profile.name.givenName || 'Facebook',
          last_name: profile.name.familyName || 'User',
          facebook_id: profile.id,
          auth_provider: 'facebook',
          role: 'ia_member',
          password_hash: null, // Explicitly null
          is_active: false // Facebook users need admin activation
        });
      }

      done(null, user);

    } catch (error) {
      console.error('Facebook Auth Error:', error);
      done(error, null);
    }
  });
  passport.use(facebookStrategy);
  console.log('Facebook OAuth strategy initialized');
} else {
  console.log('Facebook OAuth strategy skipped - credentials not found');
}

module.exports = passport;