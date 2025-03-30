const express = require('express');
const router = express.Router();
const addressController = require('../controllers/addressController');
const { authenticate } = require('../middleware/auth');

// 公共路由（无需认证）
router.get('/map-data', addressController.getMapData);
router.get('/countries/ranking', addressController.getCountryRanking);
router.get('/asns/ranking', addressController.getAsnRanking);
router.get('/countries/:countryId', addressController.getCountryDetail);
router.get('/asns/:asn', addressController.getAsnDetail);
router.get('/prefixes/search', addressController.searchPrefix);
router.get('/prefixes/:prefixId', addressController.getPrefixDetail);

// 需要认证的路由
router.get('/addresses/:addressId', authenticate, addressController.getAddressDetail);

module.exports = router;