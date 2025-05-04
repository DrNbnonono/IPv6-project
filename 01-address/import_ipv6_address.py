#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import os
import sys
import argparse
import mysql.connector
from mysql.connector import Error
import time
import csv
from dotenv import load_dotenv
from tqdm import tqdm

# 加载环境变量
load_dotenv()

def connect_to_database():
    """连接到数据库"""
    try:
        connection = mysql.connector.connect(
            host='localhost',  # 直接指定主机
            user='linux_db',   # 直接指定用户名
            password='root',   # 直接指定密码
            database='ipv6_project'  # 直接指定数据库名
        )
        if connection.is_connected():
            print("✅ 成功连接到数据库 ipv6_project")
            return connection
    except Error as e:
        print(f"❌ 连接数据库时出错: {e}")
        sys.exit(1)

def check_and_import_asn(connection, asn, country_id, as_name):
    """检查ASN是否存在，不存在则导入"""
    cursor = connection.cursor(dictionary=True)
    
    try:
        # 检查ASN是否存在
        cursor.execute("SELECT asn FROM asns WHERE asn = %s", (asn,))
        result = cursor.fetchone()
        
        if not result:
            print(f"⚠️ ASN '{asn}' 不存在，正在导入...")
            
            # 检查国家是否存在
            cursor.execute("SELECT country_id FROM countries WHERE country_id = %s", (country_id,))
            if not cursor.fetchone():
                print(f"❌ 错误: 国家ID '{country_id}' 不存在，无法导入ASN")
                return False
            
            # 导入ASN
            cursor.execute(
                "INSERT INTO asns (asn, as_name, country_id) VALUES (%s, %s, %s)",
                (asn, as_name, country_id)
            )
            connection.commit()
            print(f"✅ 成功导入ASN '{asn}' ({as_name})")
            
            # 更新国家下的ASN统计
            cursor.execute("""
                UPDATE countries 
                SET total_ipv6_prefixes = (
                    SELECT COUNT(*) FROM ip_prefixes WHERE country_id = %s
                )
                WHERE country_id = %s
            """, (country_id, country_id))
            connection.commit()
            
            return True
        else:
            print(f"✅ ASN '{asn}' 已存在")
            return True
    except Error as e:
        print(f"❌ 检查/导入ASN时出错: {e}")
        connection.rollback()
        return False
    finally:
        cursor.close()

def validate_inputs(connection, country_id, asn):
    """验证输入参数"""
    cursor = connection.cursor(dictionary=True)
    
    # 验证国家ID
    cursor.execute("SELECT country_id FROM countries WHERE country_id = %s", (country_id,))
    if not cursor.fetchone():
        print(f"❌ 错误: 国家ID '{country_id}' 不存在")
        cursor.close()
        return False
    
    # 验证ASN
    cursor.execute("SELECT asn FROM asns WHERE asn = %s", (asn,))
    if not cursor.fetchone():
        print(f"❌ 错误: ASN '{asn}' 不存在")
        cursor.close()
        return False
    
    cursor.close()
    return True

def import_addresses(connection, country_id, asn, prefix, file_path, batch_size=1000):
    """从文件导入IPv6地址"""
    if not os.path.exists(file_path):
        print(f"❌ 错误: 文件 '{file_path}' 不存在")
        return False
    
    cursor = connection.cursor()
    
    try:
        # 开始事务
        connection.start_transaction()
        
        # 创建临时表
        cursor.execute("""
            CREATE TEMPORARY TABLE temp_addresses (
                address VARCHAR(128) NOT NULL,
                is_processed BOOLEAN DEFAULT FALSE,
                PRIMARY KEY (address)
            )
        """)
        
        # 从文件读取地址
        print(f"📖 正在读取文件 '{file_path}'...")
        addresses = []
        total_lines = 0
        valid_addresses = 0
        
        # 计算文件总行数用于进度条
        with open(file_path, 'r') as f:
            file_lines = sum(1 for _ in f)
        
        # 读取并处理文件
        with open(file_path, 'r') as f:
            # 使用tqdm创建进度条
            for line in tqdm(f, total=file_lines, desc="读取地址", unit="行"):
                total_lines += 1
                line = line.strip()
                
                # 跳过空行和注释行
                if not line or line.startswith('#'):
                    continue
                
                # 处理CSV格式或纯地址格式
                address = line
                if ',' in line:
                    address = line.split(',')[0].strip()
                
                # 验证IPv6地址格式（简单验证）
                if ':' in address:
                    addresses.append((address,))
                    valid_addresses += 1
                
                # 批量插入
                if len(addresses) >= batch_size:
                    cursor.executemany(
                        "INSERT IGNORE INTO temp_addresses (address) VALUES (%s)",
                        addresses
                    )
                    connection.commit()
                    addresses = []
        
        # 处理剩余的地址
        if addresses:
            cursor.executemany(
                "INSERT IGNORE INTO temp_addresses (address) VALUES (%s)",
                addresses
            )
        
        print(f"✅ 文件处理完成，共 {total_lines} 行，{valid_addresses} 个有效地址")
        
        # 设置输出变量
        cursor.execute("SET @imported = 0, @errors = 0")
        
        # 调用存储过程
        print(f"⚙️ 正在调用存储过程导入地址...")
        cursor.execute(
            "CALL batch_import_ipv6_addresses(%s, %s, %s, @imported, @errors)",
            (country_id, asn, prefix)
        )
        
        # 获取结果
        cursor.execute("SELECT @imported as imported_count, @errors as error_count")
        result = cursor.fetchone()
        
        # 提交事务
        connection.commit()
        
        print(f"✅ 导入完成！成功导入 {result[0]} 个地址，{result[1]} 个错误")
        return True
        
    except Error as e:
        connection.rollback()
        print(f"❌ 导入过程中出错: {e}")
        return False
    finally:
        # 清理临时表
        try:
            cursor.execute("DROP TEMPORARY TABLE IF EXISTS temp_addresses")
            connection.commit()
        except:
            pass
        cursor.close()

