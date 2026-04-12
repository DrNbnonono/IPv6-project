/**
 * Agent记忆服务
 * 短期记忆：对话上下文
 * 长期记忆：用户偏好、工具使用历史、知识库
 */

const db = require('../database/db');

// 记忆配置
const MEMORY_CONFIG = {
  // 短期记忆配置
  shortTerm: {
    maxMessages: 50,           // 最大保留消息数
    maxTokens: 8000,           // 最大token数（约32000字符）
    sessionTimeout: 30 * 60 * 1000  // 30分钟会话超时
  },

  // 长期记忆配置
  longTerm: {
    userPreferencesKey: 'agent:user:preferences:',    // 用户偏好存储键前缀
    toolHistoryKey: 'agent:tool:history:',            // 工具使用历史键前缀
    knowledgeKey: 'agent:knowledge:',                  // 知识库键前缀
    sessionKey: 'agent:session:'                       // 会话存储键前缀
  }
};

/**
 * 短期记忆 - 管理对话上下文
 */
class ShortTermMemory {
  constructor(sessionId) {
    this.sessionId = sessionId;
    this.messages = [];
    this.createdAt = Date.now();
    this.lastAccessedAt = Date.now();
  }

  /**
   * 添加消息到短期记忆
   */
  addMessage(role, content, metadata = {}) {
    const message = {
      id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      role,  // 'user' | 'assistant' | 'system'
      content,
      timestamp: Date.now(),
      metadata
    };

    this.messages.push(message);
    this.lastAccessedAt = Date.now();

    // 修剪超出限制的消息
    this.prune();

    return message;
  }

  /**
   * 获取最近的消息历史
   */
  getRecentMessages(count = 20) {
    this.lastAccessedAt = Date.now();
    return this.messages.slice(-count);
  }

  /**
   * 获取所有消息
   */
  getAllMessages() {
    this.lastAccessedAt = Date.now();
    return this.messages;
  }

  /**
   * 估算当前token数（粗略估算：1 token ≈ 4字符）
   */
  estimateTokens() {
    const totalChars = this.messages.reduce((sum, msg) => {
      return sum + (msg.content?.length || 0);
    }, 0);
    return Math.ceil(totalChars / 4);
  }

  /**
   * 修剪超出的消息
   */
  prune() {
    // 按消息数限制修剪
    if (this.messages.length > MEMORY_CONFIG.shortTerm.maxMessages) {
      this.messages = this.messages.slice(-MEMORY_CONFIG.shortTerm.maxMessages);
    }

    // 按token限制修剪
    while (this.estimateTokens() > MEMORY_CONFIG.shortTerm.maxTokens && this.messages.length > 2) {
      this.messages.shift();
    }
  }

  /**
   * 清空短期记忆
   */
  clear() {
    this.messages = [];
  }

  /**
   * 检查会话是否超时
   */
  isExpired() {
    return (Date.now() - this.lastAccessedAt) > MEMORY_CONFIG.shortTerm.sessionTimeout;
  }

  /**
   * 获取摘要信息
   */
  getSummary() {
    return {
      sessionId: this.sessionId,
      messageCount: this.messages.length,
      estimatedTokens: this.estimateTokens(),
      createdAt: this.createdAt,
      lastAccessedAt: this.lastAccessedAt,
      isExpired: this.isExpired()
    };
  }
}

// 内存中的短期记忆存储（生产环境应使用Redis）
const shortTermMemoryStore = new Map();

/**
 * 获取或创建短期记忆会话
 */
const getOrCreateSession = (sessionId) => {
  if (!shortTermMemoryStore.has(sessionId)) {
    shortTermMemoryStore.set(sessionId, new ShortTermMemory(sessionId));
  }
  const session = shortTermMemoryStore.get(sessionId);

  // 检查是否超时，超时则创建新会话
  if (session.isExpired()) {
    session.clear();
  }

  return session;
};

/**
 * 删除短期记忆会话
 */
const deleteSession = (sessionId) => {
  shortTermMemoryStore.delete(sessionId);
};

