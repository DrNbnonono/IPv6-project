-- 插入网络协议数据
INSERT IGNORE INTO protocols (protocol_name, protocol_number, description, is_common, risk_level) VALUES
('HTTP', 80, 'Hypertext Transfer Protocol', TRUE, 'low'),
('HTTPS', 443, 'HTTP Secure', TRUE, 'low'),
('SSH', 22, 'Secure Shell', TRUE, 'medium'),
('Telnet', 23, 'Telnet Protocol', FALSE, 'high'),
('DNS', 53, 'Domain Name System', TRUE, 'low'),
('ICMP', 1, 'Internet Control Message Protocol', TRUE, 'low'),
('SNMP', 161, 'Simple Network Management Protocol', FALSE, 'high'),
('SMTP', 25, 'Simple Mail Transfer Protocol', TRUE, 'medium'),
('POP3', 110, 'Post Office Protocol v3', TRUE, 'medium'),
('IMAP', 143, 'Internet Message Access Protocol', TRUE, 'medium'),
('FTP', 21, 'File Transfer Protocol', FALSE, 'high'),
('TFTP', 69, 'Trivial File Transfer Protocol', FALSE, 'high'),
('NTP', 123, 'Network Time Protocol', TRUE, 'medium'),
('RDP', 3389, 'Remote Desktop Protocol', FALSE, 'high'),
('SMB', 445, 'Server Message Block', FALSE, 'high'),
('MySQL', 3306, 'MySQL Database Service', FALSE, 'high'),
('PostgreSQL', 5432, 'PostgreSQL Database Service', FALSE, 'high'),
('Redis', 6379, 'Redis Database Service', FALSE, 'high'),
('MongoDB', 27017, 'MongoDB Database Service', FALSE, 'high'),
('Memcached', 11211, 'Memcached Service', FALSE, 'high'),
('LDAP', 389, 'Lightweight Directory Access Protocol', FALSE, 'high'),
('LDAPS', 636, 'LDAP over SSL', FALSE, 'medium'),
('RPC', 111, 'Remote Procedure Call', FALSE, 'high'),
('NetBIOS', 137, 'NetBIOS Name Service', FALSE, 'high'),
('NetBIOS-DGM', 138, 'NetBIOS Datagram Service', FALSE, 'high'),
('NetBIOS-SSN', 139, 'NetBIOS Session Service', FALSE, 'high'),
('UPnP', 1900, 'Universal Plug and Play', FALSE, 'high'),
('CoAP', 5683, 'Constrained Application Protocol', FALSE, 'medium'),
('MQTT', 1883, 'Message Queuing Telemetry Transport', FALSE, 'medium'),
('AMQP', 5672, 'Advanced Message Queuing Protocol', FALSE, 'medium'),
('Kafka', 9092, 'Apache Kafka', FALSE, 'medium'),
('gRPC', 50051, 'Google Remote Procedure Call', FALSE, 'medium'),
('QUIC', 443, 'Quick UDP Internet Connections', TRUE, 'low'),
('IPsec', NULL, 'IP Security Protocol Suite', FALSE, 'medium'),
('OpenVPN', 1194, 'OpenVPN', FALSE, 'medium'),
('WireGuard', 51820, 'WireGuard VPN', FALSE, 'medium'),
('IKEv2', 500, 'Internet Key Exchange version 2', FALSE, 'medium'),
('L2TP', 1701, 'Layer 2 Tunneling Protocol', FALSE, 'medium'),
('PPTP', 1723, 'Point-to-Point Tunneling Protocol', FALSE, 'high'),
('SIP', 5060, 'Session Initiation Protocol', FALSE, 'medium'),
('RTP', 5004, 'Real-time Transport Protocol', FALSE, 'medium'),
('RTSP', 554, 'Real Time Streaming Protocol', FALSE, 'medium'),
('WebRTC', NULL, 'Web Real-Time Communication', FALSE, 'medium'),
('STUN', 3478, 'Session Traversal Utilities for NAT', FALSE, 'medium'),
('TURN', 3478, 'Traversal Using Relays around NAT', FALSE, 'medium'),
('RTMP', 1935, 'Real-Time Messaging Protocol', FALSE, 'medium'),
('HLS', NULL, 'HTTP Live Streaming', FALSE, 'low'),
('DASH', NULL, 'Dynamic Adaptive Streaming over HTTP', FALSE, 'low'),
('WebSocket', 80, 'WebSocket Protocol', TRUE, 'low'),
('WebSocket-SSL', 443, 'WebSocket over SSL', TRUE, 'low'),
('GraphQL', NULL, 'Graph Query Language', FALSE, 'low'),
('REST', NULL, 'Representational State Transfer', FALSE, 'low'),
('SOAP', NULL, 'Simple Object Access Protocol', FALSE, 'medium'),
('XML-RPC', NULL, 'XML Remote Procedure Call', FALSE, 'high'),
('JSON-RPC', NULL, 'JSON Remote Procedure Call', FALSE, 'medium'),
('gRPC-Web', NULL, 'gRPC for Web Clients', FALSE, 'medium'),
('Prometheus', 9090, 'Prometheus Monitoring', FALSE, 'medium'),
('Grafana', 3000, 'Grafana Dashboard', FALSE, 'medium'),
('Kibana', 5601, 'Kibana Dashboard', FALSE, 'medium'),
('Elasticsearch', 9200, 'Elasticsearch Service', FALSE, 'high'),
('Logstash', 5044, 'Logstash Service', FALSE, 'medium'),
('Filebeat', NULL, 'Filebeat Log Shipper', FALSE, 'medium'),
('Metricbeat', NULL, 'Metricbeat Metrics Shipper', FALSE, 'medium'),
('Packetbeat', NULL, 'Packetbeat Network Shipper', FALSE, 'medium'),
('Heartbeat', NULL, 'Heartbeat Uptime Monitor', FALSE, 'medium'),
('Auditbeat', NULL, 'Auditbeat Security Monitor', FALSE, 'medium'),
('Zabbix', 10051, 'Zabbix Monitoring', FALSE, 'medium'),
('Nagios', NULL, 'Nagios Monitoring', FALSE, 'medium'),
('Consul', 8500, 'Consul Service Discovery', FALSE, 'medium'),
('etcd', 2379, 'etcd Key-Value Store', FALSE, 'medium'),
('Vault', 8200, 'Vault Secrets Management', FALSE, 'high'),
('Nomad', 4646, 'Nomad Scheduler', FALSE, 'medium'),
('Terraform', NULL, 'Terraform Infrastructure', FALSE, 'medium'),
('Ansible', NULL, 'Ansible Configuration', FALSE, 'medium'),
('Puppet', 8140, 'Puppet Configuration', FALSE, 'medium'),
('Chef', NULL, 'Chef Configuration', FALSE, 'medium'),
('Salt', 4505, 'Salt Configuration', FALSE, 'medium'),
('Jenkins', 8080, 'Jenkins CI/CD', FALSE, 'medium'),
('GitLab', NULL, 'GitLab CI/CD', FALSE, 'medium'),
('GitHub', NULL, 'GitHub CI/CD', FALSE, 'medium'),
('Bitbucket', NULL, 'Bitbucket CI/CD', FALSE, 'medium'),
('Travis', NULL, 'Travis CI', FALSE, 'medium'),
('CircleCI', NULL, 'CircleCI', FALSE, 'medium'),
('Drone', NULL, 'Drone CI', FALSE, 'medium'),
('Argo', NULL, 'Argo Workflows', FALSE, 'medium'),
('Tekton', NULL, 'Tekton Pipelines', FALSE, 'medium'),
('Spinnaker', NULL, 'Spinnaker CD', FALSE, 'medium'),
('Flux', NULL, 'Flux CD', FALSE, 'medium'),
('ArgoCD', NULL, 'Argo CD', FALSE, 'medium'),
('Kubernetes', 6443, 'Kubernetes API', FALSE, 'high'),
('Docker', 2375, 'Docker API', FALSE, 'high'),
('Containerd', NULL, 'Containerd API', FALSE, 'high'),
('CRI-O', NULL, 'CRI-O API', FALSE, 'high'),
('Istio', NULL, 'Istio Service Mesh', FALSE, 'high'),
('Linkerd', NULL, 'Linkerd Service Mesh', FALSE, 'high'),
('Envoy', NULL, 'Envoy Proxy', FALSE, 'high'),
('Nginx', 80, 'Nginx Web Server', TRUE, 'low'),
('Apache', 80, 'Apache Web Server', TRUE, 'low'),
('Lighttpd', 80, 'Lighttpd Web Server', FALSE, 'low'),
('Caddy', 80, 'Caddy Web Server', FALSE, 'low'),
('Traefik', 80, 'Traefik Reverse Proxy', FALSE, 'low'),
('HAProxy', 80, 'HAProxy Load Balancer', FALSE, 'low'),
('Squid', 3128, 'Squid Proxy', FALSE, 'medium'),
('Varnish', 80, 'Varnish Cache', FALSE, 'low'),
('Memcached', 11211, 'Memcached Cache', FALSE, 'high'),
('Redis', 6379, 'Redis Cache', FALSE, 'high'),
('RabbitMQ', 5672, 'RabbitMQ Message Broker', FALSE, 'medium'),
('ActiveMQ', 61616, 'ActiveMQ Message Broker', FALSE, 'medium'),
('Kafka', 9092, 'Apache Kafka Message Broker', FALSE, 'medium'),
('NATS', 4222, 'NATS Message Broker', FALSE, 'medium'),
('MQTT', 1883, 'MQTT Message Broker', FALSE, 'medium'),
('AMQP', 5672, 'AMQP Message Broker', FALSE, 'medium'),
('STOMP', 61613, 'STOMP Message Broker', FALSE, 'medium'),
('ZeroMQ', NULL, 'ZeroMQ Message Broker', FALSE, 'medium'),
('NSQ', 4150, 'NSQ Message Broker', FALSE, 'medium'),
('Pulsar', 6650, 'Apache Pulsar Message Broker', FALSE, 'medium'),
('Celery', NULL, 'Celery Task Queue', FALSE, 'medium'),
('Airflow', NULL, 'Apache Airflow', FALSE, 'medium'),
('Luigi', NULL, 'Luigi Workflow', FALSE, 'medium'),
('Prefect', NULL, 'Prefect Workflow', FALSE, 'medium'),
('Dagster', NULL, 'Dagster Workflow', FALSE, 'medium'),
('Metaflow', NULL, 'Metaflow Workflow', FALSE, 'medium'),
('MLflow', NULL, 'MLflow Machine Learning', FALSE, 'medium'),
('Kubeflow', NULL, 'Kubeflow Machine Learning', FALSE, 'medium'),
('TensorFlow', NULL, 'TensorFlow Machine Learning', FALSE, 'medium'),
('PyTorch', NULL, 'PyTorch Machine Learning', FALSE, 'medium'),
('MXNet', NULL, 'MXNet Machine Learning', FALSE, 'medium'),
('Caffe', NULL, 'Caffe Machine Learning', FALSE, 'medium'),
('Theano', NULL, 'Theano Machine Learning', FALSE, 'medium'),
('ONNX', NULL, 'ONNX Machine Learning', FALSE, 'medium'),
('Scikit-learn', NULL, 'Scikit-learn Machine Learning', FALSE, 'medium'),
('XGBoost', NULL, 'XGBoost Machine Learning', FALSE, 'medium'),
('LightGBM', NULL, 'LightGBM Machine Learning', FALSE, 'medium'),
('CatBoost', NULL, 'CatBoost Machine Learning', FALSE, 'medium'),
('H2O', NULL, 'H2O Machine Learning', FALSE, 'medium'),
('Weka', NULL, 'Weka Machine Learning', FALSE, 'medium'),
('RapidMiner', NULL, 'RapidMiner Machine Learning', FALSE, 'medium'),
('KNIME', NULL, 'KNIME Machine Learning', FALSE, 'medium'),
('Orange', NULL, 'Orange Machine Learning', FALSE, 'medium'),
('BigML', NULL, 'BigML Machine Learning', FALSE, 'medium'),
('DataRobot', NULL, 'DataRobot Machine Learning', FALSE, 'medium'),
('Hugging Face', NULL, 'Hugging Face NLP', FALSE, 'medium'),
('SpaCy', NULL, 'SpaCy NLP', FALSE, 'medium'),
('NLTK', NULL, 'NLTK NLP', FALSE, 'medium'),
('Gensim', NULL, 'Gensim NLP', FALSE, 'medium'),
('AllenNLP', NULL, 'AllenNLP NLP', FALSE, 'medium'),
('Stanford NLP', NULL, 'Stanford NLP', FALSE, 'medium'),
('OpenNLP', NULL, 'OpenNLP NLP', FALSE, 'medium'),
('CoreNLP', NULL, 'CoreNLP NLP', FALSE, 'medium'),
('FastText', NULL, 'FastText NLP', FALSE, 'medium'),
('Word2Vec', NULL, 'Word2Vec NLP', FALSE, 'medium'),
('GloVe', NULL, 'GloVe NLP', FALSE, 'medium'),
('ELMo', NULL, 'ELMo NLP', FALSE, 'medium'),
('BERT', NULL, 'BERT NLP', FALSE, 'medium'),
('GPT', NULL, 'GPT NLP', FALSE, 'medium'),
('Transformer', NULL, 'Transformer NLP', FALSE, 'medium'),
('T5', NULL, 'T5 NLP', FALSE, 'medium'),
('BART', NULL, 'BART NLP', FALSE, 'medium'),
('XLNet', NULL, 'XLNet NLP', FALSE, 'medium'),
('RoBERTa', NULL, 'RoBERTa NLP', FALSE, 'medium'),
('DistilBERT', NULL, 'DistilBERT NLP', FALSE, 'medium'),
('ALBERT', NULL, 'ALBERT NLP', FALSE, 'medium'),
('ELECTRA', NULL, 'ELECTRA NLP', FALSE, 'medium'),
('DeBERTa', NULL, 'DeBERTa NLP', FALSE, 'medium'),
('Longformer', NULL, 'Longformer NLP', FALSE, 'medium'),
('Reformer', NULL, 'Reformer NLP', FALSE, 'medium'),
('IPsec-AH', 51, 'IPsec Authentication Header', FALSE, 'medium'),
('IPsec-ESP', 50, 'IPsec Encapsulating Security Payload', FALSE, 'medium'),
('GRE', 47, 'Generic Routing Encapsulation', FALSE, 'medium'),
('L2TPv3', NULL, 'Layer 2 Tunneling Protocol v3', FALSE, 'medium'),
('VXLAN', 4789, 'Virtual Extensible LAN', FALSE, 'medium'),
('Geneve', 6081, 'Generic Network Virtualization Encapsulation', FALSE, 'medium'),
('NVGRE', NULL, 'Network Virtualization using GRE', FALSE, 'medium'),
('STT', NULL, 'Stateless Transport Tunneling', FALSE, 'medium'),
('MPLS', NULL, 'Multiprotocol Label Switching', FALSE, 'medium'),
('OTV', NULL, 'Overlay Transport Virtualization', FALSE, 'medium'),
('FCoE', NULL, 'Fibre Channel over Ethernet', FALSE, 'medium'),
('iSCSI', 860, 'Internet Small Computer Systems Interface', FALSE, 'high'),
('FCIP', NULL, 'Fibre Channel over IP', FALSE, 'medium'),
('iFCP', NULL, 'Internet Fibre Channel Protocol', FALSE, 'medium'),
('SRP', NULL, 'SCSI RDMA Protocol', FALSE, 'medium'),
('AoE', NULL, 'ATA over Ethernet', FALSE, 'medium'),
('iWARP', NULL, 'Internet Wide Area RDMA Protocol', FALSE, 'medium'),
('RoCE', NULL, 'RDMA over Converged Ethernet', FALSE, 'medium'),
('InfiniBand', NULL, 'InfiniBand Protocol', FALSE, 'medium'),
('Fibre Channel', NULL, 'Fibre Channel Protocol', FALSE, 'medium'),
('SAS', NULL, 'Serial Attached SCSI', FALSE, 'medium'),
('SATA', NULL, 'Serial ATA', FALSE, 'medium'),
('NVMe', NULL, 'Non-Volatile Memory Express', FALSE, 'medium'),
('NVMe-oF', NULL, 'NVMe over Fabrics', FALSE, 'medium'),
('USB', NULL, 'Universal Serial Bus', FALSE, 'medium'),
('Thunderbolt', NULL, 'Thunderbolt Interface', FALSE, 'medium'),
('PCIe', NULL, 'PCI Express', FALSE, 'medium'),
('CXL', NULL, 'Compute Express Link', FALSE, 'medium'),
('HDMI', NULL, 'High-Definition Multimedia Interface', FALSE, 'medium'),
('DisplayPort', NULL, 'DisplayPort Interface', FALSE, 'medium'),
('VGA', NULL, 'Video Graphics Array', FALSE, 'medium'),
('DVI', NULL, 'Digital Visual Interface', FALSE, 'medium'),
('SDI', NULL, 'Serial Digital Interface', FALSE, 'medium'),
('AES67', NULL, 'Audio over IP Standard', FALSE, 'medium'),
('Dante', NULL, 'Dante Audio over IP', FALSE, 'medium'),
('RAVENNA', NULL, 'RAVENNA Audio over IP', FALSE, 'medium'),
('Livewire', NULL, 'Livewire Audio over IP', FALSE, 'medium'),
('Q-LAN', NULL, 'QSC Q-LAN Audio over IP', FALSE, 'medium'),
('AVB', NULL, 'Audio Video Bridging', FALSE, 'medium'),
('TSN', NULL, 'Time-Sensitive Networking', FALSE, 'medium'),
('PTP', 319, 'Precision Time Protocol', FALSE, 'medium'),
('NTPv4', 123, 'Network Time Protocol v4', TRUE, 'medium'),
('SNTP', 123, 'Simple Network Time Protocol', TRUE, 'medium'),
('IRIG', NULL, 'Inter-Range Instrumentation Group Time Code', FALSE, 'medium'),
('PPS', NULL, 'Pulse Per Second', FALSE, 'medium'),
('GPS', NULL, 'Global Positioning System Time', FALSE, 'medium'),
('GLONASS', NULL, 'GLONASS Time', FALSE, 'medium'),
('Galileo', NULL, 'Galileo Time', FALSE, 'medium'),
('BeiDou', NULL, 'BeiDou Time', FALSE, 'medium'),
('IEEE 1588', NULL, 'IEEE 1588 Precision Time Protocol', FALSE, 'medium'),
('White Rabbit', NULL, 'White Rabbit Precision Time Protocol', FALSE, 'medium'),
('SyncE', NULL, 'Synchronous Ethernet', FALSE, 'medium'),
('BITS', NULL, 'Building Integrated Timing Supply', FALSE, 'medium'),
('SONET', NULL, 'Synchronous Optical Networking', FALSE, 'medium'),
('SDH', NULL, 'Synchronous Digital Hierarchy', FALSE, 'medium'),
('OTN', NULL, 'Optical Transport Network', FALSE, 'medium'),
('DWDM', NULL, 'Dense Wavelength Division Multiplexing', FALSE, 'medium'),
('CWDM', NULL, 'Coarse Wavelength Division Multiplexing', FALSE, 'medium'),
('Dark Fiber', NULL, 'Dark Fiber Network', FALSE, 'medium'),
('Dark Light', NULL, 'Dark Light Network', FALSE, 'medium'),
('LiFi', NULL, 'Light Fidelity', FALSE, 'medium'),
('Free Space Optics', NULL, 'Free Space Optical Communication', FALSE, 'medium'),
('PLC', NULL, 'Power Line Communication', FALSE, 'medium'),
('HomePlug', NULL, 'HomePlug Powerline Alliance', FALSE, 'medium'),
('G.hn', NULL, 'G.hn Home Networking', FALSE, 'medium'),
('MoCA', NULL, 'Multimedia over Coax Alliance', FALSE, 'medium'),
('HomePNA', NULL, 'Home Phoneline Networking Alliance', FALSE, 'medium'),
('HomeRF', NULL, 'Home Radio Frequency', FALSE, 'medium'),
('Z-Wave', NULL, 'Z-Wave Home Automation', FALSE, 'medium'),
('Zigbee', NULL, 'Zigbee Home Automation', FALSE, 'medium'),
('Thread', NULL, 'Thread Home Automation', FALSE, 'medium'),
('Matter', NULL, 'Matter Home Automation', FALSE, 'medium'),
('KNX', NULL, 'KNX Home Automation', FALSE, 'medium'),
('LonWorks', NULL, 'LonWorks Home Automation', FALSE, 'medium'),
('BACnet', 47808, 'Building Automation and Control Networks', FALSE, 'medium'),
('Modbus', 502, 'Modbus Protocol', FALSE, 'high'),
('DNP3', 20000, 'Distributed Network Protocol 3', FALSE, 'high'),
('IEC 60870', NULL, 'IEC 60870 Telecontrol Protocol', FALSE, 'high'),
('IEC 61850', NULL, 'IEC 61850 Power Utility Automation', FALSE, 'high'),
('IEC 62351', NULL, 'IEC 62351 Security for Power Systems', FALSE, 'high'),
('OPC UA', 4840, 'OPC Unified Architecture', FALSE, 'high'),
('OPC DA', NULL, 'OPC Data Access', FALSE, 'high'),
('OPC HDA', NULL, 'OPC Historical Data Access', FALSE, 'high'),
('OPC A&E', NULL, 'OPC Alarms and Events', FALSE, 'high'),
('OPC XML-DA', NULL, 'OPC XML Data Access', FALSE, 'high'),
('MTConnect', NULL, 'MTConnect Manufacturing Protocol', FALSE, 'medium'),
('PROFINET', NULL, 'PROFINET Industrial Ethernet', FALSE, 'high'),
('EtherCAT', NULL, 'EtherCAT Industrial Ethernet', FALSE, 'high'),
('EtherNet/IP', 44818, 'EtherNet/IP Industrial Protocol', FALSE, 'high'),
('DeviceNet', NULL, 'DeviceNet Industrial Protocol', FALSE, 'high'),
('ControlNet', NULL, 'ControlNet Industrial Protocol', FALSE, 'high'),
('CAN', NULL, 'Controller Area Network', FALSE, 'medium'),
('CANopen', NULL, 'CANopen Industrial Protocol', FALSE, 'medium'),
('J1939', NULL, 'SAE J1939 Vehicle Bus', FALSE, 'medium'),
('FlexRay', NULL, 'FlexRay Vehicle Bus', FALSE, 'medium'),
('LIN', NULL, 'Local Interconnect Network', FALSE, 'medium'),
('MOST', NULL, 'Media Oriented Systems Transport', FALSE, 'medium'),
('AFDX', NULL, 'Avionics Full-Duplex Switched Ethernet', FALSE, 'medium'),
('ARINC 429', NULL, 'ARINC 429 Avionics Bus', FALSE, 'medium'),
('ARINC 664', NULL, 'ARINC 664 Avionics Ethernet', FALSE, 'medium'),
('ARINC 825', NULL, 'ARINC 825 Avionics CAN', FALSE, 'medium'),
('MIL-STD-1553', NULL, 'MIL-STD-1553 Military Bus', FALSE, 'medium'),
('SpaceWire', NULL, 'SpaceWire Spacecraft Bus', FALSE, 'medium'),
('IEEE 1394', NULL, 'IEEE 1394 FireWire', FALSE, 'medium'),
('USB Attached SCSI', NULL, 'USB Attached SCSI Protocol', FALSE, 'medium'),
('Thunderbolt Networking', NULL, 'Thunderbolt Networking Protocol', FALSE, 'medium'),
('AppleTalk', NULL, 'AppleTalk Protocol Suite', FALSE, 'medium'),
('IPX/SPX', NULL, 'IPX/SPX Protocol Suite', FALSE, 'medium'),
('NetBEUI', NULL, 'NetBIOS Extended User Interface', FALSE, 'medium'),
('DECnet', NULL, 'DECnet Protocol Suite', FALSE, 'medium'),
('Banyan VINES', NULL, 'Banyan VINES Protocol Suite', FALSE, 'medium'),
('XNS', NULL, 'Xerox Network Systems', FALSE, 'medium'),
('Chaosnet', NULL, 'Chaosnet Protocol', FALSE, 'medium'),
('CLNP', NULL, 'Connectionless Network Protocol', FALSE, 'medium'),
('TP4', NULL, 'OSI Transport Protocol Class 4', FALSE, 'medium');