#!/usr/bin/env python3
# service_manager.py

import subprocess
import logging
from typing import Dict, List

logger = logging.getLogger(__name__)

class ServiceManager:
    def __init__(self):
        self.services = {
            'samba': {
                'name': 'Samba File Sharing',
                'description': 'SMB/CIFS file sharing service',
                'service_names': ['smbd'],
                'display_name': 'Samba'
            },
            'iscsi': {
                'name': 'iSCSI Target',
                'description': 'iSCSI storage target service',
                'service_names': ['target'],  # ← Only target service, removed open-iscsi
                'display_name': 'iSCSI'
            },
            'zfs-target': {
                'name': 'ZFS Target',
                'description': 'ZFS filesystem target',
                'service_names': ['zfs.target'],
                'display_name': 'ZFS Target'
            },
            'zfs-import-cache': {
                'name': 'ZFS Import Cache',
                'description': 'ZFS import cache service',
                'service_names': ['zfs-import-cache.service'],
                'display_name': 'ZFS Import Cache'
            },
            'zfs-import-scan': {
                'name': 'ZFS Import Scan',
                'description': 'ZFS import scan service',
                'service_names': ['zfs-import-scan.service'],
                'display_name': 'ZFS Import Scan'
            }
        }
    
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
    
    def get_service_status(self, service_key: str) -> Dict:
        """Get detailed status for a specific service"""
        if service_key not in self.services:
            return {'success': False, 'message': f'Unknown service: {service_key}'}

        service_info = self.services[service_key]
        results = {}

        for service_name in service_info['service_names']:
            # Check if service exists and get its status
            returncode, stdout, stderr = self.execute_command(f"sudo systemctl is-active {service_name}")
            simple_status = stdout.strip() if returncode == 0 else 'inactive'

            # Get detailed status including UnitFileState for enable/disable status
            returncode, stdout, stderr = self.execute_command(f"sudo systemctl show {service_name} --property=ActiveState,SubState,LoadState,UnitFileState --no-pager")
            detailed_status = {}
            if returncode == 0:
                for line in stdout.strip().split('\n'):
                    if '=' in line:
                        key, value = line.split('=', 1)
                        detailed_status[key] = value
            else:
                # If we can't get detailed status, use the simple status
                detailed_status = {
                    'ActiveState': 'active' if simple_status == 'active' else 'inactive',
                    'SubState': 'running' if simple_status == 'active' else 'dead',
                    'UnitFileState': 'unknown'
                }

            results[service_name] = {
                'simple_status': simple_status,
                'detailed_status': detailed_status
            }

        # Determine overall service status
        all_running = all(
            result['detailed_status'].get('ActiveState') == 'active' and
            result['detailed_status'].get('SubState') in ['running', 'exited', 'active', 'reached']
            for result in results.values()
        )

        overall_status = 'running' if all_running else 'stopped'

        # Check if service is enabled/disabled (based on first component)
        first_component = next(iter(results.values()))
        unit_file_state = first_component['detailed_status'].get('UnitFileState', 'unknown')
        is_enabled = unit_file_state in ['enabled', 'enabled-runtime', 'static']

        return {
            'success': True,
            'service': service_info,
            'components': results,
            'overall_status': overall_status,
            'is_enabled': is_enabled
        }
    
    def get_all_services_status(self) -> Dict:
        """Get status for all managed services"""
        all_status = {}
        
        for service_key in self.services.keys():
            status = self.get_service_status(service_key)
            if status['success']:
                all_status[service_key] = status
        
        return {'success': True, 'services': all_status}
    
    def start_service(self, service_key: str) -> Dict:
        """Start a service"""
        if service_key not in self.services:
            return {'success': False, 'message': f'Unknown service: {service_key}'}
        
        service_info = self.services[service_key]
        results = {}
        
        for service_name in service_info['service_names']:
            returncode, stdout, stderr = self.execute_command(f"sudo systemctl start {service_name}")
            if returncode == 0:
                results[service_name] = {'success': True, 'message': 'Started successfully'}
            else:
                results[service_name] = {'success': False, 'message': stderr}
        
        # Check if all components started successfully
        all_success = all(result['success'] for result in results.values())
        
        return {
            'success': all_success,
            'service': service_info['display_name'],
            'components': results,
            'message': f"{service_info['display_name']} started successfully" if all_success else f"Failed to start {service_info['display_name']}"
        }
    
    def stop_service(self, service_key: str) -> Dict:
        """Stop a service"""
        if service_key not in self.services:
            return {'success': False, 'message': f'Unknown service: {service_key}'}
        
        service_info = self.services[service_key]
        results = {}
        
        for service_name in service_info['service_names']:
            returncode, stdout, stderr = self.execute_command(f"sudo systemctl stop {service_name}")
            if returncode == 0:
                results[service_name] = {'success': True, 'message': 'Stopped successfully'}
            else:
                results[service_name] = {'success': False, 'message': stderr}
        
        # Check if all components stopped successfully
        all_success = all(result['success'] for result in results.values())
        
        return {
            'success': all_success,
            'service': service_info['display_name'],
            'components': results,
            'message': f"{service_info['display_name']} stopped successfully" if all_success else f"Failed to stop {service_info['display_name']}"
        }
    
    def restart_service(self, service_key: str) -> Dict:
        """Restart a service"""
        if service_key not in self.services:
            return {'success': False, 'message': f'Unknown service: {service_key}'}
        
        service_info = self.services[service_key]
        results = {}
        
        for service_name in service_info['service_names']:
            returncode, stdout, stderr = self.execute_command(f"sudo systemctl restart {service_name}")
            if returncode == 0:
                results[service_name] = {'success': True, 'message': 'Restarted successfully'}
            else:
                results[service_name] = {'success': False, 'message': stderr}
        
        # Check if all components restarted successfully
        all_success = all(result['success'] for result in results.values())
        
        return {
            'success': all_success,
            'service': service_info['display_name'],
            'components': results,
            'message': f"{service_info['display_name']} restarted successfully" if all_success else f"Failed to restart {service_info['display_name']}"
        }
    
    def enable_service(self, service_key: str) -> Dict:
        """Enable a service to start at boot"""
        if service_key not in self.services:
            return {'success': False, 'message': f'Unknown service: {service_key}'}
        
        service_info = self.services[service_key]
        results = {}
        
        for service_name in service_info['service_names']:
            returncode, stdout, stderr = self.execute_command(f"sudo systemctl enable {service_name}")
            if returncode == 0:
                results[service_name] = {'success': True, 'message': 'Enabled successfully'}
            else:
                results[service_name] = {'success': False, 'message': stderr}
        
        all_success = all(result['success'] for result in results.values())
        
        return {
            'success': all_success,
            'service': service_info['display_name'],
            'components': results,
            'message': f"{service_info['display_name']} enabled successfully" if all_success else f"Failed to enable {service_info['display_name']}"
        }
    
    def disable_service(self, service_key: str) -> Dict:
        """Disable a service from starting at boot"""
        if service_key not in self.services:
            return {'success': False, 'message': f'Unknown service: {service_key}'}

        service_info = self.services[service_key]
        results = {}

        for service_name in service_info['service_names']:
            returncode, stdout, stderr = self.execute_command(f"sudo systemctl disable {service_name}")
            if returncode == 0:
                results[service_name] = {'success': True, 'message': 'Disabled successfully'}
            else:
                results[service_name] = {'success': False, 'message': stderr}

        all_success = all(result['success'] for result in results.values())

        return {
            'success': all_success,
            'service': service_info['display_name'],
            'components': results,
            'message': f"{service_info['display_name']} disabled successfully" if all_success else f"Failed to disable {service_info['display_name']}"
        }

    def get_service_logs(self, service_key: str, lines: int = 50) -> Dict:
        """Get logs for a specific service"""
        if service_key not in self.services:
            return {'success': False, 'message': f'Unknown service: {service_key}'}

        service_info = self.services[service_key]
        logs = {}

        for service_name in service_info['service_names']:
            returncode, stdout, stderr = self.execute_command(f"sudo journalctl -u {service_name} -n {lines} --no-pager")
            if returncode == 0:
                logs[service_name] = stdout.strip().split('\n')
            else:
                logs[service_name] = [f"Error getting logs: {stderr}"]

        return {
            'success': True,
            'service': service_info['display_name'],
            'logs': logs
        }