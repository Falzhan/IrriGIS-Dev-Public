const express = require('express');
const router = express.Router();
const { UserSettings } = require('../models');
const { authenticate, authorize } = require('../middleware/auth');

router.get('/', authenticate, authorize('nia_admin'), async (req, res) => {
  try {
    let settings = await UserSettings.findOne();
    if (!settings) {
      settings = await UserSettings.create({
        default_user_active: true
      });
    }
    res.status(200).json({ success: true, data: settings });
  } catch (error) {
    console.error('Get user settings error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

router.put('/', authenticate, authorize('nia_admin'), async (req, res) => {
  try {
    const { default_user_active } = req.body;
    
    let settings = await UserSettings.findOne();
    if (settings) {
      await settings.update({
        default_user_active: default_user_active ?? settings.default_user_active
      });
    } else {
      settings = await UserSettings.create({
        default_user_active: default_user_active ?? true
      });
    }
    
    res.status(200).json({ success: true, data: settings });
  } catch (error) {
    console.error('Update user settings error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
