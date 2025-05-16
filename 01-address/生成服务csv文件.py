#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import csv
import re
import os

# 定义输入和输出文件路径
input_txt_file = "/home/ipv6/IPv6-project/01-address/全球服务地址.txt"
input_asn_file = "/home/ipv6/IPv6-project/01-address/asn0.csv"
output_csv_file = "/home/ipv6/IPv6-project/01-address/asn_protocol_stats.csv"

# 协议ID映射表（根据数据库中的协议信息）
protocol_mapping = {
    "ssh_22": {"protocol_id": 1, "protocol_name": "SSH", "port": 22},
    "http_80": {"protocol_id": 2, "protocol_name": "HTTP", "port": 80},
    "tls_443": {"protocol_id": 3, "protocol_name": "TLS", "port": 443},
    "http_8080": {"protocol_id": 4, "protocol_name": "HTTP-alt", "port": 8080},
    "ftp_21": {"protocol_id": 5, "protocol_name": "FTP", "port": 21},
    "telnet_23": {"protocol_id": 6, "protocol_name": "Telnet", "port": 23},
    "dns_a_53": {"protocol_id": 7, "protocol_name": "DNS", "port": 53},
    "ntp_123": {"protocol_id": 8, "protocol_name": "NTP", "port": 123}
}

# 从asn0.csv文件中读取ISP名称和ASN的映射关系
def load_asn_mapping():
    asn_mapping = {}
    with open(input_asn_file, 'r', encoding='utf-8') as f:
        reader = csv.reader(f)
        next(reader, None)  # 跳过标题行
        for row in reader:
            if len(row) >= 5:
                country = row[0]
                asn = row[1]
                file_path = row[3]
                
                # 从文件路径中提取ISP名称（倒数第二个位置）
                path_parts = file_path.split('/')
                if len(path_parts) >= 2:
                    isp_name = path_parts[-2]
                    # 创建复合键 (国家, ISP名称)
                    key = (country, isp_name)
                    asn_mapping[key] = asn
    return asn_mapping

# 从全球服务地址.txt文件中提取数据
def extract_service_data():
    service_data = []
    isp_section_started = False
    
    with open(input_txt_file, 'r', encoding='utf-8') as f:
        for line in f:
            line = line.strip()
            
            # 检查是否到达ISP级别的数据部分
            if "ISP级别IPv6边界网关设备暴露服务统计结果" in line:
                isp_section_started = True
                continue
            
            if isp_section_started and line.startswith('['):
                # 使用正则表达式匹配数据行
                pattern = r'\[.*?\] (\w+)\s+(\w+)\s+(\S+)\s+(\S+)\s+(\d+)'
                match = re.search(pattern, line)
                
                if match:
                    rir = match.group(1)
                    country = match.group(2)
                    isp = match.group(3)
                    service = match.group(4)
                    device_count = match.group(5)
                    
                    # 只处理有效的服务数据
                    if service in protocol_mapping:
                        protocol_info = protocol_mapping[service]
                        service_data.append({
                            'rir': rir,
                            'country': country,
                            'isp': isp,
                            'service': service,
                            'protocol_name': protocol_info['protocol_name'],
                            'protocol_id': protocol_info['protocol_id'],
                            'port': protocol_info['port'],
                            'device_count': int(device_count)
                        })
    
    return service_data

# 主函数
def main():
    # 加载ASN映射
    asn_mapping = load_asn_mapping()
    
    # 提取服务数据
    service_data = extract_service_data()
    
    # 写入CSV文件
    with open(output_csv_file, 'w', encoding='utf-8', newline='') as f:
        writer = csv.writer(f)
        # 写入标题行
        writer.writerow(['RIR', '国家', 'ISP', 'asn', '服务名称', '端口号', '设备数量', 'protocol_id'])
        
        # 写入数据行
        for data in service_data:
            rir = data['rir']
            country = data['country']
            isp = data['isp']
            key = (country, isp)
            
            # 查找对应的ASN
            asn = asn_mapping.get(key, "未知")
            
            writer.writerow([
                rir,
                country,
                isp,
                asn,
                data['protocol_name'],
                data['port'],
                data['device_count'],
                data['protocol_id']
            ])
    
    print(f"CSV文件已生成: {output_csv_file}")

if __name__ == "__main__":
    main()