/**
 * 清理所有过期的会话
 */
const cleanupExpiredSessions = () => {
  for (const [sessionId, session] of shortTermMemoryStore.entries()) {
    if (session.isExpired()) {
      shortTermMemoryStore.delete(sessionId);
    }
  }
};

// 定期清理过期会话（每5分钟）
setInterval(cleanupExpiredSessions, 5 * 60 * 1000);

/**
 * 长期记忆服务
 */
const longTermMemory = {
  /**
   * 保存用户偏好
   */
  async saveUserPreference(userId, preferences) {
    const key = `${MEMORY_CONFIG.longTerm.userPreferencesKey}${userId}`;

    try {
      // 存储到数据库
      const [rows] = await db.query(
        `INSERT INTO agent_memory (user_id, memory_type, memory_key, memory_value, created_at, updated_at)
         VALUES (?, 'preference', ?, ?, NOW(), NOW())
         ON DUPLICATE KEY UPDATE memory_value = ?, updated_at = NOW()`,
        [userId, key, JSON.stringify(preferences), JSON.stringify(preferences)]
      );

      return { success: true };
    } catch (error) {
      console.error('保存用户偏好失败:', error.message);
      return { success: false, error: error.message };
    }
  },

  /**
   * 获取用户偏好
   */
  async getUserPreference(userId) {
    const key = `${MEMORY_CONFIG.longTerm.userPreferencesKey}${userId}`;

    try {
      const [rows] = await db.query(
        'SELECT memory_value FROM agent_memory WHERE user_id = ? AND memory_key = ?',
        [userId, key]
      );

      if (rows.length > 0) {
        return { success: true, data: JSON.parse(rows[0].memory_value) };
      }
      return { success: true, data: null };
    } catch (error) {
      console.error('获取用户偏好失败:', error.message);
      return { success: false, error: error.message };
    }
  },

  /**
   * 记录工具使用历史
   */
  async addToolHistory(userId, toolName, params, result) {
    try {
      const [rows] = await db.query(
        `INSERT INTO agent_memory (user_id, memory_type, memory_key, memory_value, created_at, updated_at)
         VALUES (?, 'tool_history', ?, ?, NOW(), NOW())`,
        [userId, `${MEMORY_CONFIG.longTerm.toolHistoryKey}${toolName}`, JSON.stringify({ params, result, timestamp: Date.now() })]
      );

      return { success: true };
    } catch (error) {
      console.error('记录工具历史失败:', error.message);
      return { success: false, error: error.message };
    }
  },

  /**
   * 获取工具使用历史
   */
  async getToolHistory(userId, toolName = null, limit = 10) {
    try {
      let sql = 'SELECT * FROM agent_memory WHERE user_id = ? AND memory_type = ?';
      const params = [userId, 'tool_history'];

      if (toolName) {
        sql += ' AND memory_key LIKE ?';
        params.push(`${MEMORY_CONFIG.longTerm.toolHistoryKey}${toolName}%`);
      }

      sql += ' ORDER BY created_at DESC LIMIT ?';
      params.push(limit);

      const [rows] = await db.query(sql, params);

      return {
        success: true,
        data: rows.map(row => ({
          toolName: row.memory_key.replace(MEMORY_CONFIG.longTerm.toolHistoryKey, ''),
          ...JSON.parse(row.memory_value)
        }))
      };
    } catch (error) {
      console.error('获取工具历史失败:', error.message);
      return { success: false, error: error.message };
    }
  },

  /**
   * 保存知识到知识库
   */
  async saveKnowledge(userId, category, content, metadata = {}) {
    try {
      const key = `${MEMORY_CONFIG.longTerm.knowledgeKey}${category}`;

      const [rows] = await db.query(
        `INSERT INTO agent_memory (user_id, memory_type, memory_key, memory_value, created_at, updated_at)
         VALUES (?, 'knowledge', ?, ?, NOW(), NOW())`,
        [userId, key, JSON.stringify({ content, metadata, timestamp: Date.now() })]
      );

      return { success: true };
    } catch (error) {
      console.error('保存知识失败:', error.message);
      return { success: false, error: error.message };
    }
  },

  /**
   * 搜索知识库
   */
  async searchKnowledge(userId, query, category = null) {
    try {
      let sql = `SELECT * FROM agent_memory
                 WHERE user_id = ? AND memory_type = 'knowledge'`;
      const params = [userId];

      if (category) {
        sql += ' AND memory_key LIKE ?';
        params.push(`${MEMORY_CONFIG.longTerm.knowledgeKey}${category}%`);
      }

      sql += ' ORDER BY created_at DESC LIMIT 20';

      const [rows] = await db.query(sql, params);

      // 简单的关键词匹配
      const results = rows
        .map(row => {
          const data = JSON.parse(row.memory_value);
          const content = typeof data === 'string' ? data : data.content;
          const category = row.memory_key.replace(MEMORY_CONFIG.longTerm.knowledgeKey, '');

          // 简单的相关性评分
          let score = 0;
          const queryLower = query.toLowerCase();
          if (content.toLowerCase().includes(queryLower)) {
            score = queryLower.length / content.length;
          }

          return { score, category, content, metadata: data.metadata || {} };
        })
        .filter(item => item.score > 0)
        .sort((a, b) => b.score - a.score);

      return { success: true, data: results };
    } catch (error) {
      console.error('搜索知识失败:', error.message);
      return { success: false, error: error.message };
    }
  },

  /**
   * 获取用户的所有长期记忆摘要
   */
  async getMemorySummary(userId) {
    try {
      const [rows] = await db.query(
        `SELECT memory_type, COUNT(*) as count
         FROM agent_memory
         WHERE user_id = ?
         GROUP BY memory_type`,
        [userId]
      );

      const summary = {
        preferences: 0,
        toolHistory: 0,
        knowledge: 0
      };

      rows.forEach(row => {
        if (row.memory_type === 'preference') summary.preferences = row.count;
        if (row.memory_type === 'tool_history') summary.toolHistory = row.count;
        if (row.memory_type === 'knowledge') summary.knowledge = row.count;
      });

      return { success: true, data: summary };
    } catch (error) {
      console.error('获取记忆摘要失败:', error.message);
      return { success: false, error: error.message };
    }
  },

  /**
   * 清空用户的所有长期记忆
   */
  async clearAllMemory(userId) {
    try {
      await db.query('DELETE FROM agent_memory WHERE user_id = ?', [userId]);
      return { success: true };
    } catch (error) {
      console.error('清空记忆失败:', error.message);
      return { success: false, error: error.message };
    }
  }
};

