-- 14：知识库分块（P4-5）
--
--   knowledge_chunks   Agent 知识问答用的检索库：文档按标题/段落切成小块，每块一行。
--                      FULLTEXT ... WITH PARSER ngram 是 MySQL 8 自带的中文分词（按 2 字切分），
--                      不引入向量库。注意：MariaDB 没有 ngram 解析器，这个迁移需要 MySQL 8。
--   source             文档来源（相对项目根目录的路径，如 backend/knowledge/ipv6/addressing.md）
--   content_hash       块内容的 sha256，重新索引时用来判断文档是否有变化
-- 内容由 backend/scripts/indexKnowledge.js 写入（node scripts/indexKnowledge.js），迁移本身不插入数据。
-- 可重复执行。

CREATE TABLE IF NOT EXISTS `knowledge_chunks` (
  `chunk_id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `source` VARCHAR(255) NOT NULL COMMENT '文档来源（相对项目根目录的路径）',
  `chunk_no` INT UNSIGNED NOT NULL COMMENT '块在文档里的序号',
  `title` VARCHAR(255) NOT NULL COMMENT '文档标题 + 小节标题',
  `content` TEXT NOT NULL COMMENT '块正文',
  `content_hash` CHAR(64) NOT NULL COMMENT '块内容 sha256',
  `indexed_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`chunk_id`),
  UNIQUE KEY `uk_source_chunk` (`source`, `chunk_no`),
  FULLTEXT KEY `ft_title_content` (`title`, `content`) WITH PARSER ngram
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Agent 知识库分块（ngram 全文索引）';
