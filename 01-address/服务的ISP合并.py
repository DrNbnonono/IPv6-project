#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import csv
import pandas as pd
from collections import defaultdict

def process_asn_protocol_stats(input_file, output_file):
    """
    处理ASN协议统计数据，合并相同ASN和协议的记录
    
    参数:
        input_file: 输入CSV文件路径
        output_file: 输出CSV文件路径
    """
    print(f"正在处理文件: {input_file}")
    
    # 读取CSV文件
    df = pd.read_csv(input_file)
    
    # 创建一个字典来存储合并后的数据
    merged_data = defaultdict(lambda: defaultdict(dict))
    
    # 遍历CSV数据
    for _, row in df.iterrows():
        rir = row['RIR']
        country = row['国家']
        isp = row['ISP']
        asn = row['asn']
        service = row['服务名称']
        port = row['端口号']
        device_count = row['设备数量']
        protocol_id = row['protocol_id']
        
        # 创建键以唯一标识一条记录
        key = (rir, country, asn, service, port, protocol_id)
        
        # 如果这个键已经存在，更新ISP和设备数量
        if key in merged_data:
            # 获取现有的ISP列表
            existing_isps = merged_data[key]['isp'].split('、 ') if '、 ' in merged_data[key]['isp'] else [merged_data[key]['isp']]
            
            # 如果当前ISP不在列表中，添加它
            if isp not in existing_isps:
                existing_isps.append(isp)
                merged_data[key]['isp'] = '、 '.join(existing_isps)
            
            # 累加设备数量
            merged_data[key]['device_count'] += device_count
        else:
            # 如果这是一个新键，直接添加数据
            merged_data[key] = {
                'isp': isp,
                'device_count': device_count
            }
    
    # 将合并后的数据转换回DataFrame
    result_data = []
    for (rir, country, asn, service, port, protocol_id), values in merged_data.items():
        result_data.append({
            'RIR': rir,
            '国家': country,
            'ISP': values['isp'],
            'asn': asn,
            '服务名称': service,
            '端口号': port,
            '设备数量': values['device_count'],
            'protocol_id': protocol_id
        })
    
    # 创建新的DataFrame并保存为CSV
    result_df = pd.DataFrame(result_data)
    
    # 按RIR、国家、ASN、协议ID排序
    result_df = result_df.sort_values(by=['RIR', '国家', 'asn', 'protocol_id'])
    
    # 保存到CSV文件
    result_df.to_csv(output_file, index=False, encoding='utf-8')
    
    print(f"处理完成，结果已保存到: {output_file}")
    print(f"原始记录数: {len(df)}")
    print(f"合并后记录数: {len(result_df)}")

if __name__ == "__main__":
    input_file = "/home/ipv6/IPv6-project/01-address/asn_protocol_stats.csv"
    output_file = "/home/ipv6/IPv6-project/01-address/asn_protocol_stats_merged.csv"
    
    process_asn_protocol_stats(input_file, output_file)