/**
 * 构建带有记忆上下文的提示词
 */
const buildContextualPrompt = async (userId, basePrompt, options = {}) => {
  const { includeHistory = true, includePreferences = true, includeToolHistory = false } = options;

  let contextualPrompt = basePrompt;
  const contextParts = [];

  // 添加用户偏好
  if (includePreferences) {
    const prefsResult = await longTermMemory.getUserPreference(userId);
    if (prefsResult.success && prefsResult.data) {
      contextParts.push(`用户偏好：${JSON.stringify(prefsResult.data)}`);
    }
  }

  // 添加工具使用历史摘要
  if (includeToolHistory) {
    const historyResult = await longTermMemory.getToolHistory(userId, null, 5);
    if (historyResult.success && historyResult.data.length > 0) {
      const recentTools = historyResult.data.map(h => h.toolName).join(', ');
      contextParts.push(`最近使用的工具：${recentTools}`);
    }
  }

  if (contextParts.length > 0) {
    contextualPrompt = `[上下文]\n${contextParts.join('\n')}\n\n[用户请求]\n${basePrompt}`;
  }

  return contextualPrompt;
};

module.exports = {
  ShortTermMemory,
  getOrCreateSession,
  deleteSession,
  cleanupExpiredSessions,
  longTermMemory,
  buildContextualPrompt,
  MEMORY_CONFIG
};
