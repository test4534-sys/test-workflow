#!/usr/bin/env python3
# log_manager.py

import subprocess
import logging
from typing import List, Dict
from datetime import datetime

logger = logging.getLogger(__name__)

class LogManager:
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
    
    def get_system_logs(self, limit: int = 20, service_filter: str = None, search_term: str = None) -> List[Dict]:
        """Get recent system logs from journalctl with optional filtering"""
        logs = []

        try:
            # Build journalctl command with filters
            cmd = "sudo journalctl --no-pager --output=short-iso"

            # Add service filter if specified
            if service_filter and service_filter != 'all':
                if service_filter == 'kernel':
                    cmd += " -k"
                else:
                    cmd += f" -u {service_filter}"

            # Add grep filter if search term is specified
            if search_term and search_term.strip():
                cmd += f" --grep='{search_term.strip()}'"

            # Add limit
            cmd += f" -n {limit}"

            returncode, stdout, stderr = self.execute_command(cmd)

            if returncode == 0:
                for line in stdout.strip().split('\n'):
                    if line.strip():
                        # Parse journalctl output
                        parts = line.split(' ', 3)
                        if len(parts) >= 4:
                            timestamp = parts[0]
                            hostname = parts[1]
                            raw_service = parts[2]
                            message = parts[3] if len(parts) > 3 else ''

                            # Extract base service name (remove [pid] and trailing :)
                            service = raw_service.split('[')[0].rstrip(':')

                            # Determine log level from message
                            level = 'info'
                            message_lower = message.lower()
                            if 'error' in message_lower or 'failed' in message_lower:
                                level = 'error'
                            elif 'warning' in message_lower or 'warn' in message_lower:
                                level = 'warning'
                            elif 'debug' in message_lower:
                                level = 'debug'

                            # Map service names
                            service_map = {
                                'systemd': 'system',
                                'kernel': 'kernel',
                                'NetworkManager': 'network',
                                'smbd': 'samba',
                                'nmbd': 'samba',
                                'targetcli': 'iscsi',
                                'iscsid': 'iscsi',
                                'zfs': 'zfs'
                            }

                            display_service = service_map.get(service, service)

                            logs.append({
                                'timestamp': timestamp,
                                'service': display_service,
                                'message': message,
                                'level': level
                            })

            # Reverse to show newest first
            logs.reverse()

        except Exception as e:
            logger.error(f"Error getting system logs: {e}")
            # Fallback to some sample logs if journalctl fails
            logs = self._get_fallback_logs()

        return logs
    
    def _get_fallback_logs(self) -> List[Dict]:
        """Fallback logs if journalctl is not available"""
        return [
            {
                'timestamp': datetime.now().isoformat(),
                'service': 'system',
                'message': 'Using fallback logs - journalctl not available',
                'level': 'warning'
            }
        ]
    
    def get_service_logs(self, service: str, limit: int = 10) -> List[Dict]:
        """Get logs for a specific service"""
        try:
            cmd = f"sudo journalctl -u {service} --no-pager -n {limit} --output=short-iso"
            returncode, stdout, stderr = self.execute_command(cmd)
            
            logs = []
            if returncode == 0:
                for line in stdout.strip().split('\n'):
                    if line.strip():
                        parts = line.split(' ', 3)
                        if len(parts) >= 4:
                            timestamp = parts[0]
                            message = parts[3] if len(parts) > 3 else ''
                            
                            logs.append({
                                'timestamp': timestamp,
                                'service': service,
                                'message': message,
                                'level': 'info'
                            })
            
            return logs
        except Exception as e:
            logger.error(f"Error getting logs for service {service}: {e}")
            return []
