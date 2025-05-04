import os
import csv
import argparse
from ipaddress import ip_network, IPv6Network

def find_longest_common_prefix(ip_list):
    """
    从IPv6地址列表中找出最长公共前缀
    """
    if not ip_list:
        return None
    
    # 将IP地址转换为二进制形式
    bin_ips = [bin(int(ip_network(ip).network_address))[2:].zfill(128) for ip in ip_list]
    
    prefix_length = 0
    # 比较每一位，直到发现不同的位
    for i in range(128):
        if all(bip[i] == bin_ips[0][i] for bip in bin_ips):
            prefix_length += 1
        else:
            break
    
    if prefix_length == 0:
        return None
    
    # 创建网络地址
    network = IPv6Network((int(ip_network(ip_list[0]).network_address), prefix_length), strict=False)
    return str(network)

def extract_prefix_from_file(file_path, sample_lines=10):
    """
    从文件中提取IPv6前缀
    """
    try:
        with open(file_path, 'r') as f:
            # 读取前10行有效的IPv6地址
            ips = []
            for _ in range(sample_lines):
                line = f.readline().strip()
                if line and ':' in line:  # 简单IPv6地址检查
                    # 处理可能带有端口或其他信息的行
                    ip_part = line.split()[0].split('#')[0].split('/')[0]
                    try:
                        # 标准化IPv6地址
                        network = ip_network(ip_part, strict=False)
                        ips.append(str(network))
                    except ValueError:
                        continue
            
            if not ips:
                return None
            
            return find_longest_common_prefix(ips)
    except Exception as e:
        print(f"处理文件 {file_path} 时出错: {e}")
        return None

def find_ipv6_files(folder_path, target_filename):
    """
    递归查找IPv6文件并返回路径和国家ID
    """
    for root, dirs, files in os.walk(folder_path):
        for file in files:
            if file == target_filename:
                full_path = os.path.abspath(os.path.join(root, file))
                parts = full_path.split(os.sep)
                
                # 假设国家ID是路径中的倒数第三个目录
                # 例如: /home/ipv6/periphery/result/XX/YY/uniq_ips.txt
                if len(parts) >= 3:
                    country_id = parts[-3]  # 倒数第三个目录作为国家ID
                    yield (country_id, full_path)

def write_to_csv(output_file, data):
    """
    将数据写入CSV文件
    """
    with open(output_file, 'w', newline='') as csvfile:
        writer = csv.writer(csvfile)
        writer.writerow(['country', 'asn', 'prefix', 'file', 'batch'])
        
        for country_id, file_path in data:
            prefix = extract_prefix_from_file(file_path)
            writer.writerow([
                country_id,
                "",  # ASN留空
                prefix if prefix else "",
                file_path,
                1000  # 默认batch大小
            ])

def main():
    parser = argparse.ArgumentParser(description='查找IPv6地址文件并生成CSV')
    parser.add_argument('-d', '--directory', default='/home/ipv6/periphery/result',
                       help='要搜索的根目录路径')
    parser.add_argument('-f', '--filename', default='uniq_ips.txt',
                       help='要查找的目标文件名 (默认: uniq_ips.txt)')
    parser.add_argument('-o', '--output', default='/home/ipv6/IPv6-project/01-address/ipv6_files.csv',
                       help='输出CSV文件路径 (默认: ipv6_files.csv)')
    parser.add_argument('-s', '--sample', type=int, default=30,
                       help='用于前缀检测的样本行数 (默认: 10)')
    
    args = parser.parse_args()
    
    print(f"正在查找 '{args.filename}' 在目录 '{args.directory}' 中...")
    ipv6_files = list(find_ipv6_files(args.directory, args.filename))
    
    if not ipv6_files:
        print("没有找到匹配的文件")
        return
    
    print(f"找到 {len(ipv6_files)} 个文件，正在分析前缀并写入 {args.output}...")
    write_to_csv(args.output, ipv6_files)
    print("完成!")

if __name__ == "__main__":
    main()