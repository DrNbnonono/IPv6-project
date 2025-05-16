#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import csv
import pymysql
import logging
from datetime import datetime
import os
import sys

# 配置日志
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    filename='update_asn_protocol_stats.log'
)

# 数据库连接配置
DB_CONFIG = {
    'host': 'localhost',
    'user': 'linux_db',  # 修改为与import_address02.py一致的用户名
    'password': 'root',  # 保持密码不变
    'database': 'ipv6_project',  # 修改为database而不是db
    'charset': 'utf8mb4',
    'cursorclass': pymysql.cursors.DictCursor
}

# CSV文件路径
CSV_FILE_PATH = '/home/ipv6/IPv6-project/01-address/asn_protocol_stats_merged.csv'

def update_asn_protocol_stats():
    """
    从CSV文件更新asn_protocol_stats表中的affected_addresses字段
    """
    try:
        # 连接数据库
        connection = pymysql.connect(**DB_CONFIG)
        logging.info("数据库连接成功")
        
        # 读取CSV文件并更新数据库
        with connection.cursor() as cursor:
            # 准备更新语句
            update_sql = """
            UPDATE asn_protocol_stats 
            SET affected_addresses = %s, 
                affected_percentage = CASE 
                    WHEN total_active_ipv6 > 0 THEN ROUND(%s * 100.0 / total_active_ipv6, 2)
                    ELSE 0
                END,
                last_updated = NOW()
            WHERE asn = %s AND protocol_id = %s
            """
            
            # 读取CSV文件
            with open(CSV_FILE_PATH, 'r', encoding='utf-8') as csvfile:
                # 跳过标题行
                csvreader = csv.reader(csvfile)
                header = next(csvreader)
                
                # 记录更新的行数
                updated_rows = 0
                total_rows = 0
                
                # 逐行处理CSV数据
                for row in csvreader:
                    total_rows += 1
                    try:
                        # 解析CSV行数据
                        # 格式: RIR,国家,ISP,asn,服务名称,端口号,设备数量,protocol_id
                        asn = int(row[3])
                        affected_addresses = int(row[6])
                        protocol_id = int(row[7])
                        
                        # 执行更新
                        cursor.execute(update_sql, (affected_addresses, affected_addresses, asn, protocol_id))
                        updated_rows += cursor.rowcount
                        
                        # 每1000行提交一次事务，避免事务过大
                        if total_rows % 1000 == 0:
                            connection.commit()
                            logging.info(f"已处理 {total_rows} 行数据，更新了 {updated_rows} 行")
                    
                    except Exception as e:
                        logging.error(f"处理行 {total_rows} 时出错: {e}")
                        continue
                
                # 提交剩余的事务
                connection.commit()
                logging.info(f"CSV处理完成，共处理 {total_rows} 行数据，更新了 {updated_rows} 行")
                
                # 调用存储过程更新其他关联表格
                logging.info("开始调用存储过程 update_relation_tables")
                cursor.execute("CALL update_relation_tables()")
                connection.commit()
                logging.info("存储过程 update_relation_tables 执行完成")
                
    except Exception as e:
        logging.error(f"发生错误: {e}")
    finally:
        if 'connection' in locals() and connection.open:
            connection.close()
            logging.info("数据库连接已关闭")

if __name__ == "__main__":
    start_time = datetime.now()
    logging.info(f"开始更新 asn_protocol_stats 表，当前时间: {start_time}")
    
    update_asn_protocol_stats()
    
    end_time = datetime.now()
    duration = end_time - start_time
    logging.info(f"更新完成，耗时: {duration}")
    print(f"更新完成，详细日志请查看 update_asn_protocol_stats.log")