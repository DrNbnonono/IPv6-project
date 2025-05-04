#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import mysql.connector
from mysql.connector import Error

def test_mysql_connection():
    try:
        # 替换为您的数据库连接信息
        connection = mysql.connector.connect(
            host='localhost',
            user='linux_db',
            password='root',
            database='ipv6_project'
        )
        
        if connection.is_connected():
            db_info = connection.get_server_info()
            print(f"✅ 成功连接到MySQL服务器，版本: {db_info}")
            
            cursor = connection.cursor()
            cursor.execute("SELECT DATABASE()")
            database = cursor.fetchone()
            print(f"当前数据库: {database[0]}")
            
            # 测试查询
            cursor.execute("SHOW TABLES")
            tables = cursor.fetchall()
            print("\n数据库表列表:")
            for table in tables:
                print(f"- {table[0]}")
            
            return True
            
    except Error as e:
        print(f"❌ 连接数据库时出错: {e}")
        return False
    finally:
        if 'connection' in locals() and connection.is_connected():
            cursor.close()
            connection.close()
            print("✅ 数据库连接已关闭")

if __name__ == "__main__":
    test_mysql_connection()