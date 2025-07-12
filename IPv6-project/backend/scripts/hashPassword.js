const bcrypt = require('bcrypt');
const saltRounds = 10; // 加密强度

// 替换为你的明文密码
const plainPassword = 'your_password'; 

bcrypt.hash(plainPassword, saltRounds, (err, hash) => {
  if (err) {
    console.error('加密失败:', err);
    return;
  }
  console.log('加密后的密码:', hash);
  // 复制此 hash 用于后续插入数据库
});