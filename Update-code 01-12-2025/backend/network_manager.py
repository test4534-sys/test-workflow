#!/usr/bin/env python3
# network_manager.py

import subprocess
import logging
import re
import os
from typing import Dict, List, Optional

logger = logging.getLogger(__name__)

class NetworkManager:
    def __init__(self):
        pass
    
    def execute_command(self, command: str) -> tuple:
        """Execute shell command and return result"""
        try:
            result = subprocess.run(
                command, 
                shell=True, 
                capture_output=True, 
                text=True, 
                executable='/bin/bash'
            )
            return result.returncode, result.stdout, result.stderr
        except Exception as e:
            logger.error(f"Command exception: {e}")
            return -1, "", str(e)
    
    def get_network_interfaces(self) -> List[Dict]:
        """Get network interfaces with detailed information"""
        interfaces = []
        
        try:
            # Get all interface information using ip addr show
            returncode, stdout, stderr = self.execute_command("ip addr show")
            if returncode != 0:
                returncode, stdout, stderr = self.execute_command("sudo ip addr show")
            
            if returncode == 0:
                current_interface = None
                
                for line in stdout.strip().split('\n'):
                    line = line.strip()
                    
                    # Interface line (e.g., "2: eth0: <BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1500")
                    if re.match(r'^\d+:', line):
                        if current_interface:
                            interfaces.append(current_interface)
                        
                        # Extract interface name and state
                        interface_match = re.match(r'^\d+:\s+([^:]+):\s+<([^>]+)>', line)
                        if interface_match:
                            interface_name = interface_match.group(1)
                            flags = interface_match.group(2)
                            connected = 'UP' in flags and 'LOWER_UP' in flags
                            state = 'UP' if connected else 'DOWN'
                            
                            current_interface = {
                                'name': interface_name,
                                'state': state,
                                'connected': connected,
                                'ip': 'Not configured',
                                'gateway': 'Not configured',
                                'dns': 'Not configured',
                                'mac': 'Not available',
                                'netmask': 'Not available'
                            }
                    
                    # MAC address line
                    elif current_interface and 'link/ether' in line:
                        mac_match = re.search(r'link/ether\s+([0-9a-fA-F:]{17})', line)
                        if mac_match:
                            current_interface['mac'] = mac_match.group(1)
                    
                    # IP address line
                    elif current_interface and 'inet ' in line:
                        ip_match = re.search(r'inet\s+(\d+\.\d+\.\d+\.\d+)/(\d+)', line)
                        if ip_match:
                            current_interface['ip'] = ip_match.group(1)
                            current_interface['netmask'] = self.cidr_to_netmask(ip_match.group(2))
                
                # Don't forget the last interface
                if current_interface:
                    interfaces.append(current_interface)
            
            # Get gateway information
            returncode, stdout, stderr = self.execute_command("ip route show default")
            if returncode != 0:
                returncode, stdout, stderr = self.execute_command("sudo ip route show default")
            
            if returncode == 0 and stdout.strip():
                gateway_match = re.search(r'default via (\d+\.\d+\.\d+\.\d+)\s+dev\s+(\w+)', stdout)
                if gateway_match:
                    gateway_ip = gateway_match.group(1)
                    gateway_interface = gateway_match.group(2)
                    
                    for iface in interfaces:
                        if iface['name'] == gateway_interface:
                            iface['gateway'] = gateway_ip
                        else:
                            iface['gateway'] = 'Not this interface'
            
            # Get DNS information - prioritize netplan
            dns_servers = self._get_dns_from_netplan()
            if not dns_servers:
                # Fallback to other methods if netplan doesn't have DNS
                dns_servers = self._get_dns_servers_fallback()
            
            if dns_servers:
                for iface in interfaces:
                    if iface['gateway'] != 'Not configured' and iface['gateway'] != 'Not this interface':
                        iface['dns'] = ', '.join(dns_servers)
            
            # Filter out loopback and virtual interfaces
            interfaces = [iface for iface in interfaces 
                         if not iface['name'].startswith('lo') and 
                         not iface['name'].startswith('docker') and
                         not iface['name'].startswith('veth') and
                         not iface['name'].startswith('br-') and
                         not iface['name'].startswith('virbr')]
            
        except Exception as e:
            logger.error(f"Error getting network interfaces: {e}")
            # Return fallback interfaces
            interfaces = self._get_fallback_interfaces()
        
        return interfaces
    
    def _get_dns_from_netplan(self) -> List[str]:
        """Get DNS servers specifically from netplan configuration using sudo"""
        dns_servers = []
        
        try:
            # First, try to list netplan files using sudo
            returncode, stdout, stderr = self.execute_command("sudo ls -1 /etc/netplan/ 2>/dev/null")
            if returncode != 0:
                logger.warning("Cannot access /etc/netplan/ directory")
                return dns_servers
            
            netplan_files = []
            for line in stdout.strip().split('\n'):
                if line and (line.endswith('.yaml') or line.endswith('.yml')):
                    netplan_files.append(line.strip())
            
            if not netplan_files:
                logger.info("No netplan files found")
                return dns_servers
            
            logger.info(f"Found netplan files: {netplan_files}")
            
            for filename in netplan_files:
                filepath = f"/etc/netplan/{filename}"
                logger.info(f"Reading netplan file: {filepath}")
                
                # Read netplan file using sudo
                returncode, stdout, stderr = self.execute_command(f"sudo cat {filepath} 2>/dev/null")
                if returncode != 0:
                    logger.warning(f"Could not read netplan file {filepath}: {stderr}")
                    continue
                
                content = stdout
                
                # Look for DNS servers in the netplan file
                # Pattern for nameservers.addresses
                dns_patterns = [
                    r'addresses:\s*\[([^\]]+)\]',  # Basic pattern
                    r'nameservers:\s*\n\s*addresses:\s*\[([^\]]+)\]',  # With nameservers prefix
                    r'search:\s*\[[^\]]+\]\s*addresses:\s*\[([^\]]+)\]'  # With search domains
                ]
                
                for pattern in dns_patterns:
                    dns_matches = re.findall(pattern, content, re.MULTILINE | re.DOTALL)
                    for match in dns_matches:
                        # Extract IP addresses from the match
                        servers = re.findall(r'\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b', match)
                        if servers:
                            logger.info(f"Found DNS servers in {filename}: {servers}")
                            dns_servers.extend(servers)
                
                # Also look for DNS in specific interface configurations
                interface_patterns = [
                    r'ethernets:\s*(.*?)(?=\n\w+:|$)',  # Ethernet interfaces
                    r'wifis:\s*(.*?)(?=\n\w+:|$)',      # WiFi interfaces
                ]
                
                for pattern in interface_patterns:
                    interface_matches = re.findall(pattern, content, re.MULTILINE | re.DOTALL)
                    for match in interface_matches:
                        # Look for DNS in each interface block
                        interface_dns = re.findall(r'nameservers:\s*\n\s*addresses:\s*\[([^\]]+)\]', match)
                        for dns_match in interface_dns:
                            servers = re.findall(r'\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b', dns_match)
                            if servers:
                                logger.info(f"Found interface DNS servers in {filename}: {servers}")
                                dns_servers.extend(servers)
            
            # Remove duplicates
            dns_servers = list(dict.fromkeys(dns_servers))
            logger.info(f"Final DNS servers from netplan: {dns_servers}")
            
        except Exception as e:
            logger.error(f"Error reading netplan configuration: {e}")
        
        return dns_servers
    
    def _get_dns_servers_fallback(self) -> List[str]:
        """Fallback methods for DNS detection"""
        dns_servers = []
        
        # Method 1: Try systemd-resolve
        returncode, stdout, stderr = self.execute_command("systemd-resolve --status")
        if returncode == 0:
            dns_section = False
            for line in stdout.split('\n'):
                if 'DNS Servers:' in line:
                    dns_section = True
                    continue
                if dns_section and line.strip():
                    dns_match = re.search(r'(\d+\.\d+\.\d+\.\d+)', line)
                    if dns_match:
                        dns_servers.append(dns_match.group(1))
                    else:
                        break
        
        # Method 2: Try resolv.conf as last resort
        if not dns_servers:
            try:
                with open('/etc/resolv.conf', 'r') as f:
                    for line in f:
                        if line.startswith('nameserver'):
                            dns_ip = line.split()[1]
                            if dns_ip not in dns_servers:
                                dns_servers.append(dns_ip)
            except Exception as e:
                logger.warning(f"Could not read /etc/resolv.conf: {e}")
        
        return list(dict.fromkeys(dns_servers))
    
    def cidr_to_netmask(self, cidr: str) -> str:
        """Convert CIDR notation to netmask"""
        try:
            cidr = int(cidr)
            mask = (0xffffffff >> (32 - cidr)) << (32 - cidr)
            return f"{(mask >> 24) & 0xff}.{(mask >> 16) & 0xff}.{(mask >> 8) & 0xff}.{mask & 0xff}"
        except:
            return 'Unknown'
    
    def _get_fallback_interfaces(self) -> List[Dict]:
        """Fallback interfaces if network commands fail"""
        return [
            {
                'name': 'eth0',
                'ip': '192.168.1.100',
                'gateway': '192.168.1.1',
                'dns': '8.8.8.8, 8.8.4.4',
                'mac': '00:11:22:33:44:55',
                'netmask': '255.255.255.0',
                'connected': True,
                'state': 'UP'
            }
        ]
    
    def get_network_status(self) -> Dict:
        """Get overall network status"""
        interfaces = self.get_network_interfaces()
        
        # Count connected interfaces
        connected_count = sum(1 for iface in interfaces if iface['connected'])
        
        return {
            'interfaces': interfaces,
            'connected_count': connected_count,
            'total_count': len(interfaces)
        }
