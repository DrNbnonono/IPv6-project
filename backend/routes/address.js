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
router.get('/search', addressController.searchIPv6);
// 需要认证的路由
router.get('/addresses/:addressId', authenticate, addressController.getAddressDetail);

// 通用搜索
router.get('/search', addressController.searchIPv6);

// 获取全球统计
router.get('/global-stats', addressController.getGlobalStats);
router.get('/addresses/global-stats', addressController.getGlobalStats);


module.exports = router;