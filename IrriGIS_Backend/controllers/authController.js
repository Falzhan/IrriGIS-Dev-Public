const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const { User, UserSettings } = require('../models');
const { uploadProfileToSupabase } = require('../middleware/supabaseUpload');
const { notifyNewUserPendingActivation } = require('./notificationController');

const login = async (req, res) => {
  try {
    const user = await User.findOne({ where: { email: req.body.email } });
    
    // Debug logs
    if (user) {
      console.log(`Login attempt for: ${user.email}`);
    } else {
      console.log('Login failed: User not found');
    }
    
    if (!user) {
      throw new Error('Invalid credentials');
    }

    // Check if user has a password (might be a social-only account)
    if (!user.password_hash) {
        throw new Error('Please login with Google/Facebook');
    }

    const isValidPassword = await user.validPassword(req.body.password);
    
    if (!isValidPassword) {
      throw new Error('Invalid credentials');
    }

    // Check if account is active
    if (!user.is_active) {
      throw new Error('Account not activated. Please wait for admin approval.');
    }

    // For ia_admin, check if IA is assigned
    if (user.role === 'ia_admin' && !user.ia_id) {
      throw new Error('No IA assigned. Please contact administrator.');
    }

    const sessionToken = crypto.randomBytes(32).toString('hex');
    await user.update({ session_token: sessionToken });

    const token = jwt.sign(
      { id: user.id, role: user.role, sessionToken },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN }
    );

    const { password_hash: _, ...userResponse } = user.toJSON();

    res.json({ success: true, token, user: userResponse });
  } catch (error) {
    console.error('Login error:', error.message);
    res.status(400).json({ success: false, message: error.message });
  }
};

const register = async (req, res) => {
  try {
    const {
      email,
      password,
      firstName,
      lastName,
      first_name,
      last_name,
      role,
      contact_number,
      address,
      ia_id,
      ris_id
    } = req.body;
      
    // 1. Normalize Inputs
    const finalFirstName = firstName || first_name;
    const finalLastName = lastName || last_name;

    // 2. VALIDATION
    if (!email) throw new Error('Email is required');
    if (!password) throw new Error('Password is required');
    if (!finalFirstName || !finalLastName) throw new Error('Name is required');

    // Check for existing user by email
    const existingUser = await User.findOne({ where: { email } });
    if (existingUser) {
      throw new Error('User already exists with this email');
    }

    // Check for existing user by name combination
    const existingUserByName = await User.findOne({ 
      where: { 
        first_name: finalFirstName, 
        last_name: finalLastName 
      } 
    });
    if (existingUserByName) {
      throw new Error('User already exists with this name');
    }

    // 3. Get profile image URL if uploaded
    let profileImageUrl = null;
    if (req.file) {
      // Upload to Supabase and get URL
      try {
        // Create a temporary user object to get ID for filename
        const tempUserId = crypto.randomBytes(16).toString('hex');
        profileImageUrl = await uploadProfileToSupabase(req.file, tempUserId);
      } catch (error) {
        console.error('Profile image upload error:', error);
        // Continue without profile image if upload fails
        profileImageUrl = null;
      }
    }

    // 4. Role Validation - Use role from frontend for mobile registration
    // Use role from frontend, default to ia_member if not provided
    const requestedRole = role || 'ia_member';
    
    // Allow NIA emails only if registering as NIA Staff
    const isNiaEmail = email.endsWith('@nia.gov.ph') || email.endsWith('@msugensan.edu.ph');
    
    // Block NIA emails if trying to register as IA Member
    if (isNiaEmail && requestedRole === 'ia_member') {
      throw new Error('NIA personnel must register as NIA Staff. Please select NIA Staff option.');
    }
    
    // Allow NIA emails only for NIA Staff registration
    if (isNiaEmail && requestedRole !== 'nia_field_officer') {
      throw new Error('Invalid email domain for this role. NIA emails can only register as NIA Staff.');
    }
    
    // Only require ia_id for ia_admin role
    if (requestedRole === 'ia_admin' && !ia_id) {
      throw new Error('Irrigator Association (IA) is required for IA admin registration')
    }

    // 5. Get user default settings
    let defaultUserActive = false; // Default to false for backward compatibility
    try {
      const userSettings = await UserSettings.findOne();
      if (userSettings) {
        defaultUserActive = userSettings.default_user_active;
      }
    } catch (error) {
      console.error('Failed to fetch user settings, using default:', error.message);
    }

    // 6. Create User
    const user = await User.create({
      email,
      password_hash: password,
      first_name: finalFirstName,
      last_name: finalLastName,
      role: requestedRole,
      contact_number: contact_number,
      address,
      ia_id: ia_id,
      ris_id: ris_id || null,
      profile_image_url: profileImageUrl,
      is_active: defaultUserActive
    });

    // Note: The User model's "beforeCreate" hook handles the hashing automatically.

    // 7. Notify admins if user is inactive (pending activation)
    if (!defaultUserActive) {
      // Fetch the user with associations for notification
      const userWithAssoc = await User.findByPk(user.id, {
        include: [
          { model: require('../models').IrrigatorAssociation, as: 'irrigatorAssociation' }
        ]
      });
      await notifyNewUserPendingActivation(userWithAssoc);
    }

    // 8. Generate Token
    const token = jwt.sign(
        { id: user.id, role: user.role },
        process.env.JWT_SECRET,
        { expiresIn: '1d' }
    );

    // Remove hash from response
    const { password_hash: _, ...userResponse } = user.toJSON();

    res.status(201).json({
        success: true,
        token,
        user: userResponse
    });

  } catch (error) {
    console.error('Registration error:', error.message);
    res.status(400).json({ success: false, message: error.message });
  }
};

module.exports = { login, register };