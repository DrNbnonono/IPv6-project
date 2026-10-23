const express = require('express')
const router = express.Router()
const authController = require('../controllers/authController')
const { loginLimiter } = require('../middleware/rateLimit')
const { audit, userIdFromToken, maskPhone } = require('../middleware/audit')

router.post('/login', loginLimiter, audit('auth.login', {
  resourceType: 'user',
  userId: userIdFromToken,
  detail: (req) => ({ phone: maskPhone(req.body && req.body.phone) })
}), authController.login)
module.exports = router