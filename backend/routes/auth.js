const express = require('express');
const authController = require('../controllers/authController');

const router = express.Router();

router.post('/login', authController.login); // 确保这一行存在

module.exports = router;