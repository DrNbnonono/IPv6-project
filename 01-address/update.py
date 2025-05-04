import os
import csv
import requests
from bs4 import BeautifulSoup
import time
from urllib.parse import urljoin

def query_bgp_info(ipv6_prefix):
    """
    查询BGP.he.net获取ASN和网络信息
    """
    base_url = "https://bgp.he.net"
    url = urljoin(base_url, f"/net/{ipv6_prefix}")
    
    try:
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        }
        response = requests.get(url, headers=headers)
        response.raise_for_status()
        
        soup = BeautifulSoup(response.text, 'html.parser')
        
        # 提取ASN信息
        asn_link = soup.find('a', href=lambda x: x and x.startswith('/AS'))
        asn = asn_link.text.replace('AS', '') if asn_link else None
        
        # 提取正确的网络前缀
        prefix_link = soup.find('a', href=lambda x: x and x.startswith('/net/') and ':' in x)
        correct_prefix = prefix_link.text if prefix_link else ipv6_prefix
        
        return asn, correct_prefix
        
    except Exception as e:
        print(f"查询 {ipv6_prefix} 时出错: {e}")
        return None, ipv6_prefix

def update_csv_with_bgp_info(input_csv, output_csv):
    """
    更新CSV文件中的ASN和前缀信息
    """
    updated_rows = []
    
    with open(input_csv, 'r') as infile:
        reader = csv.DictReader(infile)
        fieldnames = reader.fieldnames
        
        for row in reader:
            if row['prefix']:  # 只更新有前缀的行
                print(f"正在查询 {row['prefix']}...")
                asn, correct_prefix = query_bgp_info(row['prefix'])
                
                # 更新行数据
                row['asn'] = asn if asn else row['asn']
                row['prefix'] = correct_prefix
                
                updated_rows.append(row)
                
                # 礼貌性延迟，避免被封
                time.sleep(1)
            else:
                updated_rows.append(row)
    
    # 写入更新后的CSV
    with open(output_csv, 'w', newline='') as outfile:
        writer = csv.DictWriter(outfile, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(updated_rows)

def main():
    parser = argparse.ArgumentParser(description='使用BGP.he.net更新IPv6文件的ASN和前缀信息')
    parser.add_argument('-i', '--input', default='/home/ipv6/IPv6-project/01-address/ipv6_files.csv', help='输入CSV文件路径')
    parser.add_argument('-o', '--output', default='/home/ipv6/IPv6-project/01-address/ipv6_files_update.csv', help='输出CSV文件路径')
    
    args = parser.parse_args()
    
    print(f"正在从 {args.input} 读取数据并查询BGP信息...")
    update_csv_with_bgp_info(args.input, args.output)
    print(f"完成! 结果已保存到 {args.output}")

if __name__ == "__main__":
    import argparse
    main()