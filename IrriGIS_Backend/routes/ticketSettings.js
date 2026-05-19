const express = require('express');
const router = express.Router();
const { TicketSettings } = require('../models');
const { authenticate } = require('../middleware/auth');

router.get('/', authenticate, async (req, res) => {
  try {
    let settings = await TicketSettings.findOne();
    if (!settings) {
      settings = await TicketSettings.create({
        proximity_threshold_meters: 50,
        auto_group_enabled: true
      });
    }
    res.status(200).json({ success: true, data: settings });
  } catch (error) {
    console.error('Get ticket settings error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

router.put('/', authenticate, async (req, res) => {
  try {
    const { proximity_threshold_meters, auto_group_enabled } = req.body;
    
    let settings = await TicketSettings.findOne();
    if (settings) {
      await settings.update({
        proximity_threshold_meters: proximity_threshold_meters ?? settings.proximity_threshold_meters,
        auto_group_enabled: auto_group_enabled ?? settings.auto_group_enabled
      });
    } else {
      settings = await TicketSettings.create({
        proximity_threshold_meters: proximity_threshold_meters ?? 50,
        auto_group_enabled: auto_group_enabled ?? true
      });
    }
    
    res.status(200).json({ success: true, data: settings });
  } catch (error) {
    console.error('Update ticket settings error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;