def process_csv_file(csv_file_path):
    """处理CSV文件，导入ASN和地址"""
    if not os.path.exists(csv_file_path):
        print(f"❌ 错误: CSV文件 '{csv_file_path}' 不存在")
        return False
    
    print(f"📊 正在处理CSV文件: {csv_file_path}")
    
    # 连接数据库
    connection = connect_to_database()
    if not connection:
        return False
    
    try:
        # 读取CSV文件
        with open(csv_file_path, 'r') as csvfile:
            reader = csv.DictReader(csvfile)
            total_rows = sum(1 for _ in open(csv_file_path)) - 1  # 减去标题行
            
            # 使用tqdm创建进度条
            for row in tqdm(reader, total=total_rows, desc="处理CSV行", unit="行"):
                country_id = row.get('country', '').strip()
                asn = row.get('asn', '').strip()
                prefix = row.get('prefix', '').strip()
                file_path = row.get('file', '').strip()
                as_name = row.get('as_name', '').strip()
                
                if not all([country_id, asn, prefix, file_path, as_name]):
                    print(f"⚠️ 警告: CSV行数据不完整，跳过: {row}")
                    continue
                
                try:
                    asn = int(asn)
                except ValueError:
                    print(f"⚠️ 警告: ASN '{asn}' 不是有效的整数，跳过")
                    continue
                
                print(f"\n📌 处理: 国家={country_id}, ASN={asn}, 前缀={prefix}")
                
                # 检查并导入ASN
                if not check_and_import_asn(connection, asn, country_id, as_name):
                    print(f"⚠️ 警告: 无法导入ASN {asn}，跳过此行")
                    continue
                
                # 为每个新的ASN创建一个新的连接，避免事务冲突
                row_connection = connect_to_database()
                if not row_connection:
                    print(f"⚠️ 警告: 无法为ASN {asn}创建新连接，跳过此行")
                    continue
                
                try:
                    # 导入地址
                    import_addresses(row_connection, country_id, asn, prefix, file_path)
                finally:
                    # 确保连接被关闭
                    row_connection.close()
                
                print(f"✅ 完成处理: 国家={country_id}, ASN={asn}, 前缀={prefix}\n")
                
        return True
    except Exception as e:
        print(f"❌ 处理CSV文件时出错: {e}")
        return False
    finally:
        if connection:
            connection.close()

def main():
    """主函数"""
    parser = argparse.ArgumentParser(description='导入IPv6地址到数据库')
    parser.add_argument('-c', '--country', help='国家ID (2字母代码)')
    parser.add_argument('-a', '--asn', type=int, help='ASN编号')
    parser.add_argument('-p', '--prefix', help='IPv6前缀 (如2001:db8::/32)')
    parser.add_argument('-f', '--file', help='IPv6地址文件路径')
    parser.add_argument('-b', '--batch', type=int, default=1000, help='批处理大小 (默认: 1000)')
    parser.add_argument('--csv', default='/home/ipv6/IPv6-project/01-address/asn1.csv', help='CSV文件路径，包含多个导入任务')
    parser.add_argument('--as-name', help='ASN名称 (当ASN不存在时使用)')
    
    args = parser.parse_args()
    
    print("🚀 IPv6地址导入工具")
    
    # 处理CSV文件模式
    if args.csv:
        success = process_csv_file(args.csv)
        sys.exit(0 if success else 1)
    
    # 单文件模式参数验证
    if not all([args.country, args.asn, args.prefix, args.file]):
        print("❌ 错误: 单文件模式下需要提供所有必要参数 (-c, -a, -p, -f)")
        parser.print_help()
        sys.exit(1)
    
    print(f"📋 参数信息:")
    print(f"   - 国家ID: {args.country}")
    print(f"   - ASN: {args.asn}")
    print(f"   - 前缀: {args.prefix}")
    print(f"   - 文件: {args.file}")
    print(f"   - 批处理大小: {args.batch}")
    
    # 连接数据库
    connection = connect_to_database()
    
    # 检查并导入ASN（如果不存在）
    if args.as_name:
        if not check_and_import_asn(connection, args.asn, args.country, args.as_name):
            connection.close()
            sys.exit(1)
    
    # 验证输入
    if not validate_inputs(connection, args.country, args.asn):
        connection.close()
        sys.exit(1)
    
    # 记录开始时间
    start_time = time.time()
    
    # 导入地址
    success = import_addresses(
        connection, 
        args.country, 
        args.asn, 
        args.prefix, 
        args.file,
        args.batch
    )
    
    # 计算耗时
    elapsed_time = time.time() - start_time
    
    if success:
        print(f"✅ 导入成功完成！耗时: {elapsed_time:.2f} 秒")
    else:
        print(f"❌ 导入失败！耗时: {elapsed_time:.2f} 秒")
    
    # 关闭连接
    connection.close()

if __name__ == "__main__":
    main()