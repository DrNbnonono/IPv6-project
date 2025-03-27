const express = require('express');
const xmapController = require('../controllers/xmapController');

const router = express.Router();

router.post('/', xmapController.scan);

module.exports = router;